// Domain types shared by every provider. Nothing here knows about Gemini, TMDB, etc.

/** Provider-namespaced id, e.g. "tmdb:603" or "mock:3". Lets you swap metadata providers safely. */
export type MovieId = string;

export interface MovieSummary {
  id: MovieId;
  title: string;
  year?: number;
  posterUrl?: string;
  rating?: number; // 0-10
}

export interface Trailer {
  site: "youtube";
  key: string; // YouTube video id
  name?: string;
}

export interface MovieDetails extends MovieSummary {
  overview?: string;
  backdropUrl?: string;
  genres: string[];
  runtimeMin?: number;
  imdbId?: string; // cross-provider join key (Watchmode, allowlists)
  trailers: Trailer[];
}

export interface Recommendation {
  movie: MovieSummary;
  reason: string; // why the AI picked it
}

export type WatchType = "subscription" | "free" | "ads" | "rent" | "buy";

export interface WatchOption {
  provider: string; // "Netflix", "Prime Video", ...
  type: WatchType;
  url?: string;
  /** true = opens the title on the platform; false = a landing page (e.g. TMDB's watch page). */
  deepLink?: boolean;
  logoUrl?: string;
  price?: number;
  source: string; // which AvailabilityProvider produced it
}

export interface Playback {
  source: string; // "archive" | "youtube" | ...
  embedUrl: string;
  license: string; // why we are allowed to play it
}

export type WatchMode = "PLAY" | "WHERE_TO_WATCH" | "TRAILER_ONLY" | "UNAVAILABLE";

export interface WatchResult {
  mode: WatchMode;
  movie: MovieDetails;
  region: string;
  playback?: Playback;
  options: WatchOption[];
  trailer?: Trailer;
  attributions: string[]; // must be shown in the UI (TMDB, JustWatch, Watchmode…)
  warnings: string[]; // providers that failed or were skipped
}

export type ChatRole = "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}
