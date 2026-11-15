"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GENRES, LANGUAGES } from "@/lib/catalog";
import { onboardingDeck, pillCodes } from "@/lib/recommend";
import { describeVibe } from "@/lib/ai";
import { learn, learnKeywords, seed, type Taste, type Verdict } from "@/lib/taste";
import { details, type Movie } from "@/lib/tmdb";
import { SwipeDeck } from "./SwipeDeck";
import { Poster } from "./ui";

type Step = "pick" | "swipe" | "vibe";
const VERDICT_TEXT: Record<Verdict, string> = { love: "Loved it", nope: "Not for me", meh: "Meh", unseen: "Not seen", seen: "Seen" };

export function Onboarding({ taste, setTaste, onDone }: { taste: Taste; setTaste: (t: Taste) => void; onDone: () => void }) {
  const [step, setStep] = useState<Step>("pick");
  const [picked, setPicked] = useState<string[]>(taste.pills);
  const [deck, setDeck] = useState<Movie[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rated, setRated] = useState<{ m: Movie; v: Verdict }[]>([]);
  const [vibe, setVibe] = useState<{ sentence: string; tags: string[] } | null>(null);
  const [t, setT] = useState(taste);
  const tRef = useRef(t);
  tRef.current = t;

  const langCount = LANGUAGES.filter((p) => picked.includes(p.id)).length;
  const ready = picked.length >= 4 && langCount >= 1;

  const startSwipe = async (reseed = true) => {
    const { langs, genres } = pillCodes(picked);
    const base = reseed ? seed({ ...t, genre: {}, lang: {}, keyword: {}, rated: {}, loved: [] }, langs, genres, picked) : t;
    setT(base);
    setStep("swipe");
    setDeck(null);
    setError(null);
    try {
      const d = (await onboardingDeck(picked)).filter((m) => !base.rated[m.id]);
      if (!d.length) throw new Error("No films found for that mix — try another language or genre.");
      setDeck(d);
    } catch (e) {
      setError((e as Error).message.includes("API") ? "CINEVERSE is still being set up. Please try again in a minute." : (e as Error).message);
    }
  };

  const onRate = useCallback((m: Movie, v: Verdict) => {
    setRated((r) => [{ m, v }, ...r]);
    setT((prev) => learn(prev, m, v));
    // Keywords make the profile sharper; fetch them in the background for strong signals.
    if (v === "love" || v === "nope") {
      details(m.id)
        .then((d) => setT((prev) => learnKeywords(prev, v, (d.keywords?.keywords ?? []).map((k) => k.id))))
        .catch(() => {});
    }
  }, []);

  const finishSwipe = useCallback(async () => {
    setStep("vibe");
    const disliked = rated.filter((r) => r.v === "nope").map((r) => r.m.title);
    setVibe(await describeVibe(tRef.current, disliked));
  }, [rated]);

  const loved = useMemo(() => rated.filter((r) => r.v === "love").map((r) => r.m).slice(0, 3), [rated]);
  const progress = step === "pick" ? 0 : step === "swipe" ? (deck ? Math.min(1, rated.length / deck.length) : 0) : 1;

  useEffect(() => {
    if (step === "vibe" && vibe) setT((prev) => ({ ...prev, vibe }));
  }, [step, vibe]);

  return (
    <div className="shell screen">
      <div className="wrap" style={{ display: "flex", flexDirection: "column", flex: 1, paddingTop: 20, paddingBottom: 28 }}>
        <div className="topbar" style={{ paddingTop: 0 }}>
          <span className="wordmark">CINEVERSE</span>
          <div className="progress" style={{ width: 180 }} aria-hidden="true">
            <span><i style={{ width: "100%" }} /></span>
            <span><i style={{ width: `${Math.round(progress * 100)}%` }} /></span>
          </div>
        </div>

        {step === "pick" && (
          <div className="rise" style={{ maxWidth: 640, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", flex: 1 }}>
            <h1 className="h1" style={{ marginTop: 24 }}>What do you<br />love watching?</h1>
            <p className="muted" style={{ margin: "8px 0 0", fontSize: 17 }}>Pick at least four, including a language.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 22, margin: "32px 0", flex: 1 }}>
              {[LANGUAGES, GENRES].map((group, gi) => (
                <div key={gi} role="group" aria-label={gi ? "Genres" : "Languages"} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {group.map((p) => {
                    const on = picked.includes(p.id);
                    return (
                      <button key={p.id} className="pill" aria-pressed={on} onClick={() => setPicked(on ? picked.filter((x) => x !== p.id) : [...picked, p.id])}>
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <button className="btn btn-primary" disabled={!ready} onClick={() => startSwipe(true)} style={{ width: "100%" }}>
              {ready ? "Continue" : langCount === 0 && picked.length >= 3 ? "Pick a language" : `${Math.max(1, 4 - picked.length)} more to go`}
            </button>
          </div>
        )}

        {step === "swipe" && (
          <div className="onb-grid">
            <aside className="onb-side" aria-label="Your picks">
              <h2 className="muted" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>You picked</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[...LANGUAGES, ...GENRES].filter((p) => picked.includes(p.id)).map((p) => (
                  <span key={p.id} className="pill" aria-pressed="true" style={{ height: 34, fontSize: 14, cursor: "default" }}>{p.label}</span>
                ))}
              </div>
              <button className="btn" style={{ background: "none", color: "var(--muted)", height: 36, padding: 0, fontSize: 14, justifyContent: "flex-start" }} onClick={() => setStep("pick")}>Edit</button>
            </aside>

            <section style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ textAlign: "center", marginBottom: 8 }}>
                <h1 className="h1" style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>Seen these?</h1>
                <p className="muted" style={{ margin: "6px 0 0" }}>Swipe to rate. Up if you haven&apos;t seen it.</p>
              </div>
              {deck ? (
                <SwipeDeck key={deck.map((m) => m.id).join("-")} movies={deck} onRate={onRate} onEmpty={finishSwipe} tutorial={rated.length === 0} />
              ) : error ? (
                <div style={{ flex: 1, display: "grid", placeItems: "center", textAlign: "center", gap: 16 }}>
                  <p className="muted">{error}</p>
                  <button className="btn btn-glass" onClick={() => startSwipe(rated.length === 0)}>Try again</button>
                </div>
              ) : (
                <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
                  <Poster width={300} />
                </div>
              )}
              {deck && rated.length >= 6 && rated.length < deck.length && (
                <button className="btn" style={{ background: "none", color: "var(--muted)", height: 40, fontSize: 15, alignSelf: "center" }} onClick={finishSwipe}>
                  That&apos;s enough — show my vibe
                </button>
              )}
            </section>

            <aside className="onb-side" aria-label="Rated so far">
              <h2 className="muted" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Rated{rated.length ? ` · ${rated.length}` : ""}</h2>
              {rated.map(({ m, v }) => (
                <div key={m.id} className="rise" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Poster movie={m} width={36} size="w185" />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</span>
                  <span className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>{VERDICT_TEXT[v]}</span>
                </div>
              ))}
            </aside>
          </div>
        )}

        {step === "vibe" && (
          <div style={{ maxWidth: 560, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", flex: 1 }}>
            <div aria-hidden="true" style={{ position: "relative", height: 300, marginTop: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {loved[1] && <div className="fan-l" style={{ position: "absolute" }}><Poster movie={loved[1]} width={150} /></div>}
              {loved[2] && <div className="fan-r" style={{ position: "absolute" }}><Poster movie={loved[2]} width={150} /></div>}
              {loved[0] && <div className="fan-c" style={{ position: "absolute" }}><Poster movie={loved[0]} width={168} /></div>}
            </div>
            <div className="rise" style={{ marginTop: 36, display: "flex", flexDirection: "column", gap: 10, animationDelay: "380ms" }}>
              <p className="muted" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Your vibe</p>
              <h1 className="h1" style={{ fontSize: "clamp(28px, 4vw, 38px)", minHeight: "2.3em" }}>{vibe?.sentence ?? "Reading your taste…"}</h1>
            </div>
            <div className="rise" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18, animationDelay: "480ms" }}>
              {(vibe?.tags ?? []).map((tag) => (
                <span key={tag} className="pill" style={{ height: 34, fontSize: 14, cursor: "default" }}>{tag}</span>
              ))}
            </div>
            <div style={{ marginTop: "auto", paddingTop: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <button className="btn btn-primary" style={{ width: "100%" }} disabled={!vibe} onClick={() => { setTaste({ ...tRef.current, vibe: vibe ?? undefined, onboarded: true }); onDone(); }}>
                Start watching
              </button>
              <button className="btn" style={{ background: "none", color: "var(--muted)", height: 40, fontSize: 15 }} onClick={() => startSwipe(false)}>Rate a few more</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
