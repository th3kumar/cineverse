"use client";
import { useCallback, useEffect, useState } from "react";
import { LANG_NAMES, MOODS } from "@/lib/catalog";
import { explain, offlineWhy, planMood } from "@/lib/ai";
import { becauseYouLoved, freeFilms, picksFor } from "@/lib/recommend";
import { learn, learnKeywords, type Taste, type Verdict } from "@/lib/taste";
import { img, year, type Movie } from "@/lib/tmdb";
import { canListen, Listening } from "./Listening";
import { MovieSheet } from "./MovieSheet";
import { Icon, Poster, Toast } from "./ui";

type Row = { title: string; movies: (Movie & { archiveId?: string })[] | null };
type Ask = { text: string; reply: string; movies: Movie[]; reasons: Record<number, string> } | null;

const REACT_LINES: Record<Verdict, string[]> = {
  love: ["Noted. More like that.", "Leaning into that.", "Got it — keep them coming."],
  nope: ["Fair. Skipping that tone.", "Less of that, then.", "Moving on."],
  meh: ["Okay, toning that down."],
  unseen: ["Noted."],
  seen: ["Seen it — I'll keep it out."],
};

export function Home({ taste, setTaste, onRestart }: { taste: Taste; setTaste: (t: Taste) => void; onRestart: () => void }) {
  const [forYou, setForYou] = useState<Movie[] | null>(null);
  const [heroWhy, setHeroWhy] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [ask, setAsk] = useState<Ask>(null);
  const [asking, setAsking] = useState(false);
  const [input, setInput] = useState("");
  const [open, setOpen] = useState<{ m: Movie; why?: string } | null>(null);
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => setVoice(canListen()), []);

  // Initial load: picks for you, "because you loved", free classics.
  useEffect(() => {
    let alive = true;
    picksFor(taste, undefined, 13)
      .then(async (ms) => {
        if (!alive) return;
        setForYou(ms);
        if (ms[0]) setHeroWhy((await explain("tonight", [ms[0]], taste))[ms[0].id]);
      })
      .catch(() => alive && setFailed(true));
    Promise.all([becauseYouLoved(taste).catch(() => null), freeFilms().catch(() => [])]).then(([b, free]) => {
      if (!alive) return;
      const next: Row[] = [];
      if (b && b.movies.length) next.push({ title: `Because you loved ${b.title}`, movies: b.movies });
      if (free.length) next.push({ title: "Free to watch now", movies: free });
      setRows(next);
    });
    return () => {
      alive = false;
    };
    // Load once per session; reactions update rankings without refetching everything.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const react = useCallback(
    (m: Movie, v: Verdict, keywords: number[] = []) => {
      setTaste(learnKeywords(learn(taste, m, v), v, keywords));
      const lines = REACT_LINES[v];
      setToast(lines[Math.floor(Math.random() * lines.length)]);
      const drop = (xs: Movie[] | null) => (xs ? xs.filter((x) => x.id !== m.id) : xs);
      if (v !== "love") {
        setForYou(drop);
        setAsk((a) => (a ? { ...a, movies: a.movies.filter((x) => x.id !== m.id) } : a));
      }
    },
    [taste, setTaste],
  );

  const run = async (text: string) => {
    const q = text.trim();
    if (!q) return;
    setInput("");
    setAsking(true);
    setAsk({ text: q, reply: "", movies: [], reasons: {} });
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const plan = await planMood(q, taste);
      const movies = await picksFor(taste, plan, 10);
      setAsk({ text: q, reply: plan.reply, movies, reasons: Object.fromEntries(movies.map((m) => [m.id, offlineWhy(m, taste)])) });
      const reasons = await explain(q, movies.slice(0, 8), taste);
      setAsk((a) => (a && a.text === q ? { ...a, reasons: { ...a.reasons, ...reasons } } : a));
    } catch {
      setAsk({ text: q, reply: "I couldn't reach the film library just now.", movies: [], reasons: {} });
    } finally {
      setAsking(false);
    }
  };

  const hero = forYou?.[0];
  const vibe = taste.vibe?.tags?.[0] ?? taste.langs.map((l) => LANG_NAMES[l]).slice(0, 2).join(" · ");

  return (
    <div className="shell screen">
      <div className="wrap">
        <header className="topbar">
          <span className="wordmark">CINEVERSE</span>
          <button className="pill" style={{ height: 36, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 8 }} onClick={onRestart} title="Retake the taste quiz">
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: "#E9A35B" }} />
            {vibe || "Your vibe"}
          </button>
        </header>
      </div>

      <main className="wrap" style={{ display: "flex", flexDirection: "column", gap: 44, paddingBottom: 64 }}>
        {failed && !forYou && (
          <p className="muted" style={{ textAlign: "center", padding: 40 }}>Couldn&apos;t reach the film library. Check back in a minute.</p>
        )}

        <div style={{ position: "relative" }}>
          {/* Hero: tonight's top pick */}
          <section
            className="hero rise"
            aria-label="Tonight's pick"
            style={{ backgroundImage: hero ? `url(${img(hero.backdrop_path, "w1280") ?? img(hero.poster_path, "w780")})` : undefined }}
          >
            {hero && (
              <div style={{ position: "relative", padding: "clamp(24px, 5vw, 56px)", paddingBottom: 96, maxWidth: 620, display: "flex", flexDirection: "column", gap: 10 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.75)" }}>Tonight&apos;s pick</p>
                <h1 className="h1" style={{ fontSize: "clamp(36px, 6vw, 64px)" }}>{hero.title}</h1>
                <p style={{ margin: 0, color: "rgba(255,255,255,0.75)" }}>{[year(hero), LANG_NAMES[hero.original_language]].filter(Boolean).join(" · ")}</p>
                {heroWhy && <p className="rise" style={{ margin: "4px 0 0", fontSize: 18, lineHeight: 1.4 }}>{heroWhy}</p>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
                  <button className="btn btn-primary" onClick={() => setOpen({ m: hero, why: heroWhy })}>{Icon.play()} Watch</button>
                  <button className="icon-btn" style={{ background: "rgba(255,255,255,0.16)" }} aria-label="More like this" onClick={() => react(hero, "love")}>{Icon.heart(18)}</button>
                  <button className="icon-btn" style={{ background: "rgba(255,255,255,0.16)" }} aria-label="Not for me" onClick={() => react(hero, "nope")}>{Icon.x(18)}</button>
                </div>
              </div>
            )}
          </section>

          {/* Ask bar floating over the hero */}
          <form
            className="rise"
            style={{ position: "relative", maxWidth: 720, margin: "-30px auto 0", padding: "0 12px", animationDelay: "80ms" }}
            onSubmit={(e) => {
              e.preventDefault();
              run(input);
            }}
          >
            <div className="ask">
              <label htmlFor="ask" className="sr-only">What&apos;s the mood tonight?</label>
              <input id="ask" value={input} onChange={(e) => setInput(e.target.value)} placeholder="What's the mood tonight?" autoComplete="off" enterKeyHint="search" />
              {input.trim() ? (
                <button type="submit" className="icon-btn light sm" style={{ width: 48, height: 48 }} aria-label="Ask">{Icon.up(20)}</button>
              ) : voice ? (
                <button type="button" className="icon-btn light sm" style={{ width: 48, height: 48 }} aria-label="Talk" onClick={() => setListening(true)}>{Icon.mic()}</button>
              ) : null}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 14 }}>
              {MOODS.map((m) => (
                <button key={m.label} type="button" className="pill" style={{ height: 36, fontSize: 14, background: "rgba(255,255,255,0.08)" }} onClick={() => run(m.text)}>
                  {m.label}
                </button>
              ))}
            </div>
          </form>
        </div>

        {ask && (
          <section aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p className="rise" style={{ margin: 0, alignSelf: "flex-end", maxWidth: 420, padding: "10px 16px", borderRadius: 20, background: "var(--glass)", fontSize: 16 }}>{ask.text}</p>
              <h2 className="h2 rise" style={{ fontSize: 28, minHeight: 34 }}>{asking && !ask.reply ? "Thinking…" : ask.reply}</h2>
            </div>
            <div className="row">
              {(asking && !ask.movies.length ? Array.from({ length: 5 }, () => undefined) : ask.movies).map((m, i) => (
                <article key={m?.id ?? i} className={m ? "card-in" : undefined} style={{ width: "clamp(200px, 62vw, 240px)", flex: "none", display: "flex", flexDirection: "column", gap: 10, animationDelay: `${i * 60}ms` }}>
                  <button className="poster-link" aria-label={m ? `Open ${m.title}` : "Loading"} onClick={() => m && setOpen({ m, why: ask.reasons[m.id] })}>
                    <Poster movie={m} width="100%" size="w500" />
                  </button>
                  {m && (
                    <>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 17 }}>{m.title}</p>
                        <p className="muted" style={{ margin: "2px 0 0", fontSize: 14 }}>{[year(m), LANG_NAMES[m.original_language]].filter(Boolean).join(" · ")}</p>
                        <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.4, color: "rgba(235,235,245,0.8)" }}>{ask.reasons[m.id]}</p>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="icon-btn sm" aria-label={`Not for me: ${m.title}`} onClick={() => react(m, "nope")}>{Icon.x(16)}</button>
                        <button className="icon-btn sm light" aria-label={`More like ${m.title}`} onClick={() => react(m, "love")}>{Icon.heart(16)}</button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
            {!asking && ask.movies.length === 0 && ask.reply && <p className="muted">Nothing matched — try different words.</p>}
          </section>
        )}

        <PosterRow title="For you" movies={forYou ? forYou.slice(1) : null} onOpen={(m) => setOpen({ m })} width={200} />
        {rows.map((r) => (
          <PosterRow key={r.title} title={r.title} movies={r.movies} onOpen={(m) => setOpen({ m })} width={168} />
        ))}

        <footer className="muted" style={{ fontSize: 12, display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", paddingTop: 24, borderTop: "1px solid var(--line)" }}>
          <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
          <span>Streaming data by JustWatch · Free films from the Internet Archive</span>
        </footer>
      </main>

      {open && <MovieSheet movie={open.m} reason={open.why} onClose={() => setOpen(null)} onReact={react} />}
      {listening && (
        <Listening
          onCancel={() => setListening(false)}
          onDone={(text) => {
            setListening(false);
            run(text);
          }}
        />
      )}
      <Toast text={toast} />
    </div>
  );
}

function PosterRow({ title, movies, onOpen, width }: { title: string; movies: (Movie & { archiveId?: string })[] | null; onOpen: (m: Movie) => void; width: number }) {
  if (movies && movies.length === 0) return null;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 className="h2">{title}</h2>
      <div className="row">
        {(movies ?? Array.from({ length: 7 }, () => undefined)).map((m, i) => (
          <button key={m?.id ?? i} className="poster-link" aria-label={m ? `Open ${m.title}` : "Loading"} onClick={() => m && onOpen(m)} style={{ flex: "none" }}>
            <Poster movie={m} width={width} badge={m && "archiveId" in m && m.archiveId ? "Free" : undefined} />
          </button>
        ))}
      </div>
    </section>
  );
}
