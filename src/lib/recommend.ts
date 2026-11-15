import { FREE_FILMS, GENRES, LANGUAGES } from "./catalog";
import { discover, recommendationsFor, resolveTitle, type Movie } from "./tmdb";
import { rank, topGenres, type MoodFilter, type Taste } from "./taste";

const shuffle = <T,>(xs: T[]) => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
const settled = async <T,>(ps: Promise<T[]>[]) => (await Promise.allSettled(ps)).flatMap((r) => (r.status === "fulfilled" ? r.value : []));

export function pillCodes(picked: string[]) {
  const langs = LANGUAGES.filter((p) => picked.includes(p.id)).flatMap((p) => p.codes as string[]);
  const genrePills = GENRES.filter((p) => picked.includes(p.id));
  return { langs, genrePills, genres: [...new Set(genrePills.flatMap((p) => p.codes as number[]))] };
}

/**
 * Swipe deck for onboarding: well-known films in the picked languages and genres,
 * mixed so each language shows up, plus a few divisive ones (they teach more).
 */
export async function onboardingDeck(picked: string[], size = 12): Promise<Movie[]> {
  const { langs, genrePills } = pillCodes(picked);
  const langList = langs.length ? langs : ["en", "hi"];
  const genreQs = genrePills.length ? genrePills.map((p) => (p.codes as number[]).join(",")) : [""];
  const calls: Promise<Movie[]>[] = [];
  for (const l of langList) {
    for (const g of genreQs.slice(0, 3)) {
      calls.push(discover({ with_original_language: l, with_genres: g || undefined, "vote_count.gte": l === "en" ? 2000 : 150, sort_by: "vote_count.desc" }));
    }
  }
  const all = await settled(calls);
  const byLang = new Map<string, Movie[]>();
  const seen = new Set<number>();
  for (const m of all) {
    if (!m.poster_path || seen.has(m.id)) continue;
    seen.add(m.id);
    byLang.set(m.original_language, [...(byLang.get(m.original_language) ?? []), m]);
  }
  // Round-robin across languages so the deck isn't all one industry.
  const pools = [...byLang.values()].map((xs) => shuffle(xs.slice(0, 10)));
  const deck: Movie[] = [];
  while (deck.length < size && pools.some((p) => p.length)) for (const p of pools) if (p.length && deck.length < size) deck.push(p.shift()!);
  return deck;
}

/** Everyday picks: discover by taste (+ mood), recommendations from loved films, AI-suggested titles. */
export async function picksFor(t: Taste, mood?: MoodFilter & { titles?: { title: string; year?: number }[]; languages?: string[] }, n = 10) {
  const langs = mood?.languages?.length ? mood.languages : t.langs.length ? t.langs : ["en"];
  const genres = mood?.include.length ? mood.include : topGenres(t, 3);
  const without = mood?.exclude.length ? mood.exclude.join(",") : undefined;
  const calls: Promise<Movie[]>[] = [];
  for (const l of langs.slice(0, 4)) {
    calls.push(discover({ with_original_language: l, with_genres: genres.join("|") || undefined, without_genres: without, "vote_count.gte": l === "en" ? 300 : 40, sort_by: "popularity.desc" }));
    calls.push(discover({ with_original_language: l, with_genres: genres.join("|") || undefined, without_genres: without, "vote_count.gte": l === "en" ? 1000 : 80, sort_by: "vote_average.desc" }));
  }
  if (!mood?.include.length) for (const l of t.loved.slice(0, 3)) calls.push(recommendationsFor(l.id));
  const aiTitles = (mood?.titles ?? []).slice(0, 8);
  const aiPicks = Promise.all(aiTitles.map((x) => resolveTitle(x.title, x.year).catch(() => null))).then((xs) => xs.filter((x): x is Movie => !!x));
  const [pool, suggested] = await Promise.all([settled(calls), aiPicks]);
  // AI-suggested titles get a head start but still pass through the taste ranking.
  const ranked = rank(t, [...suggested, ...pool], mood, n * 2);
  const boosted = [...suggested.filter((m) => ranked.some((r) => r.id === m.id)), ...ranked];
  const out: Movie[] = [];
  for (const m of boosted) if (!out.some((x) => x.id === m.id)) out.push(m);
  return out.slice(0, n);
}

export async function becauseYouLoved(t: Taste, n = 12) {
  const anchor = t.loved[0];
  if (!anchor) return null;
  const recs = await recommendationsFor(anchor.id).catch(() => [] as Movie[]);
  return { title: anchor.title, movies: rank(t, recs, undefined, n) };
}

export async function freeFilms() {
  const found = await Promise.all(
    FREE_FILMS.map(async (f) => {
      const m = await resolveTitle(f.title, f.year).catch(() => null);
      return m ? { ...m, archiveId: f.archiveId } : null;
    }),
  );
  return found.filter((x): x is Movie & { archiveId: string } => !!x);
}

export const archiveIdFor = (m: Movie) => {
  const y = m.release_date ? Number(m.release_date.slice(0, 4)) : 0;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return FREE_FILMS.find((f) => norm(f.title) === norm(m.title) && Math.abs(f.year - y) <= 1)?.archiveId;
};
