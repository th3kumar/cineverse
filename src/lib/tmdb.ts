import { API_BASE, REGION } from "./config";

// All TMDB calls go through the Worker (/tmdb/...), which adds the key and caches responses.
// Images come straight from TMDB's CDN and need no key.

export interface Movie {
  id: number;
  title: string;
  original_language: string;
  release_date?: string;
  genre_ids: number[];
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
}

export interface MovieDetails extends Movie {
  runtime?: number;
  genres?: { id: number; name: string }[];
  videos?: { results: { site: string; type: string; key: string; official?: boolean }[] };
  keywords?: { keywords: { id: number; name: string }[] };
}

export interface Provider {
  name: string;
  logo?: string;
  type: "Stream" | "Free" | "Free with ads" | "Rent" | "Buy";
}

export const img = (path: string | null | undefined, size: "w185" | "w342" | "w500" | "w780" | "w1280") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined;

export const year = (m: Pick<Movie, "release_date">) => (m.release_date ? Number(m.release_date.slice(0, 4)) : undefined);

const memo = new Map<string, Promise<unknown>>();

export class ApiUnavailable extends Error {}

export async function tmdb<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  if (!API_BASE) throw new ApiUnavailable("NEXT_PUBLIC_API_BASE is not set");
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const url = `${API_BASE}/tmdb${path}${qs.size ? `?${qs}` : ""}`;
  if (!memo.has(url)) {
    memo.set(
      url,
      fetch(url).then(async (r) => {
        if (!r.ok) {
          memo.delete(url);
          throw new Error(`TMDB ${r.status}`);
        }
        return r.json();
      }),
    );
  }
  return memo.get(url) as Promise<T>;
}

type Page = { results: Movie[] };

export const discover = (p: Record<string, string | number | undefined>) =>
  tmdb<Page>("/discover/movie", { include_adult: "false", sort_by: "popularity.desc", ...p }).then((r) => r.results);

export const recommendationsFor = (id: number) => tmdb<Page>(`/movie/${id}/recommendations`).then((r) => r.results);

export const searchMovie = (query: string, y?: number) =>
  tmdb<Page>("/search/movie", { query, year: y, include_adult: "false" }).then((r) => r.results);

export const details = (id: number) =>
  tmdb<MovieDetails>(`/movie/${id}`, { append_to_response: "videos,keywords" });

export async function providers(id: number): Promise<{ list: Provider[]; link?: string }> {
  type R = { results: Record<string, { link?: string } & Record<string, { provider_name: string; logo_path?: string }[]>> };
  const r = (await tmdb<R>(`/movie/${id}/watch/providers`)).results?.[REGION];
  if (!r) return { list: [] };
  const map: [string, Provider["type"]][] = [["free", "Free"], ["ads", "Free with ads"], ["flatrate", "Stream"], ["rent", "Rent"], ["buy", "Buy"]];
  const seen = new Set<string>();
  const list: Provider[] = [];
  for (const [key, type] of map) {
    for (const p of (r[key] as { provider_name: string; logo_path?: string }[] | undefined) ?? []) {
      if (seen.has(p.provider_name)) continue;
      seen.add(p.provider_name);
      list.push({ name: p.provider_name, logo: img(p.logo_path, "w185"), type });
    }
  }
  return { list, link: r.link as unknown as string | undefined };
}

/** Find the real TMDB film for an AI-suggested title. Returns null for made-up titles. */
export async function resolveTitle(title: string, y?: number): Promise<Movie | null> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const want = norm(title);
  let results = await searchMovie(title, y).catch(() => [] as Movie[]);
  if (!results.length && y) results = await searchMovie(title).catch(() => [] as Movie[]);
  const ok = results.filter((m) => {
    const n = norm(m.title);
    const yOk = !y || !m.release_date || Math.abs((year(m) ?? y) - y) <= 1;
    return yOk && (n === want || (n.length > 3 && (n.includes(want) || want.includes(n))));
  });
  return ok.sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))[0] ?? null;
}
