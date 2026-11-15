"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui";

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function getRecognizer(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = () => !!getRecognizer();

/** Voice input using the browser's own speech recognition (Chrome, Edge, Safari). */
export function Listening({ onDone, onCancel }: { onDone: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const finalText = useRef("");

  useEffect(() => {
    const R = getRecognizer();
    if (!R) return;
    const r = new R();
    r.lang = navigator.language?.startsWith("hi") ? "hi-IN" : "en-IN";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      const parts = Array.from(e.results).map((res) => res[0]?.transcript ?? "");
      finalText.current = parts.join(" ").trim();
      setText(finalText.current);
    };
    r.onerror = (e) => setError(e.error === "not-allowed" ? "Microphone access is blocked." : "Didn't catch that.");
    r.onend = () => {
      if (finalText.current) onDone(finalText.current);
    };
    rec.current = r;
    try {
      r.start();
    } catch {
      setError("Couldn't start the microphone.");
    }
    return () => r.abort();
  }, [onDone]);

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Listening" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "120px 28px 48px", animation: "fadeIn 360ms var(--ease) both" }}>
      <div className="orb-wrap" aria-hidden="true">
        <span className="halo" />
        <span className="orb" />
      </div>
      <p aria-live="polite" style={{ flex: 1, margin: "56px 0 0", maxWidth: 640, fontSize: "clamp(26px, 4vw, 36px)", lineHeight: 1.2, fontWeight: 600, letterSpacing: "-0.02em", textAlign: "center" }}>
        {error ?? (text || <span style={{ color: "var(--faint)" }}>What&apos;s the mood?</span>)}
      </p>
      <div style={{ display: "flex", gap: 40 }}>
        <button className="icon-btn" style={{ width: 64, height: 64 }} aria-label="Cancel" onClick={onCancel}>{Icon.x()}</button>
        <button className="icon-btn light" style={{ width: 64, height: 64 }} aria-label="Done" onClick={() => (finalText.current ? onDone(finalText.current) : rec.current?.stop())}>
          {Icon.up()}
        </button>
      </div>
    </div>
  );
}
