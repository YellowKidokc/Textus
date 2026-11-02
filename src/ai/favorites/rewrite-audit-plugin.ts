import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { isHistoryTransaction } from "@milkdown/kit/prose/history";
import type { Node } from "@milkdown/kit/prose/model";
import { $prose } from "@milkdown/kit/utils";

interface Accepted {
  id: string;
  original: string;
  text: string;
  choice: string;
  before: Node;
  after: Node;
  undone: boolean;
}
/** The accepted rewrite's snapshots let undo/redo update the permanent record. */
export const rewriteAuditKey = new PluginKey<Accepted[]>(
  "favorite-rewrite-audit",
);
export const rewriteAuditPlugin = $prose(
  () =>
    new Plugin<Accepted[]>({
      key: rewriteAuditKey,
      state: {
        init: () => [],
        apply(tr, previous) {
          let next = previous;
          const accepted = tr.getMeta(rewriteAuditKey) as
            Pick<Accepted, "id" | "original" | "text" | "choice"> | undefined;
          if (accepted)
            next = [
              ...next,
              { ...accepted, before: tr.before, after: tr.doc, undone: false },
            ];
          if (isHistoryTransaction(tr))
            next = next.map((entry) =>
              tr.doc.eq(entry.before)
                ? { ...entry, undone: true }
                : tr.doc.eq(entry.after)
                  ? { ...entry, undone: false }
                  : entry,
            );
          return next;
        },
      },
      view: () => ({
        update(view, previous) {
          const before = rewriteAuditKey.getState(previous) ?? [];
          for (const entry of rewriteAuditKey.getState(view.state) ?? []) {
            const old = before.find((e) => e.id === entry.id);
            if (old && old.undone !== entry.undone)
              queueMicrotask(() =>
                view.dom.dispatchEvent(
                  new CustomEvent("favorite-rewrite-history", {
                    bubbles: true,
                    detail: {
                      id: entry.id,
                      type: entry.undone ? "undo" : "redo",
                      choice: entry.undone ? "original" : entry.choice,
                      text: entry.undone ? entry.original : entry.text,
                    },
                  }),
                ),
              );
          }
        },
      }),
    }),
);
