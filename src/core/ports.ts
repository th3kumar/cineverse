// The abstraction layer. Every concrete integration implements one of these interfaces,
// and CineverseService only ever talks to these — never to a vendor directly.

import type { z } from "zod";
import type {
  ChatMessage,
  MovieDetails,
  MovieId,
  MovieSummary,
  Playback,
  WatchOption,
} from "./types";

// ---------- AI ----------

export interface CompletionRequest {
  system?: string;
  messages: ChatMessage[];
  temperature?: number;
  /** Ask the vendor for JSON output when it supports a native JSON mode. */
  json?: boolean;
}

export interface JsonRequest<T> extends Omit<CompletionRequest, "json"> {
  schema: z.ZodType<T>;
  /** Extra attempts if the model returns invalid JSON. Default 1. */
  retries?: number;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  complete(req: CompletionRequest): Promise<string>;
  completeJSON<T>(req: JsonRequest<T>): Promise<T>;
}

// ---------- Movie catalogue ----------

export interface MetadataProvider {
  readonly name: string;
  /** Resolve an AI-suggested title to a real movie. Returns null if it doesn't exist (hallucination guard). */
  search(title: string, year?: number): Promise<MovieSummary | null>;
  details(id: MovieId): Promise<MovieDetails>;
  /** Text that must be shown in the UI to satisfy the provider's terms. */
  readonly attribution?: string;
}

export interface AvailabilityProvider {
  readonly name: string;
  whereToWatch(movie: MovieDetails, region: string): Promise<WatchOption[]>;
  readonly attribution?: string;
}

export interface PlaybackSource {
  readonly name: string;
  /** Return an authorised embed, or null. Must never return unlicensed content. */
  resolve(movie: MovieDetails, region: string): Promise<Playback | null>;
}

// ---------- Infra ----------

export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}
