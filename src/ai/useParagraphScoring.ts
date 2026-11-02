import { useEffect, useRef, useState } from "react";
import { ai } from "../platform/ipc";
import type { ParagraphScore, ScoreCriterion } from "./paragraph-scores";

export function useParagraphScoring(
  provider: string,
  model: string | null,
  paragraph: string,
  criteria: ScoreCriterion[],
) {
  const [result, setResult] = useState<{
    key: string;
    scores?: ParagraphScore[];
    error?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const lock = useRef(false);
  const key = JSON.stringify([provider, model, paragraph, criteria]);
  const currentKey = useRef(key);
  currentKey.current = key;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const run = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setResult(null);
    try {
      const scores = await ai.scoreParagraph(
        provider,
        model,
        paragraph,
        criteria,
      );
      if (!Array.isArray(scores)) throw new Error("Invalid scoring response");
      if (mounted.current && currentKey.current === key)
        setResult({ key, scores });
    } catch (error) {
      if (mounted.current && currentKey.current === key)
        setResult({ key, error: String(error) });
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return { result, busy, run, key };
}
