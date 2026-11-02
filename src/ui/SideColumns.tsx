import { useRef, useState, type ReactNode } from "react";
import { useSettings } from "../prefs/SettingsContext";
import { getUiState, setUiState } from "../storage/ui-state";
import { columnSettings } from "./side-columns-model";
import "./side-columns.css";

/** Independent panel columns; the separators work with pointer and keyboard. */
export function SideColumns({
  side,
  children,
  labels,
}: {
  side: "left" | "right";
  children: ReactNode[];
  labels: string[];
}) {
  const { t } = useSettings();
  const root = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState(() => {
    return columnSettings(getUiState("sideColumns"))[side];
  });
  const update = (next: typeof config) => {
    setConfig(next);
    setUiState("sideColumns", {
      ...columnSettings(getUiState("sideColumns")),
      [side]: next,
    });
  };
  const resize = (index: number, delta: number) => {
    const sizes = [...config.sizes];
    const total = sizes[index] + sizes[index + 1];
    sizes[index] = Math.min(total - 0.1, Math.max(0.1, sizes[index] + delta));
    sizes[index + 1] = total - sizes[index];
    update({ ...config, sizes });
  };
  return (
    <div className="side-columns">
      <label className="side-columns-controls">
        {t.workspaceColumns}
        <select
          aria-label={`${side === "left" ? t.menuToggleSidebar : t.agentPanelTitle}: ${t.workspaceColumns}`}
          value={config.count}
          onChange={(e) =>
            update({
              ...config,
              count: Number(e.target.value),
              sizes: [1 / 3, 1 / 3, 1 / 3],
            })
          }
        >
          {[1, 2, 3].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      <div className="side-columns-grid" ref={root}>
        {children.slice(0, config.count).map((child, i) => (
          <div
            className="side-column"
            key={i}
            style={{ flexGrow: config.sizes[i] * 10 }}
          >
            <div className="side-column-label">{labels[i]}</div>
            {child}
            {i < config.count - 1 && (
              <div
                className="side-column-divider"
                role="separator"
                tabIndex={0}
                aria-orientation="vertical"
                aria-label={`${t.splitDivider}: ${labels[i]}`}
                aria-valuenow={Math.round(
                  (config.sizes[i] / (config.sizes[i] + config.sizes[i + 1])) *
                    100,
                )}
                aria-valuemin={10}
                aria-valuemax={90}
                onPointerDown={(e) => {
                  if (e.button === 0) {
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }
                }}
                onPointerMove={(e) => {
                  if (
                    e.currentTarget.hasPointerCapture(e.pointerId) &&
                    root.current
                  ) {
                    const total = config.sizes
                      .slice(0, config.count)
                      .reduce((a, b) => a + b, 0);
                    resize(i, (e.movementX / root.current.clientWidth) * total);
                  }
                }}
                onPointerUp={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId))
                    e.currentTarget.releasePointerCapture(e.pointerId);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    resize(i, e.key === "ArrowLeft" ? -0.03 : 0.03);
                  }
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
