import { getCineverse } from "@/core";

export const dynamic = "force-dynamic";

// Server component: calls the service directly, so no API key is ever exposed to the browser.
export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q?.trim();
  const svc = getCineverse();
  let result: Awaited<ReturnType<typeof svc.recommend>> | undefined;
  let error: string | undefined;
  if (q) {
    try {
      result = await svc.recommend(q);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  return (
    <>
      <h1>Ask CINE AI</h1>
      <form className="ask" action="/">
        <input name="q" defaultValue={q} placeholder="e.g. a mind-bending psychological thriller" autoFocus />
        <button type="submit">Recommend</button>
      </form>

      {error && <p style={{ color: "#ff7a7a" }}>Something went wrong: {error}</p>}

      {result && (
        <div className="grid">
          {result.items.map(({ movie, reason }) => (
            <a key={movie.id} className="card" href={`/movie/${encodeURIComponent(movie.id)}`}>
              <div className="poster" style={movie.posterUrl ? { backgroundImage: `url(${movie.posterUrl})` } : {}}>
                {!movie.posterUrl && movie.title}
              </div>
              <div className="body">
                <strong>{movie.title}</strong> <span className="muted">{movie.year}</span>
                <p className="muted">{reason}</p>
              </div>
            </a>
          ))}
        </div>
      )}
      {result?.dropped.length ? (
        <p className="muted">Skipped (couldn&apos;t verify these exist): {result.dropped.join(", ")}</p>
      ) : null}

      <p className="note">Active providers: {JSON.stringify(svc.info())}</p>
    </>
  );
}
