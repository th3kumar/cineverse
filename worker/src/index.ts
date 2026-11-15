// CINEVERSE API — a tiny Cloudflare Worker that keeps the keys off the static site.
//   GET  /tmdb/...   allowlisted TMDB read endpoints, cached at the edge
//   POST /ai/mood    mood text -> genre filters + suggested titles + one-line reply
//   POST /ai/why     one short reason per film
//   POST /ai/vibe    one-sentence taste summary + tags
// AI providers are tried in order: Groq (free tier) -> Cloudflare Workers AI (free daily allowance).

export interface Env {
  AI?: Ai;
  TMDB_TOKEN?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL: string;
  CF_AI_MODEL: string;
  ALLOWED_ORIGINS: string;
}

const TMDB_PATHS = [
  /^\/discover\/movie$/,
  /^\/search\/movie$/,
  /^\/movie\/\d+$/,
  /^\/movie\/\d+\/(recommendations|watch\/providers)$/,
  /^\/genre\/movie\/list$/,
];
const TMDB_PARAMS = new Set([
  "query", "year", "page", "include_adult", "sort_by", "with_genres", "without_genres",
  "with_original_language", "vote_count.gte", "vote_average.gte", "append_to_response", "language", "region",
  "primary_release_date.gte", "primary_release_date.lte",
]);

const GENRES =
  "28 Action, 12 Adventure, 16 Animation, 35 Comedy, 80 Crime, 99 Documentary, 18 Drama, 10751 Family, 14 Fantasy, " +
  "36 History, 27 Horror, 10402 Music, 9648 Mystery, 10749 Romance, 878 Science Fiction, 53 Thriller, 10752 War, 37 Western";

const PROMPTS: Record<string, string> = {
  mood:
    "You are CINE AI, a warm movie concierge for viewers in India. Turn the viewer's mood into search filters, " +
    "respecting their taste profile. Reply with ONLY a JSON object: " +
    '{"reply": string (max 8 words, friendly, no emoji), "include": [TMDB genre ids], "exclude": [TMDB genre ids], ' +
    '"languages": [two-letter ISO 639-1 codes like "hi" or "ko", ONLY if the viewer explicitly named a language in their message, otherwise []], ' +
    '"titles": [{"title": string, "year": number}] (up to 8 real, well-known, released feature films that fit the mood; at least half of them in the viewer\'s profile languages, using their common English title)}. ' +
    "Rules: genres in include must directly express the mood. If the viewer says no gore / not gory / not scary, put 27 (Horror) in exclude. " +
    "For light, cozy, funny, feel-good or romantic moods, exclude 53 (Thriller), 27 (Horror) and 80 (Crime). " +
    "Suggested titles must fit tonight's mood first; the taste profile only breaks ties. " +
    "Never put the same id in include and exclude. " +
    `TMDB genre ids: ${GENRES}.`,
  why:
    "You are CINE AI. For each film, write one short reason (max 12 words) why it fits the viewer's mood and taste. " +
    'No spoilers, no emoji, no film title at the start. Reply with ONLY a JSON object: {"reasons": [string, ...]} in the same order as the films.',
  vibe:
    "You are CINE AI. From the viewer's onboarding, describe their movie taste in ONE warm, specific sentence (max 12 words) " +
    'and 4 short tags (1-3 words each). No emoji. Reply with ONLY a JSON object: {"sentence": string, "tags": [string, string, string, string]}.',
};

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("origin") ?? "";
    const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
    const cors = allowed.includes(origin) ? origin : allowed[0];
    const headers = {
      "access-control-allow-origin": cors,
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      vary: "origin",
    };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    // Browsers always send Origin on cross-site calls; reject other sites' pages.
    if (origin && !allowed.includes(origin)) return json({ error: "origin not allowed" }, 403, headers);

    try {
      if (url.pathname === "/health") return json({ ok: true, tmdb: !!env.TMDB_TOKEN, groq: !!env.GROQ_API_KEY, workersAi: !!env.AI }, 200, headers);
      if (req.method === "GET" && url.pathname.startsWith("/tmdb/")) return await tmdb(url, env, ctx, headers);
      const ai = url.pathname.match(/^\/ai\/(mood|why|vibe)$/);
      if (req.method === "POST" && ai) {
        const raw = await req.text();
        if (raw.length > 8000) return json({ error: "too large" }, 413, headers);
        const { result, provider, note } = await complete(env, PROMPTS[ai[1]], raw);
        return json(result, 200, { ...headers, "x-ai-provider": provider, ...(note ? { "x-ai-note": note.slice(0, 200) } : {}), "access-control-expose-headers": "x-ai-provider, x-ai-note" });
      }
      return json({ error: "not found" }, 404, headers);
    } catch (e) {
      return json({ error: (e as Error).message }, 502, headers);
    }
  },
};

