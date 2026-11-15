import { API_BASE } from "./config";
import { GENRE_NAMES, LANG_NAMES, MOODS } from "./catalog";
import type { Movie } from "./tmdb";
import { topGenres, type MoodFilter, type Taste } from "./taste";

// Thin client for the Worker's AI routes. Every call has an offline fallback,
// so the site keeps working if the AI is down or out of free quota.

async function post<T>(path: string, body: unknown, timeoutMs = 9000): Promise<T> {
  if (!API_BASE) throw new Error("no api");
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`AI ${r.status}`);
  return r.json() as Promise<T>;
}

const profileBrief = (t: Taste) => ({
  languages: t.langs.map((l) => LANG_NAMES[l] ?? l),
  likes: topGenres(t, 4).map((g) => GENRE_NAMES[g]),
  loved: t.loved.slice(0, 6).map((x) => x.title),
});

export interface MoodPlan extends MoodFilter {
  reply: string;
  titles: { title: string; year?: number }[];
  languages: string[];
}

const KEYWORDS: [RegExp, number[], number[]][] = [
  [/cozy|cosy|warm|comfort|feel.?good|light/i, [35, 10749, 10751], [27, 53]],
  [/laugh|funny|comedy|silly/i, [35], [27]],
  [/scary|horror|creepy|spooky/i, [27], [10751]],
  [/twist|mind|bend|puzzle|mystery|smart/i, [9648, 878, 53], []],
  [/tense|thrill|edge|suspense/i, [53, 80], [10751]],
  [/action|fight|explosive|adrenaline/i, [28], []],
  [/love|romance|romantic|date/i, [10749], [27]],
  [/cry|sad|emotional|moving/i, [18], []],
  [/space|future|sci.?fi|alien/i, [878], []],
  [/no gore|not gory|without gore/i, [], [27]],
];

export function offlineMood(text: string): MoodPlan {
  const preset = MOODS.find((m) => m.text === text || m.label === text);
  if (preset) return { include: preset.include, exclude: preset.exclude, reply: "Here's what fits.", titles: [], languages: [] };
  const include = new Set<number>();
  const exclude = new Set<number>();
  for (const [re, inc, exc] of KEYWORDS) if (re.test(text)) { inc.forEach((g) => include.add(g)); exc.forEach((g) => exclude.add(g)); }
  for (const g of include) exclude.delete(g);
  return { include: [...include], exclude: [...exclude], reply: "Here's what fits.", titles: [], languages: [] };
}

/** Accept "hi" or "Hindi", but only languages the viewer actually named in their message. */
function toLangCodes(raw: unknown, text: string): string[] {
  if (!Array.isArray(raw)) return [];
  const byName = Object.fromEntries(Object.entries(LANG_NAMES).map(([code, name]) => [name.toLowerCase(), code]));
  const said = text.toLowerCase();
  return raw
    .map((x) => (typeof x === "string" ? x.trim().toLowerCase() : ""))
    .map((x) => (LANG_NAMES[x] ? x : byName[x] ?? ""))
    .filter((code) => code && said.includes(LANG_NAMES[code].toLowerCase()))
    .slice(0, 4);
}

export async function planMood(text: string, t: Taste): Promise<MoodPlan> {
  try {
    const r = await post<Partial<MoodPlan>>("/ai/mood", { text, profile: profileBrief(t) });
    const valid = (xs: unknown) => (Array.isArray(xs) ? xs.map(Number).filter((g) => GENRE_NAMES[g]) : []);
    const include = valid(r.include);
    return {
      include,
      exclude: valid(r.exclude).filter((g) => !include.includes(g)),
      reply: typeof r.reply === "string" && r.reply ? r.reply.slice(0, 80) : "Here's what fits.",
      titles: Array.isArray(r.titles) ? r.titles.filter((x) => x && typeof x.title === "string").slice(0, 10) : [],
      languages: toLangCodes(r.languages, text),
    };
  } catch {
    return offlineMood(text);
  }
}

export function offlineWhy(m: Movie, t: Taste): string {
  const g = (m.genre_ids ?? []).find((id) => (t.genre[id] ?? 0) > 0) ?? m.genre_ids?.[0];
  const lang = LANG_NAMES[m.original_language];
  if (t.loved[0] && Math.random() > 0.5) return `For fans of ${t.loved[0].title}.`;
  return [g && GENRE_NAMES[g], lang].filter(Boolean).join(" · ") || "Highly rated pick.";
}

export async function explain(mood: string, movies: Movie[], t: Taste): Promise<Record<number, string>> {
  const fallback = Object.fromEntries(movies.map((m) => [m.id, offlineWhy(m, t)]));
  try {
    const r = await post<{ reasons?: string[] }>("/ai/why", {
      mood,
      profile: profileBrief(t),
      movies: movies.map((m) => ({ title: m.title, year: m.release_date?.slice(0, 4), overview: (m.overview ?? "").slice(0, 280) })),
    });
    movies.forEach((m, i) => {
      const s = r.reasons?.[i];
      if (typeof s === "string" && s.trim()) fallback[m.id] = s.trim().slice(0, 110);
    });
  } catch {}
  return fallback;
}

export async function describeVibe(t: Taste, disliked: string[]): Promise<{ sentence: string; tags: string[] }> {
  const likes = topGenres(t, 3).map((g) => GENRE_NAMES[g]);
  const fallback = {
    sentence: likes.length ? `${likes[0]} at heart${likes[1] ? `, with a soft spot for ${likes[1].toLowerCase()}` : ""}.` : "Open to anything good.",
    tags: [...likes, t.langs.map((l) => LANG_NAMES[l]).slice(0, 2).join(" · ")].filter(Boolean).slice(0, 4),
  };
  try {
    const r = await post<{ sentence?: string; tags?: string[] }>("/ai/vibe", { ...profileBrief(t), disliked });
    if (r.sentence && Array.isArray(r.tags)) return { sentence: r.sentence.slice(0, 90), tags: r.tags.slice(0, 4).map(String) };
  } catch {}
  return fallback;
}
