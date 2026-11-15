import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BaseAIProvider, safeParseJson } from "../src/core/ai/base";
import { loadConfig } from "../src/core/config";
import { createCineverse } from "../src/core";
import { buildAI, buildProviders, ConfigError } from "../src/core/registry";
import { AllowlistSchema } from "../src/core/playback/allowlist";
import { mergeOptions, CineverseService } from "../src/core/service";
import type { CompletionRequest } from "../src/core/ports";
import type { FetchLike } from "../src/core/infra/http";

const MOCK_ALLOW = AllowlistSchema.parse({
  archive: [{ imdbId: "tt0013442", title: "Nosferatu", year: 1922, identifier: "nosf", license: "PD" }],
});

/** Records requests and replies from a route table. */
function fakeFetch(routes: [RegExp, unknown | ((url: string, init?: RequestInit) => unknown)][]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl: FetchLike = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) return new Response("not found", { status: 404 });
    const body = typeof hit[1] === "function" ? (hit[1] as (u: string, i?: RequestInit) => unknown)(url, init) : hit[1];
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return { impl, calls };
}

describe("config + registry", () => {
  it("defaults to fully offline mock mode", () => {
    const svc = createCineverse(loadConfig({}), { allowlist: MOCK_ALLOW });
    expect(svc.info()).toMatchObject({ ai: "mock/mock-1", metadata: "mock", availability: ["mock"], region: "IN" });
  });

  it("switches AI vendor purely through env", () => {
    expect(buildAI(loadConfig({ AI_PROVIDER: "gemini", AI_API_KEY: "k" })).model).toBe("gemini-3.5-flash");
    expect(buildAI(loadConfig({ AI_PROVIDER: "groq", AI_API_KEY: "k", AI_MODEL: "m" })).name).toBe("groq");
    expect(buildAI(loadConfig({ AI_PROVIDER: "ollama", AI_MODEL: "llama3.1" })).name).toBe("ollama");
    expect(buildAI(loadConfig({ AI_PROVIDER: "custom", AI_BASE_URL: "http://x/v1", AI_MODEL: "m" })).name).toBe("custom");
  });

  it("fails fast with a clear message when a required key is missing", () => {
    expect(() => buildAI(loadConfig({ AI_PROVIDER: "openai", AI_MODEL: "m" }))).toThrow(ConfigError);
    expect(() => buildAI(loadConfig({ AI_PROVIDER: "anthropic", AI_API_KEY: "k" }))).toThrow(/AI_MODEL/);
    expect(() => buildProviders(loadConfig({ CINE_METADATA: "tmdb" }), { allowlist: MOCK_ALLOW })).toThrow(/TMDB_API_KEY/);
  });

  it("skips optional providers without keys instead of crashing", () => {
    const p = buildProviders(loadConfig({ CINE_AVAILABILITY: "mock,watchmode" }), { allowlist: MOCK_ALLOW });
    expect(p.availability.map((a) => a.name)).toEqual(["mock"]);
    expect(p.skipped[0]).toMatch(/watchmode/);
  });
});

