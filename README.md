# CINEVERSE

Tell CINE AI your mood and get films that fit, with real posters, trailers, where-to-watch info, and free public-domain classics you can play right on the page.

**Live:** https://th3kumar.github.io/cineverse

## How it works

```
GitHub Pages (static Next.js)                Cloudflare Worker (free)
 ├─ Onboarding: pick pills → swipe → vibe     ├─ /tmdb/*   TMDB proxy (adds key, edge cache)
 ├─ Taste learner (in the browser)            ├─ /ai/mood  mood → genres + suggested titles
 ├─ Home: hero, ask bar, voice, rows   ──────►├─ /ai/why   one-line reason per film
 └─ Film sheet: trailer, providers, play free └─ /ai/vibe  taste summary
                                                  AI: Groq → Workers AI fallback
```

- **The learner** (`src/lib/taste.ts`): the taste profile is a set of weights over genres, languages and keywords, stored in the browser. The pills seed it. Swipes and ♥/✕ update it: loved +1, not for me −1, meh −0.3, seen +0.2, haven't seen 0. Candidates come from TMDB discover, recommendations for loved films, and titles the AI suggests. Every candidate is ranked by the learner.
- **The AI** only handles language: turning mood text into filters, writing "why" lines, and writing the vibe sentence. Every call has an offline fallback, so the site still works if the AI is down or out of quota.
- **Keys** stay in the Worker. The static site holds none.
- **Free films** (`FREE_FILMS` in `src/lib/catalog.ts`) play from the Internet Archive. Check rights for your region before adding more.

## Deploy

Every push to `main` runs `.github/workflows/pages.yml`: deploy the Worker, store its keys, build the static site, publish to Pages.

Repository secrets:

| Secret | Where it comes from |
|---|---|
| `TMDB_API_KEY` | TMDB → Settings → API → API Read Access Token |
| `GROQ_API_KEY` | console.groq.com → API Keys |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens ("Edit Cloudflare Workers" template) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard URL |

## Develop

```bash
npm install
cd worker && npm install && npx wrangler dev   # local Worker on :8787 (needs .dev.vars with TMDB_TOKEN, GROQ_API_KEY)
NEXT_PUBLIC_API_BASE=http://localhost:8787 npm run dev
npm test
```

TMDB data and images are used under TMDB's non-commercial terms. This product uses the TMDB API but is not endorsed or certified by TMDB.
