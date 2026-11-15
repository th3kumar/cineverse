// Build-time config (inlined by Next.js into the static bundle).
// API_BASE is the Cloudflare Worker that holds the TMDB + Groq keys.
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");
export const REGION = process.env.NEXT_PUBLIC_REGION ?? "IN";
