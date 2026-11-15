"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { img, year, type Movie } from "@/lib/tmdb";
import { LANG_NAMES } from "@/lib/catalog";
import type { Verdict as AnyVerdict } from "@/lib/taste";

type Verdict = Exclude<AnyVerdict, "seen">;
import { Icon } from "./ui";

const ORDER: Verdict[] = ["love", "nope", "meh", "unseen"];
const LABEL: Record<Verdict, string> = { love: "Loved it", nope: "Not for me", meh: "Meh", unseen: "Haven't seen" };
const ARROW: Record<Verdict, string> = { love: "→", nope: "←", meh: "↓", unseen: "↑" };
const FLY: Record<Verdict, string> = {
  love: "translate(140vw, 40px) rotate(22deg)",
  nope: "translate(-140vw, 40px) rotate(-22deg)",
  unseen: "translate(0, -140vh)",
  meh: "translate(0, 140vh)",
};
const DEMO: Record<Verdict, string> = {
  love: "translate(120px, 8px) rotate(9deg)",
  nope: "translate(-120px, 8px) rotate(-9deg)",
  meh: "translate(0, 110px)",
  unseen: "translate(0, -110px)",
};
const KEYS: Record<string, Verdict> = { ArrowRight: "love", ArrowLeft: "nope", ArrowUp: "unseen", ArrowDown: "meh" };
const T = 90;

