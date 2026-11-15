"use client";
import { useCallback, useEffect, useState } from "react";
import { emptyTaste, loadTaste, resetTaste, saveTaste, type Taste } from "@/lib/taste";
import { Home } from "./Home";
import { Onboarding } from "./Onboarding";

export function App() {
  const [taste, setTasteState] = useState<Taste | null>(null);
  const [restartKey, setRestartKey] = useState(0);

  useEffect(() => setTasteState(loadTaste() ?? emptyTaste()), []);

  const setTaste = useCallback((t: Taste) => {
    setTasteState(t);
    saveTaste(t);
  }, []);

  if (!taste) return <div className="shell" aria-busy="true" />;

  if (!taste.onboarded) {
    return <Onboarding key={restartKey} taste={taste} setTaste={setTaste} onDone={() => window.scrollTo({ top: 0 })} />;
  }
  return (
    <Home
      taste={taste}
      setTaste={setTaste}
      onRestart={() => {
        if (!confirmRestart()) return;
        resetTaste();
        setRestartKey((k) => k + 1);
        setTasteState(emptyTaste());
      }}
    />
  );
}

// A native confirm keeps this tiny; it only guards wiping the local taste profile.
function confirmRestart() {
  try {
    return window.confirm("Retake the taste quiz? Your current vibe will be reset.");
  } catch {
    return true;
  }
}
