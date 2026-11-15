import { cached, TTL } from "../infra/cache";
import { fetchJson, type FetchLike } from "../infra/http";
import type { AvailabilityProvider, Cache, MetadataProvider } from "../ports";
import type { MovieDetails, MovieId, MovieSummary, WatchOption, WatchType } from "../types";

const IMG = "https://image.tmdb.org/t/p";

/** Thin TMDB client shared by the metadata and availability adapters. Accepts a v4 read token or a v3 api key. */
export class TmdbClient {
  constructor(
    private readonly credential: string,
    private readonly cache: Cache,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly baseUrl = "https://api.themoviedb.org/3",
  ) {}

  private get isBearer() {
    return this.credential.startsWith("eyJ"); // v4 read access tokens are JWTs
  }

  get<T>(path: string, params: Record<string, string | number | undefined> = {}, ttl: number = TTL.day): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
    if (!this.isBearer) qs.set("api_key", this.credential);
    const url = `${this.baseUrl}${path}?${qs}`;
    const headers: Record<string, string> = this.isBearer ? { authorization: `Bearer ${this.credential}` } : {};
    return cached(this.cache, `tmdb:${path}?${qs}`, ttl, () => fetchJson<T>(url, { headers }, this.fetchImpl));
  }
}

interface TmdbMovie {
  id: number;
  title: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  overview?: string;
  runtime?: number;
  genres?: { name: string }[];
  external_ids?: { imdb_id?: string | null };
  videos?: { results: { site: string; type: string; key: string; name: string; official?: boolean }[] };
}

const toId = (n: number): MovieId => `tmdb:${n}`;
const fromId = (id: MovieId) => {
  const [ns, raw] = id.split(":");
  if (ns !== "tmdb" || !raw) throw new Error(`Not a TMDB id: ${id}`);
  return Number(raw);
};
const year = (d?: string) => (d ? Number(d.slice(0, 4)) || undefined : undefined);

function summary(m: TmdbMovie): MovieSummary {
  return {
    id: toId(m.id),
    title: m.title,
    year: year(m.release_date),
    posterUrl: m.poster_path ? `${IMG}/w500${m.poster_path}` : undefined,
    rating: m.vote_average,
  };
}

export class TmdbMetadata implements MetadataProvider {
  readonly name = "tmdb";
  readonly attribution = "This product uses the TMDB API but is not endorsed or certified by TMDB.";
  constructor(private readonly tmdb: TmdbClient) {}

  async search(title: string, y?: number): Promise<MovieSummary | null> {
    type R = { results: TmdbMovie[] };
    let { results } = await this.tmdb.get<R>("/search/movie", { query: title, year: y, include_adult: "false" });
    // AI years are sometimes off by one — retry without the year before declaring a hallucination.
    if (!results.length && y) ({ results } = await this.tmdb.get<R>("/search/movie", { query: title }));
    // Only accept a result whose title really matches — TMDB search is fuzzy and would otherwise
    // "verify" a made-up title by returning something vaguely similar.
    const want = norm(title);
    const titleOk = (m: TmdbMovie) =>
      [m.title, m.original_title].some((t) => {
        const n = norm(t ?? "");
        return n === want || (n.length > 3 && (n.includes(want) || want.includes(n)));
      });
    const yearOk = (m: TmdbMovie) => !y || !m.release_date || Math.abs((year(m.release_date) ?? y) - y) <= 1;
    const candidates = results.filter((m) => titleOk(m) && yearOk(m));
    if (!candidates.length) return null;
    const exact = candidates.find((m) => norm(m.title) === want);
    const best = exact ?? candidates.sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))[0];
    return summary(best);
  }

  async details(id: MovieId): Promise<MovieDetails> {
    const m = await this.tmdb.get<TmdbMovie>(`/movie/${fromId(id)}`, {
      append_to_response: "videos,external_ids",
    });
    const trailers = (m.videos?.results ?? [])
      .filter((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"))
      .sort((a, b) => Number(b.official) - Number(a.official) || Number(b.type === "Trailer") - Number(a.type === "Trailer"))
      .map((v) => ({ site: "youtube" as const, key: v.key, name: v.name }));
    return {
      ...summary(m),
      overview: m.overview,
      backdropUrl: m.backdrop_path ? `${IMG}/w1280${m.backdrop_path}` : undefined,
      genres: (m.genres ?? []).map((g) => g.name),
      runtimeMin: m.runtime || undefined,
      imdbId: m.external_ids?.imdb_id ?? undefined,
      trailers,
    };
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

interface TmdbProviders {
  results: Record<
    string,
    { link?: string } & Partial<Record<"flatrate" | "free" | "ads" | "rent" | "buy", { provider_name: string; logo_path?: string }[]>>
  >;
}

const TYPE_MAP: Record<string, WatchType> = {
  flatrate: "subscription",
  free: "free",
  ads: "ads",
  rent: "rent",
  buy: "buy",
};

/** TMDB "watch/providers" — data powered by JustWatch. Gives one TMDB link per region, not per-platform deep links. */
export class TmdbAvailability implements AvailabilityProvider {
  readonly name = "tmdb";
  readonly attribution = "Streaming availability data provided by JustWatch.";
  constructor(private readonly tmdb: TmdbClient) {}

  async whereToWatch(movie: MovieDetails, region: string): Promise<WatchOption[]> {
    if (!movie.id.startsWith("tmdb:")) return [];
    const res = await this.tmdb.get<TmdbProviders>(`/movie/${fromId(movie.id)}/watch/providers`, {}, TTL.day);
    const r = res.results?.[region];
    if (!r) return [];
    type ProviderList = { provider_name: string; logo_path?: string }[];
    return Object.entries(TYPE_MAP).flatMap(([key, type]) =>
      (((r as Record<string, unknown>)[key] as ProviderList | undefined) ?? []).map((p) => ({
        provider: p.provider_name,
        type,
        url: r.link,
        deepLink: false,
        logoUrl: p.logo_path ? `${IMG}/w92${p.logo_path}` : undefined,
        source: this.name,
      })),
    );
  }
}
