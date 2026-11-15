# CINEVERSE PLAY — POC

An AI movie concierge. You ask CINE AI for a film, it recommends some, checks they exist, and then shows the film in one of three ways: **plays it here** (only legally free films), **shows where to watch it** (Netflix, Prime…), or **shows the trailer**.

Each vendor is a plug-in. You switch AI or movie-data providers with **env variables, not code**.

```bash
npm install
npm run demo -- "a mind-bending psychological thriller"   # runs offline on mock providers
npm run dev                                               # http://localhost:3000
npm test
```

## Architecture

```
            Web pages / API routes / CLI / (future) Android app
                               │
                      CineverseService  ← the only thing the app calls
        ┌──────────────┬───────┴────────┬─────────────────┐
   AIProvider   MetadataProvider  AvailabilityProvider[]  PlaybackSource[]
   ├ gemini       ├ tmdb            ├ tmdb (JustWatch)     ├ archive  (allowlist)
   ├ openai-compatible ├ mock       ├ watchmode            └ youtube  (allowlist / official channels)
   │  (openai, groq, openrouter,    └ mock
   │   ollama, custom URL)
   ├ anthropic
   └ mock
```

- `src/core/ports.ts`: the interfaces. `CineverseService` depends only on these.
- `src/core/registry.ts`: reads env variables and builds the matching adapters. If an **optional** provider is missing its key, it is skipped and listed in `/api/health`.
- `src/core/ai/base.ts`: shared JSON logic for every LLM. The schema goes in the prompt, native JSON mode is used where the vendor has one, zod validates the output, and the model gets one automatic re-ask if it's wrong. Each vendor adapter only implements `complete()`.
- **Hallucination guard:** the service drops any AI pick the metadata provider can't match on title and year. These appear in `dropped`.
- **Legal guard:** a film auto-plays **only** if it's in `data/allowlist.json` and enabled there. Search results are never trusted on their own.

## Switching providers

| Want | Set |
|---|---|
| Gemini (free tier) | `AI_PROVIDER=gemini` `AI_API_KEY=…` |
| Groq / OpenRouter / OpenAI | `AI_PROVIDER=groq` `AI_API_KEY=…` `AI_MODEL=…` |
| Local model | `AI_PROVIDER=ollama` `AI_MODEL=llama3.1` |
| Any OpenAI-compatible server | `AI_PROVIDER=custom` `AI_BASE_URL=…/v1` `AI_MODEL=…` |
| Claude | `AI_PROVIDER=anthropic` `AI_API_KEY=…` `AI_MODEL=…` |
| Real movie data | `CINE_METADATA=tmdb` `TMDB_API_KEY=…` |
| Where to watch | `CINE_AVAILABILITY=tmdb,watchmode` (+ `WATCHMODE_API_KEY`) |

See `.env.example` for every variable.

## Adding a new provider (e.g. OMDb, a new AI vendor)

1. Implement the interface from `ports.ts`. For an AI vendor, extend `BaseAIProvider` and write only `complete()`.
2. Add one `case` / `if` in `registry.ts` and the new key to `config.ts`.
3. You don't touch the service, pages or routes.

## API (for web or Android clients)

| Method | Path | Returns |
|---|---|---|
| POST | `/api/recommend` `{ query, count?, history? }` | `{ items: [{ movie, reason }], dropped }` |
| GET | `/api/movie/:id` | movie details |
| GET | `/api/watch/:id?region=IN` | `{ mode: PLAY \| WHERE_TO_WATCH \| TRAILER_ONLY \| UNAVAILABLE, playback?, options, trailer?, attributions }` |
| GET | `/api/health` | active providers (never keys) |

If `CINEVERSE_API_KEY` is set, clients must send the header `x-cineverse-key`. The web pages call the service on the server, so the key never reaches the browser.

## Building the playback allowlist

```bash
npm run archive:find -- "Nosferatu"
```

Open the item, check its rights **for your region** (restored versions often carry new copyrights, such as a new score), copy the `identifier` into `data/allowlist.json`, and set `enabled: true`. For YouTube, add `videos` (costs no quota) or `officialChannels` with `YOUTUBE_SEARCH=true` (100 quota units per search, cached for a week).

## Deploy

GitHub Pages can't host this app. It only serves static files, and CINEVERSE needs a server to keep API keys secret and run `/api/*`. Use one of the options below. With no env vars set, the app deploys in mock mode, so every option works on the first push.

**What runs on GitHub**

| Workflow | When it runs | What it does |
|---|---|---|
| `ci.yml` | every push / PR | `npm ci` → tests → `next build` → typecheck |
| `docker.yml` | push to `main`, `v*` tags | builds the image and publishes it to `ghcr.io/<owner>/<repo>` |
| `deploy-vercel.yml` | push to `main` (production), PRs (preview) | deploys to Vercel. It skips itself until the secrets below exist |

**Option A: Vercel through GitHub Actions** (free Hobby plan)
1. `npm i -g vercel && vercel link`. This creates `.vercel/project.json` with `orgId` and `projectId`; don't commit it.
2. Create a token at vercel.com → Account Settings → Tokens.
3. In the GitHub repo, go to Settings → Secrets and variables → Actions and add `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`.
4. Add your app env vars (`AI_PROVIDER`, `AI_API_KEY`, `TMDB_API_KEY`…) in Vercel → Project → Settings → Environment Variables.
5. Push to `main` to deploy. The link to each deploy appears in the workflow summary.

*Simpler alternative:* import the repo at vercel.com/new and delete `deploy-vercel.yml`. Vercel's own GitHub app then deploys on every push.

**Option B: the Docker image from GHCR** (Render, Railway, Fly.io, a VPS…)
```bash
docker run -p 3000:3000 --env-file .env.local ghcr.io/<owner>/<repo>:latest
```
On Render, create a Web Service from the existing image `ghcr.io/<owner>/<repo>:latest` and add the env vars. If the repo is private, make the package public or give Render a GitHub token with `read:packages`.

## Terms to respect (free tiers)

TMDB, the Watchmode free plan and MovieLens are **non-commercial only**. Show the `attributions` returned by `/api/watch` (TMDB, JustWatch, Watchmode). Gemini's free tier may use your prompts to improve Google's products.
