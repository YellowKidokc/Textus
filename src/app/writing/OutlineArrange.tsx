import { useMemo, useState } from "react";
import { moveSection, outlineSections } from "../../sidebar/outline-edit";
import type { Strings } from "../../i18n/strings";

export function OutlineArrange({
  source,
  onApply,
  onClose,
  t,
}: {
  source: string;
  onApply: (next: string) => boolean;
  onClose: () => void;
  t: Strings;
}) {
  const [draft, setDraft] = useState(source);
  const [levels, setLevels] = useState([1, 2, 3, 4]);
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [dragged, setDragged] = useState<number | null>(null);
  const sections = useMemo(
    () => outlineSections(draft).filter((s) => levels.includes(s.level)),
    [draft, levels],
  );
  const move = (from: number, before: number) => {
    const next = moveSection(draft, from, before);
    if (next === draft) return;
    setHistory([...history, draft]);
    setDraft(next);
  };
  return (
    <>
      <p>{t.outlineArrangeHint}</p>
      <fieldset className="writing-levels">
        <legend>{t.outlineLevels}</legend>
        {[1, 2, 3, 4, 5, 6].map((level) => (
          <label key={level}>
            <input
              type="checkbox"
              checked={levels.includes(level)}
              onChange={() =>
                setLevels(
                  levels.includes(level)
                    ? levels.filter((l) => l !== level)
                    : [...levels, level],
                )
              }
            />
            H{level}
          </label>
        ))}
      </fieldset>
      <ol className="writing-outline">
        {sections.map((s, index) => {
          const previous = sections
            .slice(0, index)
            .reverse()
            .find((p) => p.end <= s.start && p.level <= s.level);
          const next = sections.slice(index + 1).find((p) => p.start >= s.end);
          return (
            <li
              key={s.start}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", String(s.start));
                setDragged(s.start);
              }}
              onDragEnd={() => setDragged(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragged !== null) move(dragged, s.start);
                setDragged(null);
              }}
            >
              <span style={{ paddingInlineStart: (s.level - 1) * 12 }}>
                {s.title}
              </span>
              <button
                type="button"
                aria-label={t.outlineMoveUp}
                disabled={!previous}
                onClick={() => previous && move(s.start, previous.start)}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={t.outlineMoveDown}
                disabled={!next}
                onClick={() => next && move(s.start, next.end)}
              >
                ↓
              </button>
            </li>
          );
        })}
      </ol>
      {!sections.length && <p>{t.outlineEmpty}</p>}
      {error && <p role="alert">{t.outlineConflict}</p>}
      <footer>
        <button
          type="button"
          disabled={!history.length}
          onClick={() => {
            setDraft(history[history.length - 1]);
            setHistory(history.slice(0, -1));
          }}
        >
          {t.menuUndo}
        </button>
        <button type="button" onClick={onClose}>
          {t.cancel}
        </button>
        <button
          type="button"
          onClick={() => {
            if (onApply(draft)) onClose();
            else setError(true);
          }}
        >
          {t.grammarApply}
        </button>
      </footer>
    </>
  );
}
