"use client";
import { useState } from "react";
import { img, type Movie } from "@/lib/tmdb";

export const Icon = {
  mic: (s = 20) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></svg>
  ),
  x: (s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
  ),
  heart: (s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.3 5 6.8 5c2 0 3.4 1.1 4.2 2.3h2C13.8 6.1 15.2 5 17.2 5c3.5 0 5.6 3.6 4.3 6.8C19.5 16.4 12 21 12 21z" /></svg>
  ),
  meh: (s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M6 12h12" /></svg>
  ),
  eyeOff: (s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a12 12 0 0 1-2.6 3.6M6.6 6.6C4.2 8 2.6 10.2 2 12c1 2.5 5 7 10 7a9.6 9.6 0 0 0 4.4-1.1" /></svg>
  ),
  check: (s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
  ),
  play: (s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
  ),
  down: (s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
  ),
  up: (s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
  ),
  back: (s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
  ),
};

const TINTS = ["#7A3B1E", "#1F4A5A", "#4A5226", "#2E3442", "#5A1717", "#3A2A4A", "#1E3A2E", "#5A4214"];

export function Poster({ movie, width, size = "w342", badge, priority }: { movie?: Movie; width: number | string; size?: "w185" | "w342" | "w500" | "w780"; badge?: string; priority?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  if (!movie) return <div className="poster skeleton" style={{ width }} aria-hidden="true" />;
  const src = img(movie.poster_path, size);
  return (
    <div className="poster" style={{ width, background: src ? undefined : TINTS[movie.id % TINTS.length] }}>
      {src ? (
        <img src={src} alt="" loading={priority ? "eager" : "lazy"} className={loaded ? "loaded" : ""} onLoad={() => setLoaded(true)} />
      ) : (
        <span className="fallback">{movie.title}</span>
      )}
      {badge && <span className="badge">{badge}</span>}
    </div>
  );
}

export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="toast" role="status" key={text}>
      {text}
    </div>
  );
}
