import { z } from "zod";

const list = (def: string) =>
  z
    .string()
    .default(def)
    .transform((s) => s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
const bool = z
  .string()
  .default("false")
  .transform((s) => ["1", "true", "yes", "on"].includes(s.toLowerCase()));
const opt = z
  .string()
  .optional()
  .transform((s) => (s?.trim() ? s.trim() : undefined));

/**
 * Every integration is chosen by env vars — no code changes to switch vendors.
 * See .env.example for the full list.
 */
export const ConfigSchema = z.object({
  // ---- AI (generic: one set of vars, any vendor) ----
  AI_PROVIDER: z
    .enum(["gemini", "openai", "anthropic", "groq", "openrouter", "ollama", "custom", "mock"])
    .default("mock"),
  AI_API_KEY: opt,
  AI_MODEL: opt,
  AI_BASE_URL: opt, // required for "custom", optional override for others
  AI_NATIVE_JSON: z.string().default("true").transform((s) => s.toLowerCase() !== "false"),

  // ---- Cineverse catalogue (ordered lists = priority) ----
  CINE_REGION: z.string().length(2).default("IN").transform((s) => s.toUpperCase()),
  CINE_METADATA: z.enum(["tmdb", "mock"]).default("mock"),
  CINE_AVAILABILITY: list("mock"),
  CINE_PLAYBACK: list("archive,youtube"),
  CINE_ALLOWLIST: opt, // default: data/allowlist.json (data/allowlist.mock.json in mock mode)
  CINE_RECOMMENDATION_COUNT: z.coerce.number().int().min(1).max(10).default(5),

  // ---- Vendor keys (only needed for the providers you enable) ----
  TMDB_API_KEY: opt, // v4 read access token (preferred) or v3 api key
  WATCHMODE_API_KEY: opt,
  YOUTUBE_API_KEY: opt,
  YOUTUBE_SEARCH: bool,

  // ---- Your own API: protect /api/* for external clients (Android app, etc.) ----
  CINEVERSE_API_KEY: opt,
});

export type CineConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): CineConfig {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid CINEVERSE config:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}
