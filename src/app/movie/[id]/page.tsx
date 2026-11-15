import { getCineverse } from "@/core";

export const dynamic = "force-dynamic";

const TYPE_LABEL = { free: "Free", ads: "Free with ads", subscription: "Stream", rent: "Rent", buy: "Buy" } as const;

export default async function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const w = await getCineverse().watch(id);
  const m = w.movie;

  return (
    <>
      <a href="/" className="muted">← New search</a>
      <h1>
        {m.title} <span className="muted">{m.year}</span>
      </h1>
      <p className="muted">
        {m.genres.join(" · ")} {m.runtimeMin ? `· ${m.runtimeMin} min` : ""} {m.rating ? `· ★ ${m.rating.toFixed(1)}` : ""}
      </p>
      <p>{m.overview}</p>

      {w.mode === "PLAY" && w.playback && (
        <>
          <span className="badge">Playing free on CINEVERSE · {w.playback.license}</span>
          <div className="player">
            <iframe src={w.playback.embedUrl} allow="fullscreen; encrypted-media; picture-in-picture" allowFullScreen title={m.title} />
          </div>
        </>
      )}

      {w.mode === "WHERE_TO_WATCH" && (
        <>
          <h3>Where to watch in {w.region}</h3>
          <div className="options">
            {w.options.map((o) => (
              <a key={`${o.provider}-${o.type}`} className="opt" href={o.url} target="_blank" rel="noopener noreferrer">
                {o.logoUrl && <img src={o.logoUrl} alt="" />}
                <span>
                  {o.provider}
                  <br />
                  <span className="muted">
                    {TYPE_LABEL[o.type]}
                    {o.price ? ` · ₹${o.price}` : ""}
                  </span>
                </span>
              </a>
            ))}
          </div>
        </>
      )}

      {w.mode !== "PLAY" && w.trailer && (
        <>
          <h3>{w.mode === "TRAILER_ONLY" ? `Not streaming in ${w.region} — here's the trailer` : "Trailer"}</h3>
          <div className="player">
            <iframe src={`https://www.youtube-nocookie.com/embed/${w.trailer.key}`} allowFullScreen title={`${m.title} trailer`} />
          </div>
        </>
      )}

      {w.mode === "UNAVAILABLE" && <p className="muted">We couldn&apos;t find a legal way to watch this in {w.region} yet.</p>}

      <div className="note">
        {w.attributions.map((a) => (
          <div key={a}>{a}</div>
        ))}
      </div>
    </>
  );
}
