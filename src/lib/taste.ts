import type { Movie } from "./tmdb";

// A small content-based recommender that runs entirely in the browser.
// The taste profile is a set of weights over genres, languages and keywords,
// seeded by the onboarding pills and nudged by every reaction.

export type Verdict = "love" | "nope" | "meh" | "unseen" | "seen";

export interface Taste {
  v: 1;
  langs: string[];
  pills: string[];
  genre: Record<number, number>;
  lang: Record<string, number>;
  keyword: Record<number, number>;
  rated: Record<number, Verdict>;
  loved: { id: number; title: string }[];
  vibe?: { sentence: string; tags: string[] };
  onboarded: boolean;
}

const KEY = "cineverse.taste.v1";
export const DELTA: Record<Verdict, number> = { love: 1, nope: -1, meh: -0.3, unseen: 0, seen: 0.2 };

export function emptyTaste(): Taste {
  return { v: 1, langs: [], pills: [], genre: {}, lang: {}, keyword: {}, rated: {}, loved: [], onboarded: false };
}

export function loadTaste(): Taste | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Taste) : null;
  } catch {
    return null;
  }
}

export function saveTaste(t: Taste) {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* private mode or storage full: the session still works in memory */
  }
}

export function resetTaste() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

/** Seed weights from the onboarding pills. */
export function seed(t: Taste, langs: string[], genres: number[], pills: string[]): Taste {
  const next = { ...t, langs, pills, genre: { ...t.genre }, lang: { ...t.lang } };
  for (const l of langs) next.lang[l] = (next.lang[l] ?? 0) + 1.5;
  for (const g of genres) next.genre[g] = (next.genre[g] ?? 0) + 1;
  return next;
}

/** Learn from one reaction. Pure: returns a new profile. */
export function learn(t: Taste, m: Movie, verdict: Verdict, keywordIds: number[] = []): Taste {
  const d = DELTA[verdict];
  const next: Taste = {
    ...t,
    genre: { ...t.genre },
    lang: { ...t.lang },
    keyword: { ...t.keyword },
    rated: { ...t.rated, [m.id]: verdict },
    loved: verdict === "love" ? [{ id: m.id, title: m.title }, ...t.loved.filter((x) => x.id !== m.id)].slice(0, 12) : t.loved.filter((x) => x.id !== m.id || verdict !== "nope"),
  };
  if (d !== 0) {
    const g = m.genre_ids ?? [];
    for (const id of g) next.genre[id] = (next.genre[id] ?? 0) + d / Math.sqrt(g.length || 1);
    next.lang[m.original_language] = (next.lang[m.original_language] ?? 0) + d * 0.5;
    for (const k of keywordIds.slice(0, 12)) next.keyword[k] = (next.keyword[k] ?? 0) + d * 0.6;
  }
  return next;
}

/** Add keyword evidence once a film's keywords are known (fetched after the reaction). */
export function learnKeywords(t: Taste, verdict: Verdict, keywordIds: number[]): Taste {
  const d = DELTA[verdict] * 0.6;
  if (!d || !keywordIds.length) return t;
  const keyword = { ...t.keyword };
  for (const k of keywordIds.slice(0, 12)) keyword[k] = (keyword[k] ?? 0) + d;
  return { ...t, keyword };
}

export interface MoodFilter {
  include: number[];
  exclude: number[];
}

/** Score a candidate. Higher is better; -Infinity means never show it. */
export function score(t: Taste, m: Movie, mood?: MoodFilter, keywordIds: number[] = []): number {
  if (t.rated[m.id] && t.rated[m.id] !== "unseen") return -Infinity;
  const g = m.genre_ids ?? [];
  if (mood?.exclude.some((x) => g.includes(x))) return -Infinity;

  const norm = (o: Record<string | number, number>) => Math.max(1, ...Object.values(o).map(Math.abs));
  const gN = norm(t.genre);
  const genreFit = g.reduce((s, id) => s + (t.genre[id] ?? 0) / gN, 0) / Math.sqrt(g.length || 1);
  const langFit = (t.lang[m.original_language] ?? -0.5) / norm(t.lang);
  const kN = norm(t.keyword);
  const kwFit = keywordIds.reduce((s, k) => s + (t.keyword[k] ?? 0) / kN, 0) * 0.3;
  const moodFit = mood ? mood.include.filter((x) => g.includes(x)).length * 0.8 : 0;
  const quality = ((m.vote_average ?? 6) - 6) * 0.15 + Math.min(1, Math.log10((m.vote_count ?? 1) + 1) / 4) * 0.3;
  return genreFit * 1.2 + langFit + kwFit + moodFit + quality;
}

export function rank(t: Taste, movies: Movie[], mood?: MoodFilter, n = 12): Movie[] {
  const seen = new Set<number>();
  return movies
    .filter((m) => m.poster_path && !seen.has(m.id) && seen.add(m.id))
    .map((m) => ({ m, s: score(t, m, mood) }))
    .filter((x) => Number.isFinite(x.s))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.m);
}

/** Top genre ids by learned weight, for building queries and offline "vibe" text. */
export function topGenres(t: Taste, n = 3): number[] {
  return Object.entries(t.genre)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => Number(id));
}
