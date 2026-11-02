import { useState } from "react";
import { createPortal } from "react-dom";
import { useSettings } from "../../prefs/SettingsContext";
import { getUiState, setUiState } from "../../storage/ui-state";
import type { EditorRunner } from "../../editor/useEditorRunner";
import { favoriteActions, type FavoriteAction } from "./favorite-actions";
import { useFavoriteRewrites } from "./useFavoriteRewrites";
import { FavoriteManager } from "./FavoriteManager";
import { RewriteHistory } from "./RewriteHistory";
import "./favorites.css";

export function FavoriteRewrites({
  run,
  document,
}: {
  run: EditorRunner;
  document: string;
}) {
  const { t, settings } = useSettings();
  const [actions, setActions] = useState<FavoriteAction[]>(() => {
    const stored = getUiState("favoriteActions");
    return Array.isArray(stored)
      ? favoriteActions(stored)
      : [
          {
            id: "academic",
            name: t.favoriteAcademic,
            instruction: t.favoriteAcademicPrompt,
          },
          {
            id: "shorten",
            name: t.favoriteShorten,
            instruction: t.favoriteShortenPrompt,
          },
        ];
  });
  const [manager, setManager] = useState(false);
  const [history, setHistory] = useState(false);
  const rewrites = useFavoriteRewrites(run, document, settings, t);
  const change = (next: FavoriteAction[]) => {
    setActions(next);
    setUiState("favoriteActions", next);
  };
  return (
    <>
      <div className="favorite-launcher">
        <button type="button" onClick={() => setHistory(true)}>
          {t.favoriteHistory}
        </button>
        <button type="button" onClick={() => setManager(true)}>
          {t.favoriteManage}
        </button>
      </div>
      {(rewrites.error || rewrites.hasUnsaved) && (
        <div className="favorite-error" role="alert">
          {rewrites.error ?? t.favoriteSaveFailed}
          {rewrites.hasUnsaved && (
            <button type="button" onClick={() => void rewrites.retrySave()}>
              {t.agentRetry}
            </button>
          )}
          <button type="button" onClick={rewrites.clearError}>
            {t.settingsDone}
          </button>
        </div>
      )}
      {rewrites.selected &&
        settings.textusAi &&
        !manager &&
        !history &&
        createPortal(
          <div
            className="favorite-selection-actions floating-surface"
            style={{ left: rewrites.x, top: rewrites.y }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <details>
              <summary>{t.favoriteActions}</summary>
              <div className="favorite-action-list">
                {actions.map((action) => (
                  <button
                    type="button"
                    key={action.id}
                    disabled={!action.name.trim() || !action.instruction.trim()}
                    onClick={(e) => {
                      const details = e.currentTarget.closest("details");
                      if (details) details.open = false;
                      void rewrites.apply(action);
                    }}
                  >
                    {action.name || t.scoreName}
                  </button>
                ))}
              </div>
            </details>
          </div>,
          globalThis.document.body,
        )}
      {manager && (
        <FavoriteManager
          actions={actions}
          onChange={change}
          onClose={() => setManager(false)}
          t={t}
        />
      )}
      {history && <RewriteHistory onClose={() => setHistory(false)} t={t} />}
    </>
  );
}