export function SwipeDeck({ movies, onRate, onEmpty, tutorial }: { movies: Movie[]; onRate: (m: Movie, v: AnyVerdict) => void; onEmpty: () => void; tutorial: boolean }) {
  const [idx, setIdx] = useState(0);
  const [out, setOut] = useState<Record<number, Verdict>>({});
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [tut, setTut] = useState(tutorial);
  const [step, setStep] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tut) return;
    const t = setInterval(() => setStep((s) => (s + 1) % 8), 950);
    return () => clearInterval(t);
  }, [tut]);

  useEffect(() => {
    if (!tut) topRef.current?.focus({ preventScroll: true });
  }, [tut, idx]);

  const rate = useCallback(
    (v: Verdict) => {
      const m = movies[idx];
      if (!m) return;
      start.current = null;
      setDrag(null);
      setOut((o) => ({ ...o, [idx]: v }));
      setIdx((i) => i + 1);
      onRate(m, v);
      if (idx + 1 >= movies.length) setTimeout(onEmpty, 350);
    },
    [idx, movies, onRate, onEmpty],
  );

  const tutDir = ORDER[Math.floor(step / 2)];
  const tutOut = step % 2 === 0;
  const horiz = drag ? Math.abs(drag.dx) >= Math.abs(drag.dy) : true;
  const amount = (v: Verdict) => {
    if (tut) return tutOut && tutDir === v ? 1 : 0;
    if (!drag) return 0;
    const c = (x: number) => Math.max(0, Math.min(1, x / T));
    return v === "love" ? (horiz ? c(drag.dx) : 0) : v === "nope" ? (horiz ? c(-drag.dx) : 0) : v === "unseen" ? (!horiz ? c(-drag.dy) : 0) : !horiz ? c(drag.dy) : 0;
  };
  const decide = (dx: number, dy: number): Verdict | null =>
    Math.abs(dx) >= Math.abs(dy) ? (dx > T ? "love" : dx < -T ? "nope" : null) : dy < -T ? "unseen" : dy > T ? "meh" : null;

  const done = idx >= movies.length;
  const current = movies[idx];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, minHeight: 0 }}>
      <div className="deck">
        {/* direction labels: only on wide screens, lit by drag or tutorial */}
        <div className="dir-wrap" aria-hidden="true">
          {ORDER.map((v) => (
            <span key={v} className={`dir-label dir-${v}`} style={{ opacity: done ? 0 : 0.3 + amount(v) * 0.7 }}>
              {v === "love" ? `${LABEL[v]} →` : v === "nope" ? `← ${LABEL[v]}` : `${ARROW[v]} ${LABEL[v]}`}
            </span>
          ))}
        </div>

        {movies.map((m, i) => {
          const off = i - idx;
          if (off > 3) return null;
          const top = off === 0;
          let transform = "none";
          let transition = "transform 640ms var(--spring), opacity 400ms var(--ease)";
          let opacity = 1;
          if (off < 0) {
            transform = FLY[out[i] ?? "love"];
            opacity = 0;
          } else if (top && tut) {
            transform = tutOut ? DEMO[tutDir] : "none";
            transition = "transform 760ms var(--ease)";
          } else if (top && drag) {
            transform = `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx / 16}deg)`;
            transition = "none";
          } else if (off > 0) {
            transform = `translateY(${off * 16}px) scale(${1 - off * 0.05})`;
            opacity = off > 2 ? 0 : 1 - off * 0.3;
          }
          if (off < -2) return null;
          return (
            <div
              key={m.id}
              ref={top ? topRef : undefined}
              className="swipe-card"
              tabIndex={top && !tut ? 0 : -1}
              aria-label={top ? `${m.title}${year(m) ? `, ${year(m)}` : ""}. Use arrow keys to rate.` : undefined}
              aria-hidden={!top}
              style={{ transform, transition, opacity, zIndex: 50 - off, pointerEvents: top && !tut ? "auto" : "none", cursor: drag ? "grabbing" : "grab" }}
              onKeyDown={(e) => {
                const v = KEYS[e.key];
                if (top && v && !tut) {
                  e.preventDefault();
                  rate(v);
                }
              }}
              onPointerDown={(e) => {
                if (!top || tut) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                start.current = { x: e.clientX, y: e.clientY };
                setDrag({ dx: 0, dy: 0 });
              }}
              onPointerMove={(e) => {
                if (!start.current) return;
                setDrag({ dx: e.clientX - start.current.x, dy: e.clientY - start.current.y });
              }}
              onPointerUp={() => {
                if (!start.current || !drag) return;
                const v = decide(drag.dx, drag.dy);
                if (v) rate(v);
                else {
                  start.current = null;
                  setDrag(null);
                }
              }}
              onPointerCancel={() => {
                start.current = null;
                setDrag(null);
              }}
            >
              {m.poster_path ? <img src={img(m.poster_path, "w500")} alt="" draggable={false} /> : null}
              <div className="meta">
                <p style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>{m.title}</p>
                <p style={{ margin: "2px 0 0", fontSize: 15, color: "rgba(235,235,245,0.75)" }}>
                  {[year(m), LANG_NAMES[m.original_language] ?? m.original_language.toUpperCase()].filter(Boolean).join(" · ")}
                </p>
              </div>
              {top && (
                <>
                  <span className="stamp love" style={{ top: 22, left: 20, opacity: amount("love") }}>Loved it</span>
                  <span className="stamp" style={{ top: 22, right: 20, opacity: amount("nope") }}>Not for me</span>
                  <span className="stamp" style={{ top: 22, left: "50%", translate: "-50% 0", opacity: amount("meh") }}>Meh</span>
                  <span className="stamp" style={{ bottom: 100, left: "50%", translate: "-50% 0", opacity: amount("unseen") }}>Haven&apos;t seen</span>
                  <span className="finger" style={{ opacity: tut ? 1 : 0 }} />
                </>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ position: "relative", minHeight: 128 }}>
        {tut ? (
          <div className="rise" style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 420, margin: "0 auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px 12px" }}>
              {ORDER.map((v) => (
                <span key={v} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, opacity: v === tutDir ? 1 : 0.35, transition: "opacity 220ms var(--ease)" }}>
                  <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 999, background: "rgba(255,255,255,0.12)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{ARROW[v]}</span>
                  {LABEL[v]}
                </span>
              ))}
            </div>
            <button className="btn btn-primary" onClick={() => { setTut(false); setStep(1); }}>
              Got it
            </button>
          </div>
        ) : !done && current ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div role="group" aria-label="Rate without swiping" className="sr-focus" style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <button className="icon-btn" aria-label="Not for me" onClick={() => rate("nope")}>{Icon.x()}</button>
              <button className="icon-btn sm" aria-label="Meh" onClick={() => rate("meh")}>{Icon.meh()}</button>
              <button className="icon-btn sm" aria-label="Haven't seen it" onClick={() => rate("unseen")}>{Icon.eyeOff()}</button>
              <button className="icon-btn light" aria-label="Loved it" onClick={() => rate("love")}>{Icon.heart()}</button>
            </div>
            <button className="btn" style={{ background: "transparent", color: "var(--muted)", height: 44, fontSize: 15 }} onClick={() => { setTut(true); setStep(0); }}>
              Show me again
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
