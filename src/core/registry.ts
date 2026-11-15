import { resolve } from "node:path";
import { AnthropicProvider } from "./ai/anthropic";
import { GeminiProvider } from "./ai/gemini";
import { MockAIProvider } from "./ai/mock";
import { OPENAI_COMPATIBLE_PRESETS, OpenAICompatibleProvider } from "./ai/openai-compatible";
import { MockAvailability, MockMetadata } from "./catalog/mock";
import { TmdbAvailability, TmdbClient, TmdbMetadata } from "./catalog/tmdb";
import { WatchmodeAvailability } from "./catalog/watchmode";
import type { CineConfig } from "./config";
import { MemoryCache } from "./infra/cache";
import type { FetchLike } from "./infra/http";
import type { AIProvider, AvailabilityProvider, Cache, MetadataProvider, PlaybackSource } from "./ports";
import { loadAllowlist, type Allowlist } from "./playback/allowlist";
import { ArchivePlayback, YouTubePlayback } from "./playback/sources";

export class ConfigError extends Error {}

export interface Providers {
  ai: AIProvider;
  metadata: MetadataProvider;
  availability: AvailabilityProvider[];
  playback: PlaybackSource[];
  cache: Cache;
  /** Providers listed in config but skipped (e.g. missing key) — surfaced by /api/health. */
  skipped: string[];
}

export interface RegistryDeps {
  fetchImpl?: FetchLike;
  cache?: Cache;
  allowlist?: Allowlist; // inject in tests instead of reading a file
}

const DEFAULT_MODELS: Partial<Record<CineConfig["AI_PROVIDER"], string>> = {
  gemini: "gemini-3.5-flash", // on Gemini's free tier as of Nov 2026
};

export function buildAI(cfg: CineConfig, fetchImpl: FetchLike = fetch): AIProvider {
  const p = cfg.AI_PROVIDER;
  if (p === "mock") return new MockAIProvider();

  const model = cfg.AI_MODEL ?? DEFAULT_MODELS[p];
  if (!model) throw new ConfigError(`AI_MODEL is required for AI_PROVIDER=${p}`);
  const needsKey = p !== "ollama" && p !== "custom";
  if (needsKey && !cfg.AI_API_KEY) throw new ConfigError(`AI_API_KEY is required for AI_PROVIDER=${p}`);

  switch (p) {
    case "gemini":
      return new GeminiProvider(cfg.AI_API_KEY!, model, cfg.AI_BASE_URL, fetchImpl);
    case "anthropic":
      return new AnthropicProvider(cfg.AI_API_KEY!, model, cfg.AI_BASE_URL, fetchImpl);
    default: {
      const baseUrl = cfg.AI_BASE_URL ?? OPENAI_COMPATIBLE_PRESETS[p];
      if (!baseUrl) throw new ConfigError(`AI_BASE_URL is required for AI_PROVIDER=${p}`);
      return new OpenAICompatibleProvider(p, baseUrl, cfg.AI_API_KEY, model, cfg.AI_NATIVE_JSON, fetchImpl);
    }
  }
}

export function buildProviders(cfg: CineConfig, deps: RegistryDeps = {}): Providers {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const cache = deps.cache ?? new MemoryCache();
  const skipped: string[] = [];

  const ai = buildAI(cfg, fetchImpl);

  // TMDB client is shared by metadata + availability so both hit the same cache.
  let tmdb: TmdbClient | undefined;
  const needTmdb = cfg.CINE_METADATA === "tmdb" || cfg.CINE_AVAILABILITY.includes("tmdb");
  if (needTmdb) {
    if (cfg.TMDB_API_KEY) tmdb = new TmdbClient(cfg.TMDB_API_KEY, cache, fetchImpl);
    else if (cfg.CINE_METADATA === "tmdb") throw new ConfigError("TMDB_API_KEY is required for CINE_METADATA=tmdb");
  }

  const metadata: MetadataProvider = cfg.CINE_METADATA === "tmdb" ? new TmdbMetadata(tmdb!) : new MockMetadata();

  const availability: AvailabilityProvider[] = [];
  for (const name of cfg.CINE_AVAILABILITY) {
    if (name === "tmdb") tmdb ? availability.push(new TmdbAvailability(tmdb)) : skipped.push("availability:tmdb (no TMDB_API_KEY)");
    else if (name === "watchmode")
      cfg.WATCHMODE_API_KEY
        ? availability.push(new WatchmodeAvailability(cfg.WATCHMODE_API_KEY, cache, fetchImpl))
        : skipped.push("availability:watchmode (no WATCHMODE_API_KEY)");
    else if (name === "mock") availability.push(new MockAvailability());
    else skipped.push(`availability:${name} (unknown)`);
  }

  const allowlistPath =
    cfg.CINE_ALLOWLIST ?? (cfg.CINE_METADATA === "mock" ? "data/allowlist.mock.json" : "data/allowlist.json");
  const allowlist = deps.allowlist ?? loadAllowlist(resolve(/*turbopackIgnore: true*/ process.cwd(), allowlistPath));

  const playback: PlaybackSource[] = [];
  for (const name of cfg.CINE_PLAYBACK) {
    if (name === "archive") playback.push(new ArchivePlayback(allowlist));
    else if (name === "youtube") {
      playback.push(new YouTubePlayback(allowlist, cache, cfg.YOUTUBE_API_KEY, cfg.YOUTUBE_SEARCH, fetchImpl));
      if (cfg.YOUTUBE_SEARCH && !cfg.YOUTUBE_API_KEY) skipped.push("playback:youtube-search (no YOUTUBE_API_KEY)");
    } else skipped.push(`playback:${name} (unknown)`);
  }

  return { ai, metadata, availability, playback, cache, skipped };
}
