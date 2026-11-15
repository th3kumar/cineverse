import { z } from "zod";
import type { Providers } from "./registry";
import type { ChatMessage, MovieDetails, MovieId, Recommendation, WatchOption, WatchResult } from "./types";

const RecommendationSchema = z.object({
  recommendations: z
    .array(
      z.object({
        title: z.string().min(1),
        year: z.number().int().min(1888).max(2100).optional(),
        reason: z.string().min(1),
      }),
    )
    .min(1),
});

const SYSTEM_PROMPT = `You are CINE AI, the movie concierge of CINEVERSE.
Recommend real, released feature films that fit the user's request.
Use the film's original release year. Never invent titles. Keep each reason to one sentence.`;

export interface RecommendOptions {
  count?: number;
  history?: ChatMessage[]; // earlier turns, for follow-ups like "more like the second one"
}

/**
 * The only class the app (web routes, CLI, a future Android backend) talks to.
 * It depends on interfaces, so every vendor behind it is swappable via config.
 */
export class CineverseService {
  constructor(
    private readonly p: Providers,
    private readonly opts: { region: string; defaultCount: number },
  ) {}

  /** Natural-language request → AI picks → verified against the catalogue (drops hallucinations). */
  async recommend(query: string, o: RecommendOptions = {}): Promise<{ items: Recommendation[]; dropped: string[] }> {
    const count = o.count ?? this.opts.defaultCount;
    const { recommendations } = await this.p.ai.completeJSON({
      system: SYSTEM_PROMPT,
      messages: [...(o.history ?? []), { role: "user", content: `${query}\n\nGive ${count} recommendations.` }],
      schema: RecommendationSchema,
      temperature: 0.6,
    });

    const settled = await Promise.allSettled(
      recommendations.map(async (r) => ({ r, movie: await this.p.metadata.search(r.title, r.year) })),
    );

    const items: Recommendation[] = [];
    const dropped: string[] = [];
    const seen = new Set<string>();
    for (const s of settled) {
      if (s.status === "rejected") continue;
      const { r, movie } = s.value;
      if (!movie) dropped.push(`${r.title}${r.year ? ` (${r.year})` : ""}`);
      else if (!seen.has(movie.id)) {
        seen.add(movie.id);
        items.push({ movie, reason: r.reason });
      }
    }
    return { items: items.slice(0, count), dropped };
  }

  movie(id: MovieId): Promise<MovieDetails> {
    return this.p.metadata.details(id);
  }

  /** Decide what the user sees: play here → where to watch → trailer → unavailable. */
  async watch(id: MovieId, region = this.opts.region): Promise<WatchResult> {
    const movie = await this.p.metadata.details(id);
    const warnings: string[] = [...this.p.skipped];
    const attributions = new Set<string>();
    if (this.p.metadata.attribution) attributions.add(this.p.metadata.attribution);

    // 1. Authorised playback, in configured priority order. One failing source never breaks the page.
    for (const src of this.p.playback) {
      try {
        const playback = await src.resolve(movie, region);
        if (playback) {
          return { mode: "PLAY", movie, region, playback, options: [], trailer: movie.trailers[0], attributions: [...attributions], warnings };
        }
      } catch (e) {
        warnings.push(`playback:${src.name} failed: ${(e as Error).message}`);
      }
    }

    // 2. Where to watch — query all providers in parallel and merge.
    const results = await Promise.allSettled(this.p.availability.map((a) => a.whereToWatch(movie, region)));
    const lists: WatchOption[][] = [];
    results.forEach((r, i) => {
      const prov = this.p.availability[i];
      if (r.status === "fulfilled") {
        lists.push(r.value);
        if (r.value.length && prov.attribution) attributions.add(prov.attribution);
      } else warnings.push(`availability:${prov.name} failed: ${(r.reason as Error).message}`);
    });
    const options = mergeOptions(lists);

    const trailer = movie.trailers[0];
    const mode = options.length ? "WHERE_TO_WATCH" : trailer ? "TRAILER_ONLY" : "UNAVAILABLE";
    return { mode, movie, region, options, trailer, attributions: [...attributions], warnings };
  }

  info() {
    return {
      ai: `${this.p.ai.name}/${this.p.ai.model}`,
      metadata: this.p.metadata.name,
      availability: this.p.availability.map((a) => a.name),
      playback: this.p.playback.map((s) => s.name),
      region: this.opts.region,
      skipped: this.p.skipped,
    };
  }
}

const TYPE_ORDER = ["free", "ads", "subscription", "rent", "buy"];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(plus|withads)$/, "");

/** De-duplicate the same platform across providers; prefer entries with a deep link (e.g. Watchmode). */
export function mergeOptions(lists: WatchOption[][]): WatchOption[] {
  const byKey = new Map<string, WatchOption>();
  for (const o of lists.flat()) {
    const key = `${norm(o.provider)}|${o.type}`;
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, o);
    else {
      const deep = o.deepLink && o.url ? o : prev.deepLink && prev.url ? prev : (o.url ? o : prev);
      byKey.set(key, {
        ...prev,
        url: deep.url,
        deepLink: deep.deepLink,
        source: deep === prev ? prev.source : `${prev.source}+${o.source}`,
        logoUrl: prev.logoUrl ?? o.logoUrl,
        price: prev.price ?? o.price,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
}
