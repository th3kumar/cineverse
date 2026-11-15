import { cached, TTL } from "../infra/cache";
import { fetchJson, type FetchLike } from "../infra/http";
import type { AvailabilityProvider, Cache } from "../ports";
import type { MovieDetails, WatchOption, WatchType } from "../types";

interface WmSearch {
  title_results?: { id: number }[];
}
interface WmSource {
  name: string;
  type: "sub" | "free" | "rent" | "buy" | "tve" | string;
  region: string;
  web_url?: string;
  price?: number | null;
}

const TYPE_MAP: Record<string, WatchType> = { sub: "subscription", tve: "subscription", free: "free", rent: "rent", buy: "buy" };

/**
 * Watchmode: per-platform deep links. Free plan = 2,500 credits/month, non-commercial,
 * up to 3 countries, attribution required, cache ≤ 30 days — so everything is cached.
 */
export class WatchmodeAvailability implements AvailabilityProvider {
  readonly name = "watchmode";
  readonly attribution = "Streaming links powered by Watchmode.";

  constructor(
    private readonly apiKey: string,
    private readonly cache: Cache,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly baseUrl = "https://api.watchmode.com/v1",
  ) {}

  private get<T>(path: string, params: Record<string, string>) {
    const url = `${this.baseUrl}${path}?${new URLSearchParams(params)}`;
    return cached(this.cache, `wm:${url}`, TTL.watchmodeMax, () =>
      fetchJson<T>(url, { headers: { "x-api-key": this.apiKey } }, this.fetchImpl),
    );
  }

  async whereToWatch(movie: MovieDetails, region: string): Promise<WatchOption[]> {
    const query = movie.imdbId
      ? { search_field: "imdb_id", search_value: movie.imdbId }
      : movie.id.startsWith("tmdb:")
        ? { search_field: "tmdb_movie_id", search_value: movie.id.slice(5) }
        : null;
    if (!query) return [];

    const found = await this.get<WmSearch>("/search/", query);
    const wmId = found.title_results?.[0]?.id;
    if (!wmId) return [];

    const sources = await this.get<WmSource[]>(`/title/${wmId}/sources/`, { regions: region });
    return sources
      .filter((s) => s.region === region && TYPE_MAP[s.type])
      .map((s) => ({
        provider: s.name,
        type: TYPE_MAP[s.type],
        url: s.web_url,
        deepLink: Boolean(s.web_url),
        price: s.price ?? undefined,
        source: this.name,
      }));
  }
}
