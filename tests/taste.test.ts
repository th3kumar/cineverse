import { describe, expect, it } from "vitest";
import { emptyTaste, learn, learnKeywords, rank, score, seed, topGenres } from "../src/lib/taste";
import { offlineMood } from "../src/lib/ai";
import type { Movie } from "../src/lib/tmdb";

const m = (id: number, genre_ids: number[], lang = "hi", extra: Partial<Movie> = {}): Movie => ({
  id, title: `Film ${id}`, original_language: lang, genre_ids, poster_path: `/p${id}.jpg`, vote_average: 7, vote_count: 1000, ...extra,
});

describe("taste learner", () => {
  it("seeds from onboarding pills", () => {
    const t = seed(emptyTaste(), ["hi", "ko"], [53, 27], ["hi", "ko", "thriller", "horror"]);
    expect(t.lang.hi).toBeGreaterThan(0);
    expect(topGenres(t)).toEqual(expect.arrayContaining([53, 27]));
  });

  it("loving a film raises its genres and language; disliking lowers them", () => {
    let t = seed(emptyTaste(), ["hi"], [53], []);
    t = learn(t, m(1, [35, 10749], "ko"), "love");
    expect(t.genre[35]).toBeGreaterThan(0);
    expect(t.lang.ko).toBeGreaterThan(0);
    expect(t.loved[0].id).toBe(1);
    t = learn(t, m(2, [27]), "nope");
    expect(t.genre[27]).toBeLessThan(0);
  });

  it("never re-suggests rated or seen films, but keeps 'haven't seen' eligible", () => {
    let t = seed(emptyTaste(), ["hi"], [53], []);
    t = learn(t, m(1, [53]), "seen");
    t = learn(t, m(2, [53]), "nope");
    t = learn(t, m(3, [53]), "unseen");
    expect(score(t, m(1, [53]))).toBe(-Infinity);
    expect(score(t, m(2, [53]))).toBe(-Infinity);
    expect(Number.isFinite(score(t, m(3, [53])))).toBe(true);
  });

  it("ranks films matching the learned taste first", () => {
    let t = seed(emptyTaste(), ["hi"], [53], []);
    t = learn(t, m(10, [53, 9648]), "love");
    t = learn(t, m(11, [10749]), "nope");
    const ranked = rank(t, [m(1, [10749]), m(2, [53, 9648]), m(3, [35], "en")], undefined, 3);
    expect(ranked[0].id).toBe(2);
    expect(ranked.at(-1)!.id).not.toBe(2);
  });

  it("mood excludes are hard filters", () => {
    const t = seed(emptyTaste(), ["hi"], [27], []);
    expect(score(t, m(1, [27]), { include: [35], exclude: [27] })).toBe(-Infinity);
  });

  it("keywords add evidence", () => {
    const t = learnKeywords(emptyTaste(), "love", [101, 102]);
    expect(t.keyword[101]).toBeGreaterThan(0);
  });
});

describe("offline mood fallback (works with no AI)", () => {
  it("maps common phrases to genres", () => {
    const p = offlineMood("something scary but funny, no gore");
    expect(p.include).toEqual(expect.arrayContaining([27, 35]));
  });
  it("uses preset filters for mood chips", () => {
    expect(offlineMood("make me laugh").include).toContain(35);
  });
});