describe("AI JSON handling (shared by every vendor)", () => {
  it("parses fenced / chatty JSON", () => {
    expect(safeParseJson('Sure!\n```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("re-asks once when the model's JSON fails validation", async () => {
    let n = 0;
    class Flaky extends BaseAIProvider {
      name = "flaky";
      model = "x";
      async complete(_req: CompletionRequest) {
        return n++ === 0 ? '{"items": "oops"}' : '{"items": [1, 2]}';
      }
    }
    const out = await new Flaky().completeJSON({ messages: [{ role: "user", content: "hi" }], schema: z.object({ items: z.array(z.number()) }) });
    expect(out.items).toEqual([1, 2]);
    expect(n).toBe(2);
  });
});

describe("vendor adapters send the right wire format", () => {
  const reply = { recommendations: [{ title: "Nosferatu", year: 1922, reason: "r" }] };

  it("gemini", async () => {
    const f = fakeFetch([[/generativelanguage/, { candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }]]);
    const ai = buildAI(loadConfig({ AI_PROVIDER: "gemini", AI_API_KEY: "g-key" }), f.impl);
    await ai.completeJSON({ messages: [{ role: "user", content: "x" }], schema: z.any() });
    const body = JSON.parse(String(f.calls[0].init!.body));
    expect(f.calls[0].url).toContain("models/gemini-3.5-flash:generateContent");
    expect((f.calls[0].init!.headers as Record<string, string>)["x-goog-api-key"]).toBe("g-key");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("openai-compatible (groq preset)", async () => {
    const f = fakeFetch([[/groq\.com/, { choices: [{ message: { content: JSON.stringify(reply) } }] }]]);
    const ai = buildAI(loadConfig({ AI_PROVIDER: "groq", AI_API_KEY: "q", AI_MODEL: "some-model" }), f.impl);
    await ai.completeJSON({ messages: [{ role: "user", content: "x" }], schema: z.any() });
    const body = JSON.parse(String(f.calls[0].init!.body));
    expect(f.calls[0].url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(body.messages[0].role).toBe("system");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("anthropic", async () => {
    const f = fakeFetch([[/anthropic/, { content: [{ type: "text", text: JSON.stringify(reply) }] }]]);
    const ai = buildAI(loadConfig({ AI_PROVIDER: "anthropic", AI_API_KEY: "a", AI_MODEL: "claude-x" }), f.impl);
    await ai.completeJSON({ messages: [{ role: "user", content: "x" }], schema: z.any() });
    const body = JSON.parse(String(f.calls[0].init!.body));
    expect(body.system).toContain("JSON Schema");
    expect((f.calls[0].init!.headers as Record<string, string>)["anthropic-version"]).toBe("2023-06-01");
  });
});

describe("CineverseService (mock mode)", () => {
  const svc = () => createCineverse(loadConfig({}), { allowlist: AllowlistSchema.parse({
    archive: [{ imdbId: "tt0013442", title: "Nosferatu", year: 1922, identifier: "nosf", license: "PD" }],
    youtube: { videos: [{ imdbId: "tt0012364", title: "The Phantom Carriage", videoId: "abc", license: "Official" }] },
  }) });

  it("drops hallucinated titles", async () => {
    const r = await svc().recommend("a psychological thriller");
    expect(r.items.map((i) => i.movie.title)).toContain("Shutter Island");
    expect(r.dropped).toEqual(["The Midnight Lighthouse Paradox (2019)"]);
  });

  it("resolves PLAY from the archive allowlist", async () => {
    const w = await svc().watch("mock:1");
    expect(w.mode).toBe("PLAY");
    expect(w.playback?.embedUrl).toBe("https://archive.org/embed/nosf");
  });

  it("resolves PLAY from an allowlisted YouTube video", async () => {
    const w = await svc().watch("mock:7");
    expect(w.playback).toMatchObject({ source: "youtube", embedUrl: "https://www.youtube-nocookie.com/embed/abc" });
  });

  it("falls back to WHERE_TO_WATCH, then TRAILER_ONLY, then UNAVAILABLE", async () => {
    expect((await svc().watch("mock:5")).mode).toBe("WHERE_TO_WATCH");
    expect((await svc().watch("mock:6")).mode).toBe("UNAVAILABLE");
    const s = svc();
    expect((await s.watch("mock:4")).mode).toBe("WHERE_TO_WATCH");
  });

  it("a failing provider becomes a warning, not a crash", async () => {
    const p = buildProviders(loadConfig({}), { allowlist: MOCK_ALLOW });
    p.availability.unshift({ name: "broken", whereToWatch: async () => { throw new Error("boom"); } });
    const s = new CineverseService(p, { region: "IN", defaultCount: 5 });
    const w = await s.watch("mock:5");
    expect(w.mode).toBe("WHERE_TO_WATCH");
    expect(w.warnings.join()).toMatch(/broken failed: boom/);
  });
});

describe("real adapters parse vendor responses (fake HTTP)", () => {
  it("TMDB metadata + JustWatch availability + Watchmode deep links merge correctly", async () => {
    const f = fakeFetch([
      [/search\/movie/, { results: [{ id: 603, title: "The Matrix", release_date: "1999-03-31", vote_count: 9, poster_path: "/p.jpg" }] }],
      [/movie\/603\/watch\/providers/, { results: { IN: { link: "https://tmdb/watch", flatrate: [{ provider_name: "Netflix", logo_path: "/n.png" }] } } }],
      [/movie\/603\?/, { id: 603, title: "The Matrix", release_date: "1999-03-31", genres: [{ name: "Action" }], external_ids: { imdb_id: "tt0133093" }, videos: { results: [{ site: "YouTube", type: "Trailer", key: "vKQi", name: "T", official: true }] } }],
      [/watchmode\.com\/v1\/search/, { title_results: [{ id: 42 }] }],
      [/watchmode\.com\/v1\/title\/42\/sources/, [{ name: "Netflix", type: "sub", region: "IN", web_url: "https://netflix.com/title/1" }, { name: "Netflix", type: "sub", region: "US", web_url: "x" }]],
    ]);
    const cfg = loadConfig({ CINE_METADATA: "tmdb", CINE_AVAILABILITY: "tmdb,watchmode", TMDB_API_KEY: "eyJtoken", WATCHMODE_API_KEY: "wm" });
    const s = createCineverse(cfg, { fetchImpl: f.impl, allowlist: AllowlistSchema.parse({}) });

    const rec = await s.recommend("matrix-like");
    // Fake TMDB answers "The Matrix" to every search; none of the AI's titles match it, so all are rejected.
    expect(rec.items).toHaveLength(0);
    expect(rec.dropped).toHaveLength(5);
    const found = await s.watch("tmdb:603");
    expect(found.movie.imdbId).toBe("tt0133093");
    expect(found.mode).toBe("WHERE_TO_WATCH");
    expect(found.options).toEqual([
      expect.objectContaining({ provider: "Netflix", type: "subscription", url: "https://netflix.com/title/1", deepLink: true, logoUrl: expect.stringContaining("/n.png") }),
    ]);
    expect(found.attributions).toEqual(expect.arrayContaining([expect.stringMatching(/JustWatch/), expect.stringMatching(/Watchmode/)]));
    expect(f.calls.some((c) => (c.init?.headers as Record<string, string>)?.authorization === "Bearer eyJtoken")).toBe(true);
  });

  it("mergeOptions prefers deep links regardless of provider order", () => {
    const landing = { provider: "Netflix", type: "subscription" as const, url: "tmdb", deepLink: false, source: "tmdb" };
    const deep = { provider: "Netflix", type: "subscription" as const, url: "nf", deepLink: true, source: "watchmode" };
    expect(mergeOptions([[deep], [landing]])[0].url).toBe("nf");
    expect(mergeOptions([[landing], [deep]])[0].url).toBe("nf");
  });
});
