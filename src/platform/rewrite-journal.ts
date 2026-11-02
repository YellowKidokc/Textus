import { readBoot } from "../storage/boot";
import { call } from "./ipc-call";

/** Event contract: commands/rewrite_history.rs. IDs make retries idempotent. */
export interface RewriteEvent {
  id: string;
  group: string;
  document: string;
  time: string;
  type:
    "request" | "response" | "decision" | "applied" | "error" | "undo" | "redo";
  request?: string;
  original?: string;
  text?: string;
  action?: string;
  instruction?: string;
  provider?: string;
  model?: string | null;
  choice?: string;
}

const KEY = "textus-rewrite-journal";
function decode(value: unknown): RewriteEvent[] {
  if (!Array.isArray(value)) throw new Error("Invalid rewrite journal");
  if (
    !value.every(
      (e) =>
        e &&
        typeof e === "object" &&
        typeof e.id === "string" &&
        typeof e.group === "string" &&
        typeof e.document === "string" &&
        typeof e.time === "string" &&
        [
          "request",
          "response",
          "decision",
          "applied",
          "error",
          "undo",
          "redo",
        ].includes(e.type),
    )
  )
    throw new Error("Invalid rewrite journal; no records were changed");
  return value as RewriteEvent[];
}

export const rewriteJournal = {
  async list(): Promise<RewriteEvent[]> {
    return decode(
      readBoot()
        ? await call("rewrite_history_list")
        : JSON.parse(localStorage.getItem(KEY) || "[]"),
    );
  },
  async append(event: RewriteEvent): Promise<void> {
    if (readBoot()) await call("rewrite_history_append", { event });
    else {
      const current = decode(JSON.parse(localStorage.getItem(KEY) || "[]"));
      if (!current.some((e) => e.id === event.id))
        localStorage.setItem(KEY, JSON.stringify([...current, event]));
    }
    window.dispatchEvent(new Event("rewrite-journal-changed"));
  },
};
