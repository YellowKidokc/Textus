import { isIOSApp } from "../platform/capabilities";
import type { PresenceHandle } from "../ui/usePresence";
import {
  AGENT_PANEL_DEFAULT_WIDTH,
  AGENT_PANEL_MAX_WIDTH,
  AGENT_PANEL_MIN_WIDTH,
  AgentPanelSheetGrip,
} from "../ai/chat/panel/agent-panel";
import { ResizeHandle } from "../ui/ResizeHandle";
import type { Strings } from "../i18n/strings";
import { TextusAiOffNote } from "../ai/TextusAiSwitch";
import { useSyncExternalStore } from "react";
import {
  inspectorTabs,
  inspectorVersion,
  subscribeInspectors,
  selectedInspector,
  selectInspector,
} from "./inspector-tabs";

/** The docked Agent panel's frame (a bottom sheet on a phone); the active
 *  tab's editor renders its conversation into the mount point here. */
export function AgentPanelDock({
  presence,
  closing,
  sheetFull,
  onSheetFullChange,
  width,
  onResize,
  onClose,
  mountRef,
  sourceMode,
  onToggleSourceMode,
  aiOn,
  t,
}: {
  presence: PresenceHandle;
  closing: boolean;
  sheetFull: boolean;
  onSheetFullChange: (full: boolean) => void;
  width: number;
  /** `done`: the drag let go, or a key moved it - remember it. */
  onResize: (width: number, done: boolean) => void;
  onClose: () => void;
  mountRef: (el: HTMLElement | null) => void;
  /** The active tab is in source mode or split view. */
  sourceMode: boolean;
  onToggleSourceMode: () => void;
  /** Textus AI is on. A panel opened anyway (a tour lesson) offers to turn
   *  it back on. */
  aiOn: boolean;
  t: Strings;
}) {
  useSyncExternalStore(subscribeInspectors, inspectorVersion);
  const tabs = inspectorTabs();
  const selected = tabs.find((tab) => tab.id === selectedInspector());
  const Panel = selected?.Panel;
  return (
    <aside
      ref={presence.ref}
      aria-label={t.agentPanelTitle}
      data-state={presence.state}
      inert={closing || undefined}
      className={`agent-panel${tabs.length ? " agent-panel-inspectors" : ""}${sheetFull ? " agent-panel-sheet-full" : ""}`}
      style={{ width }}
    >
      {/* Phone widths: the bottom sheet's handle. */}
      {isIOSApp && (
        <AgentPanelSheetGrip
          full={sheetFull}
          onFullChange={onSheetFullChange}
          onClose={onClose}
          label={t.agentPanelSheet}
        />
      )}
      <ResizeHandle
        className="agent-panel-resizer"
        edge="left"
        width={width}
        min={AGENT_PANEL_MIN_WIDTH}
        max={AGENT_PANEL_MAX_WIDTH}
        onResize={onResize}
        onReset={() => onResize(AGENT_PANEL_DEFAULT_WIDTH, true)}
        label={t.agentPanelResize}
      />
      {!!tabs.length && (
        <div className="inspector-switch">
          <button
            onClick={() => selectInspector("chat")}
            aria-pressed={!selected}
          >
            {t.workbenchChat}
          </button>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => selectInspector(tab.id)}
              aria-pressed={selected?.id === tab.id}
            >
              {tab.label()}
            </button>
          ))}
        </div>
      )}
      {!!tabs.length && (
        <button
          className="inspector-close"
          onClick={onClose}
          aria-label={t.workbenchHideNotes}
        >
          ×
        </button>
      )}
      <div className="agent-panel-mount" ref={mountRef} hidden={!!selected} />
      {Panel && <Panel />}
      {/* Source mode, split view and AI off have no conversation, so say so
        instead of an empty column. */}
      {!selected && !aiOn && (
        <TextusAiOffNote className="agent-panel-placeholder" />
      )}
      {!selected && aiOn && sourceMode && (
        <div className="agent-panel-placeholder">
          <p>{t.agentPanelSourceMode}</p>
          <button
            type="button"
            className="text-button"
            onClick={onToggleSourceMode}
          >
            {t.agentPanelBackToEditor}
          </button>
        </div>
      )}
    </aside>
  );
}
