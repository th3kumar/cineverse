"use client";
import { useEffect, useRef, useState } from "react";
import { GENRE_NAMES, LANG_NAMES } from "@/lib/catalog";
import { archiveIdFor } from "@/lib/recommend";
import { details, img, providers, year, type Movie, type MovieDetails, type Provider } from "@/lib/tmdb";
import type { Verdict } from "@/lib/taste";
import { Icon } from "./ui";

export function MovieSheet({ movie, reason, onClose, onReact }: { movie: Movie; reason?: string; onClose: () => void; onReact: (m: Movie, v: Verdict, keywords: number[]) => void }) {
  const [d, setD] = useState<MovieDetails | null>(null);
  const [prov, setProv] = useState<{ list: Provider[]; link?: string } | null>(null);
  const [playing, setPlaying] = useState<"film" | "trailer" | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const archiveId = archiveIdFor(movie);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    details(movie.id).then(setD).catch(() => {});
    providers(movie.id).then(setProv).catch(() => setProv({ list: [] }));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [movie.id]);

  const trailer = d?.videos?.results
    .filter((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"))
    .sort((a, b) => Number(b.official) - Number(a.official) || Number(b.type === "Trailer") - Number(a.type === "Trailer"))[0];
  const keywords = (d?.keywords?.keywords ?? []).map((k) => k.id);
  const genres = d?.genres?.map((g) => g.name) ?? movie.genre_ids.map((g) => GENRE_NAMES[g]).filter(Boolean);
  const runtime = d?.runtime ? `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m` : undefined;
  const meta = [year(movie), LANG_NAMES[movie.original_language], genres.slice(0, 2).join(", "), runtime].filter(Boolean).join(" · ");
  const best = prov?.list[0];
  const react = (v: Verdict) => {
    onReact(movie, v, keywords);
    onClose();
  };

  return (
    <>
      <div className="overlay" onClick={onClose} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={movie.title} onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="backdrop" style={{ backgroundImage: `url(${img(movie.backdrop_path, "w1280") ?? img(movie.poster_path, "w780") ?? ""})` }}>
          <button ref={closeRef} className="icon-btn sm" aria-label="Close" onClick={onClose} style={{ position: "absolute", top: 20, left: 20, zIndex: 2, background: "rgba(0,0,0,0.45)" }}>
            {Icon.down()}
          </button>
        </div>
        <div style={{ position: "relative", marginTop: -120, padding: "0 24px 40px", maxWidth: 860 }}>
          <h2 className="h1 rise" style={{ fontSize: "clamp(32px, 5vw, 52px)" }}>{movie.title}</h2>
          <p className="muted rise" style={{ margin: "8px 0 0", fontSize: 15, animationDelay: "60ms" }}>{meta}</p>
          {reason && <p className="rise" style={{ margin: "14px 0 0", fontSize: 18, lineHeight: 1.45, color: "rgba(235,235,245,0.9)", animationDelay: "120ms" }}>{reason}</p>}

          <div className="rise" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 24, animationDelay: "180ms" }}>
            {archiveId ? (
              <button className="btn btn-primary" onClick={() => setPlaying("film")}>{Icon.play()} Play free</button>
            ) : best ? (
              <a className="btn btn-primary" href={prov?.link} target="_blank" rel="noopener noreferrer">{Icon.play()} Watch on {best.name}</a>
            ) : null}
            {trailer && <button className="btn btn-glass" onClick={() => setPlaying("trailer")}>Trailer</button>}
            <button className="icon-btn sm" style={{ width: 52, height: 52 }} aria-label="More like this" title="More like this" onClick={() => react("love")}>{Icon.heart(18)}</button>
            <button className="icon-btn sm" style={{ width: 52, height: 52 }} aria-label="Not for me" title="Not for me" onClick={() => react("nope")}>{Icon.x(18)}</button>
            <button className="icon-btn sm" style={{ width: 52, height: 52 }} aria-label="Seen it" title="Seen it" onClick={() => react("seen")}>{Icon.check()}</button>
          </div>

          {playing && (
            <div className="player rise" style={{ marginTop: 24 }}>
              <iframe
                title={playing === "film" ? movie.title : `${movie.title} trailer`}
                src={playing === "film" ? `https://archive.org/embed/${encodeURIComponent(archiveId!)}` : `https://www.youtube-nocookie.com/embed/${trailer!.key}?autoplay=1`}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          )}

          {movie.overview && <p style={{ margin: "28px 0 0", fontSize: 16, lineHeight: 1.6, color: "rgba(235,235,245,0.75)" }}>{movie.overview}</p>}

          {prov && prov.list.length > 0 && (
            <section style={{ marginTop: 28 }}>
              <h3 className="muted" style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>Where to watch</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {prov.list.slice(0, 8).map((p) => (
                  <a key={p.name} className="provider" href={prov.link} target="_blank" rel="noopener noreferrer">
                    {p.logo && <img src={p.logo} alt="" />}
                    <span style={{ fontSize: 15 }}>{p.name}<br /><span className="muted" style={{ fontSize: 13 }}>{p.type}</span></span>
                  </a>
                ))}
              </div>
              <p className="muted" style={{ margin: "12px 0 0", fontSize: 12 }}>Streaming availability data provided by JustWatch.</p>
            </section>
          )}
          {prov && prov.list.length === 0 && !archiveId && <p className="muted" style={{ marginTop: 28 }}>Not streaming in your region right now.</p>}
          {archiveId && <p className="muted" style={{ marginTop: 16, fontSize: 13 }}>Public domain · streamed from the Internet Archive.</p>}
        </div>
      </div>
    </>
  );
}
