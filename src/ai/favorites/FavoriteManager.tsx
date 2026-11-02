import { createPortal } from "react-dom";
import { useModalDialog } from "../../ui/useModalDialog";
import type { Strings } from "../../i18n/strings";
import type { FavoriteAction } from "./favorite-actions";

export function FavoriteManager({
  actions,
  onChange,
  onClose,
  t,
}: {
  actions: FavoriteAction[];
  onChange: (actions: FavoriteAction[]) => void;
  onClose: () => void;
  t: Strings;
}) {
  const dialog = useModalDialog(onClose);
  return createPortal(
    <div className="favorite-dialog-backdrop">
      <div
        {...dialog}
        className="favorite-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t.favoriteManage}
      >
        <header>
          <h2>{t.favoriteManage}</h2>
          <button type="button" onClick={onClose}>
            {t.settingsDone}
          </button>
        </header>
        {actions.map((action, i) => (
          <fieldset key={action.id}>
            <label>
              {t.scoreName}
              <input
                maxLength={200}
                value={action.name}
                onChange={(e) =>
                  onChange(
                    actions.map((a) =>
                      a.id === action.id ? { ...a, name: e.target.value } : a,
                    ),
                  )
                }
              />
            </label>
            <label>
              {t.scoreInstruction}
              <textarea
                maxLength={2000}
                value={action.instruction}
                onChange={(e) =>
                  onChange(
                    actions.map((a) =>
                      a.id === action.id
                        ? { ...a, instruction: e.target.value }
                        : a,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              aria-label={t.outlineMoveUp}
              disabled={i === 0}
              onClick={() => {
                const next = [...actions];
                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                onChange(next);
              }}
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() =>
                onChange(actions.filter((a) => a.id !== action.id))
              }
            >
              {t.apiKeyClear}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange([
              ...actions,
              { id: crypto.randomUUID(), name: "", instruction: "" },
            ])
          }
        >
          {t.favoriteAdd}
        </button>
      </div>
    </div>,
    document.body,
  );
}