async function tmdb(url: URL, env: Env, ctx: ExecutionContext, headers: Record<string, string>) {
  if (!env.TMDB_TOKEN) return json({ error: "TMDB_TOKEN not set" }, 500, headers);
  const path = url.pathname.slice("/tmdb".length);
  if (!TMDB_PATHS.some((re) => re.test(path))) return json({ error: "path not allowed" }, 403, headers);

  const qs = new URLSearchParams();
  for (const [k, v] of url.searchParams) if (TMDB_PARAMS.has(k)) qs.set(k, v.slice(0, 200));
  qs.sort();
  const cacheKey = new Request(`https://cineverse-cache/tmdb${path}?${qs}`);
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return withHeaders(hit, headers);

  const bearer = env.TMDB_TOKEN.startsWith("eyJ");
  if (!bearer) qs.set("api_key", env.TMDB_TOKEN);
  const upstream = await fetch(`https://api.themoviedb.org/3${path}?${qs}`, {
    headers: bearer ? { authorization: `Bearer ${env.TMDB_TOKEN}`, accept: "application/json" } : { accept: "application/json" },
  });
  const body = await upstream.text();
  const res = new Response(body, {
    status: upstream.status,
    headers: { "content-type": "application/json", "cache-control": upstream.ok ? "public, max-age=21600" : "no-store" },
  });
  if (upstream.ok) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return withHeaders(res, headers);
}

async function complete(env: Env, system: string, user: string): Promise<{ result: unknown; provider: string; note?: string }> {
  const errors: string[] = [];
  if (env.GROQ_API_KEY) {
    // GROQ_MODEL may list several models, tried in order (e.g. a bigger one, then a faster one).
    for (const model of env.GROQ_MODEL.split(",").map((m) => m.trim()).filter(Boolean)) {
      try {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { authorization: `Bearer ${env.GROQ_API_KEY}`, "content-type": "application/json" },
          body: JSON.stringify({
            model,
            temperature: 0.6,
            max_completion_tokens: 1500,
            response_format: { type: "json_object" },
            ...(model.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
            messages: [{ role: "system", content: system }, { role: "user", content: user }],
          }),
        });
        if (!r.ok) throw new Error(`groq ${model} ${r.status}: ${(await r.text()).slice(0, 120)}`);
        const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
        return { result: parseJson(data.choices?.[0]?.message?.content ?? ""), provider: `groq/${model}`, note: errors.join("; ") || undefined };
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
  }
  if (env.AI) {
    try {
      const out = (await env.AI.run(env.CF_AI_MODEL as keyof AiModels, {
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        max_tokens: 700,
      } as never)) as { response?: string | object };
      const result = typeof out.response === "string" ? parseJson(out.response) : out.response;
      return { result, provider: `workers-ai/${env.CF_AI_MODEL}`, note: errors.join("; ") || undefined };
    } catch (e) {
      errors.push(`workers-ai: ${(e as Error).message}`);
    }
  }
  throw new Error(`no AI provider available (${errors.join("; ") || "none configured"})`);
}

function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let s = (fenced ? fenced[1] : text).trim();
  const start = s.search(/[{[]/);
  const end = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

const json = (data: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(data), { status, headers: { ...headers, "content-type": "application/json" } });

function withHeaders(res: Response, headers: Record<string, string>) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}
