import { useMemo, useState } from "react";
import { useParagraphScoring } from "./useParagraphScoring";
import { useSettings } from "../prefs/SettingsContext";
import { getUiState, setUiState } from "../storage/ui-state";
import {
  paragraphs,
  validCriteria,
  type ScoreCriterion,
} from "./paragraph-scores";
import "./paragraph-scores.css";

export function ParagraphScores({ content }: { content: string }) {
  const { t, settings } = useSettings();
  const blocks = useMemo(() => paragraphs(content), [content]);
  const [index, setIndex] = useState(0);
  const [criteria, setCriteria] = useState<ScoreCriterion[]>(() => {
    const saved = validCriteria(getUiState("paragraphCriteria"));
    return saved.length
      ? saved
      : [
          t.scoreClarity,
          t.scoreEvidence,
          t.scorePersuasion,
          t.scoreAccuracy,
        ].map((name) => ({ name, instruction: name }));
  });
  const paragraph =
    blocks[Math.min(index, Math.max(0, blocks.length - 1))]?.text ?? "";
  const model = settings.agentModels[settings.aiProvider] || null;
  const { result, busy, run, key } = useParagraphScoring(
    settings.aiProvider,
    model,
    paragraph,
    criteria,
  );
  const change = (next: ScoreCriterion[]) => {
    setCriteria(next);
    setUiState("paragraphCriteria", next);
  };
  const valid =
    validCriteria(criteria).length === criteria.length &&
    criteria.length > 0 &&
    new Set(criteria.map((c) => c.name.trim())).size === criteria.length;
  return (
    <section className="paragraph-scores" aria-label={t.scoreParagraphs}>
      <h3>{t.scoreParagraphs}</h3>
      <p>{t.scoreHint}</p>
      <select
        aria-label={t.scoreParagraphs}
        value={Math.min(index, Math.max(0, blocks.length - 1))}
        onChange={(e) => setIndex(Number(e.target.value))}
        disabled={!blocks.length}
      >
        {blocks.map((b, i) => (
          <option key={b.start} value={i}>
            {i + 1}. {b.text.slice(0, 70)}
          </option>
        ))}
      </select>
      <blockquote>{paragraph || t.scoreEmpty}</blockquote>
      <details>
        <summary>
          {t.scoreCriteria} ({criteria.length}/20)
        </summary>
        {criteria.map((criterion, i) => (
          <fieldset key={i}>
            <label>
              {t.scoreName}
              <input
                maxLength={80}
                value={criterion.name}
                onChange={(e) =>
                  change(
                    criteria.map((c, n) =>
                      n === i ? { ...c, name: e.target.value } : c,
                    ),
                  )
                }
              />
            </label>
            <label>
              {t.scoreInstruction}
              <textarea
                maxLength={2000}
                value={criterion.instruction}
                onChange={(e) =>
                  change(
                    criteria.map((c, n) =>
                      n === i ? { ...c, instruction: e.target.value } : c,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              onClick={() => change(criteria.filter((_, n) => n !== i))}
            >
              {t.apiKeyClear}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={criteria.length >= 20}
          onClick={() => change([...criteria, { name: "", instruction: "" }])}
        >
          {t.scoreAdd}
        </button>
      </details>
      <button
        type="button"
        disabled={busy || !valid || !paragraph || !settings.textusAi}
        onClick={() => void run()}
      >
        {busy ? t.agentThinking : t.scoreRun}
      </button>
      <div aria-live="polite">
        {result?.key === key && result.error && (
          <p role="alert">{result.error}</p>
        )}
        {result?.key === key &&
          result.scores?.map((s) => (
            <article key={s.name}>
              <strong>
                {s.name}: {s.score === null ? "—" : `${s.score}/100`}
              </strong>
              <p>{s.reason}</p>
            </article>
          ))}
      </div>
    </section>
  );
}
