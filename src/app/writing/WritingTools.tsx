import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useModalDialog } from "../../ui/useModalDialog";
import type { DocTab } from "../../document/doc-tabs";
import { tabReadOnly } from "../../document/read-only";
import { getActiveDocument } from "../../plugins/app-bridge";
import { ParagraphScores } from "../../ai/ParagraphScores";
import { useSettings } from "../../prefs/SettingsContext";
import { closeSplit, splitEditor } from "../split/split-layout";
import { OutlineArrange } from "./OutlineArrange";
import "./writing-tools.css";

function WritingDialog({
  tab,
  onChange,
  onClose,
}: {
  tab: DocTab;
  onChange: (id: string, markdown: string) => void;
  onClose: () => void;
}) {
  const { t } = useSettings();
  const [mode, setMode] = useState<"outline" | "scores">("outline");
  const [snapshot] = useState(() => ({
    original: tab.content,
    source: tab.sourceMode
      ? tab.content
      : (getActiveDocument()?.text() ?? tab.content),
  }));
  useLayoutEffect(() => {
    const shell = document.querySelector<HTMLElement>(".app-shell");
    if (!shell) return;
    const previous = shell.inert;
    shell.inert = true;
    return () => {
      shell.inert = previous;
    };
  }, []);
  const dialog = useModalDialog(onClose);
  return createPortal(
    <div className="writing-backdrop">
      <div
        {...dialog}
        className="writing-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t.writingTools}
      >
        <header>
          <h2>{t.writingTools}</h2>
          <button type="button" onClick={onClose}>
            {mode === "outline" ? t.cancel : t.settingsDone}
          </button>
        </header>
        <nav>
          <button
            type="button"
            aria-pressed={mode === "outline"}
            onClick={() => setMode("outline")}
          >
            {t.outlineArrange}
          </button>
          <button
            type="button"
            aria-pressed={mode === "scores"}
            onClick={() => setMode("scores")}
          >
            {t.scoreParagraphs}
          </button>
        </nav>
        <div hidden={mode !== "outline"}>
          <OutlineArrange
            source={snapshot.source}
            t={t}
            onClose={onClose}
            onApply={(next) => {
              if (tabReadOnly(tab) || tab.content !== snapshot.original)
                return false;
              if (next === snapshot.source) return true;
              if (tab.sourceMode) {
                onChange(tab.id, next);
                return true;
              }
              return (
                getActiveDocument()?.replaceText?.(snapshot.source, next) ??
                false
              );
            }}
          />
        </div>
        {mode === "scores" && <ParagraphScores content={tab.content} />}
      </div>
    </div>,
    document.body,
  );
}

export function WritingTools({
  tab,
  onChange,
}: {
  tab: DocTab;
  onChange: (id: string, markdown: string) => void;
}) {
  const { t } = useSettings();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        className="writing-launcher"
        role="group"
        aria-label={t.writingTools}
      >
        <button type="button" onClick={() => splitEditor("row")}>
          {t.documentSplit}
        </button>
        <button type="button" onClick={closeSplit}>
          {t.menuCloseSplit}
        </button>
        <button
          type="button"
          disabled={!!tab.view || tabReadOnly(tab)}
          onClick={() => setOpen(true)}
        >
          {t.writingTools}
        </button>
      </div>
      {open && (
        <WritingDialog
          key={tab.id}
          tab={tab}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
