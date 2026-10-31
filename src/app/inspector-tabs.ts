import type { ComponentType } from "react";
import { getUiState, setUiState } from "../storage/ui-state";

export interface InspectorTab {
  id: string;
  label: () => string;
  Panel: ComponentType;
}
const tabs: InspectorTab[] = [];
const listeners = new Set<() => void>();
let version = 0;
export const INSPECTOR_OPEN = "textus-open-inspector";
export const FOCUS_WRITING = "textus-focus-writing";
const changed = () => {
  version++;
  for (const fn of listeners) fn();
};
export function registerInspector(tab: InspectorTab): () => void {
  if (tabs.some((t) => t.id === tab.id))
    throw new Error("Inspector already registered.");
  tabs.push(tab);
  changed();
  return () => {
    const at = tabs.indexOf(tab);
    if (at >= 0) tabs.splice(at, 1);
    changed();
  };
}
export const inspectorTabs = () => tabs;
export const inspectorVersion = () => version;
export function subscribeInspectors(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function selectedInspector(): string {
  const stored = getUiState("inspectorTab");
  return typeof stored === "string" ? stored : "chat";
}
export function selectInspector(id: string): void {
  setUiState("inspectorTab", id);
  changed();
}
export function showInspector(id: string): void {
  selectInspector(id);
  window.dispatchEvent(new Event(INSPECTOR_OPEN));
}
