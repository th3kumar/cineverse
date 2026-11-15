import { readFileSync } from "node:fs";
import { z } from "zod";
import type { MovieDetails } from "../types";

/**
 * The allowlist is the legal engine of CINEVERSE PLAY: a film only auto-plays if a human
 * has checked its rights and added it here. Search results alone are never trusted.
 */
const Entry = z.object({
  imdbId: z.string().optional(),
  title: z.string(),
  year: z.number().int().optional(),
  license: z.string().min(1), // why we may play it, e.g. "Public domain (verified …)"
  verifiedOn: z.string().optional(),
  enabled: z.boolean().default(true),
});

export const AllowlistSchema = z.object({
  archive: z.array(Entry.extend({ identifier: z.string() })).default([]),
  youtube: z
    .object({
      videos: z.array(Entry.extend({ videoId: z.string(), channelId: z.string().optional() })).default([]),
      /** Rights-holder channels. Only used when YOUTUBE_SEARCH=true (costs 100 quota units/search). */
      officialChannels: z.array(z.object({ channelId: z.string(), name: z.string() })).default([]),
    })
    .default({ videos: [], officialChannels: [] }),
});

export type Allowlist = z.infer<typeof AllowlistSchema>;
type AnyEntry = z.infer<typeof Entry>;

export function loadAllowlist(path: string): Allowlist {
  try {
    return AllowlistSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return AllowlistSchema.parse({});
    throw new Error(`Invalid allowlist at ${path}: ${(e as Error).message}`);
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Match by IMDb id when both sides have one, otherwise by normalised title + year. */
export function findEntry<T extends AnyEntry>(entries: T[], movie: MovieDetails): T | undefined {
  return entries.find((e) => {
    if (!e.enabled) return false;
    if (e.imdbId && movie.imdbId) return e.imdbId === movie.imdbId;
    return norm(e.title) === norm(movie.title) && (!e.year || !movie.year || e.year === movie.year);
  });
}
