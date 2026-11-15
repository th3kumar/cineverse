import { cached, TTL } from "../infra/cache";
import { fetchJson, type FetchLike } from "../infra/http";
import type { Cache, PlaybackSource } from "../ports";
import type { MovieDetails, Playback } from "../types";
import { findEntry, type Allowlist } from "./allowlist";

/** Internet Archive: plays only allowlisted, rights-checked items via the official embed player. */
export class ArchivePlayback implements PlaybackSource {
  readonly name = "archive";
  constructor(private readonly allowlist: Allowlist) {}

  async resolve(movie: MovieDetails): Promise<Playback | null> {
    const e = findEntry(this.allowlist.archive, movie);
    return e
      ? { source: this.name, embedUrl: `https://archive.org/embed/${encodeURIComponent(e.identifier)}`, license: e.license }
      : null;
  }
}

interface YtSearch {
  items?: { id: { videoId: string }; snippet: { channelId: string; title: string } }[];
}

/**
 * YouTube: 1) allowlisted video ids (free, zero quota); 2) optionally, a search restricted to
 * rights-holder channels (100 quota units per search, cached for a week).
 */
export class YouTubePlayback implements PlaybackSource {
  readonly name = "youtube";

  constructor(
    private readonly allowlist: Allowlist,
    private readonly cache: Cache,
    private readonly apiKey?: string,
    private readonly searchEnabled = false,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async resolve(movie: MovieDetails, region: string): Promise<Playback | null> {
    const e = findEntry(this.allowlist.youtube.videos, movie);
    if (e) return this.embed(e.videoId, e.license);

    const channels = this.allowlist.youtube.officialChannels;
    if (!this.searchEnabled || !this.apiKey || channels.length === 0) return null;

    const hit = await cached(this.cache, `yt:${movie.id}:${region}`, TTL.week, async () => {
      const qs = new URLSearchParams({
        part: "snippet",
        type: "video",
        q: `${movie.title} ${movie.year ?? ""} full movie`,
        videoEmbeddable: "true",
        videoDuration: "long",
        regionCode: region,
        maxResults: "15",
        key: this.apiKey!,
      });
      const res = await fetchJson<YtSearch>(`https://www.googleapis.com/youtube/v3/search?${qs}`, {}, this.fetchImpl);
      const official = new Map(channels.map((c) => [c.channelId, c.name]));
      const v = res.items?.find((i) => official.has(i.snippet.channelId));
      return v ? { videoId: v.id.videoId, channel: official.get(v.snippet.channelId)! } : null;
    });
    return hit ? this.embed(hit.videoId, `Official upload by ${hit.channel}`) : null;
  }

  private embed(videoId: string, license: string): Playback {
    return { source: this.name, embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`, license };
  }
}
