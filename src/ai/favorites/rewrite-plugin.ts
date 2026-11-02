import { Plugin, PluginKey, type Transaction } from "@milkdown/kit/prose/state";
import {
  Decoration,
  DecorationSet,
  type EditorView,
} from "@milkdown/kit/prose/view";
import type { Slice } from "@milkdown/kit/prose/model";
import { $prose } from "@milkdown/kit/utils";
import type { Strings } from "../../i18n/strings";
import { renderPendingHtml, hasBlocks } from "../revision/pending-animation";

export interface RewritePreview {
  id: string;
  from: number;
  to: number;
  original: Slice;
  source: string;
  versions: { request: string; text: string }[];
  index: number;
  loading: boolean;
}
type Meta =
  | { type: "add"; entry: RewritePreview }
  | { type: "drop"; id: string }
  | { type: "version"; id: string; index: number }
  | { type: "busy"; id: string; loading: boolean }
  | { type: "result"; id: string; request: string; text: string };
export const rewriteKey = new PluginKey<RewritePreview[]>("favorite-rewrites");

/** Only edits outside a passage may move it. Changed passages are never overwritten. */
export function mapRewrites(
  tr: Transaction,
  entries: RewritePreview[],
): RewritePreview[] {
  if (!tr.docChanged) return entries;
  return entries.flatMap((entry) => {
    const from = tr.mapping.map(entry.from, 1);
    const to = tr.mapping.map(entry.to, -1);
    return from < to &&
      to <= tr.doc.content.size &&
      tr.doc.slice(from, to).eq(entry.original)
      ? [{ ...entry, from, to }]
      : [];
  });
}

export function rewriteMeta(view: EditorView, meta: Meta) {
  view.dispatch(view.state.tr.setMeta(rewriteKey, meta));
}

function toolbar(
  entry: RewritePreview,
  view: EditorView,
  t: Strings,
): HTMLElement {
  const bar = document.createElement("span");
  bar.className = "favorite-version-controls";
  bar.contentEditable = "false";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", t.favoriteVersions);
  const send = (action: string, index?: number) =>
    view.dom.dispatchEvent(
      new CustomEvent("favorite-rewrite-action", {
        bubbles: true,
        detail: { id: entry.id, action, index },
      }),
    );
  const button = (
    text: string,
    label: string,
    disabled: boolean,
    action: string,
    index?: number,
  ) => {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = text;
    el.setAttribute("aria-label", label);
    el.disabled = disabled;
    el.addEventListener("mousedown", (e) => e.preventDefault());
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      send(action, index);
    });
    bar.append(el);
  };
  button(
    "←",
    t.favoritePreviousVersion,
    entry.index === 0,
    "version",
    entry.index - 1,
  );
  const label = document.createElement("span");
  label.textContent = entry.loading
    ? t.agentThinking
    : entry.index === 0
      ? t.favoriteOriginal
      : `${t.favoriteVersions} ${entry.index}/${entry.versions.length}`;
  bar.append(label);
  button(
    "→",
    t.favoriteNextVersion,
    entry.index === entry.versions.length,
    "version",
    entry.index + 1,
  );
  button(t.favoriteKeep, t.favoriteKeep, entry.loading, "keep");
  button(t.proposalReject, t.proposalReject, entry.loading, "discard");
  return bar;
}

export function createFavoriteRewritePlugin(labels: () => Strings) {
  return $prose(
    () =>
      new Plugin<RewritePreview[]>({
        key: rewriteKey,
        state: {
          init: () => [],
          apply(tr, previous) {
            let entries = mapRewrites(tr, previous);
            const meta = tr.getMeta(rewriteKey) as Meta | undefined;
            if (!meta) return entries;
            if (meta.type === "add") return [...entries, meta.entry];
            if (meta.type === "drop")
              return entries.filter((e) => e.id !== meta.id);
            entries = entries.map((e) => {
              if (e.id !== meta.id) return e;
              if (meta.type === "version")
                return {
                  ...e,
                  index: Math.max(0, Math.min(e.versions.length, meta.index)),
                };
              if (meta.type === "busy") return { ...e, loading: meta.loading };
              if (meta.type === "result")
                return {
                  ...e,
                  loading: false,
                  versions: [
                    ...e.versions,
                    { request: meta.request, text: meta.text },
                  ],
                  index: e.versions.length + 1,
                };
              return e;
            });
            return entries;
          },
        },
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            for (const entry of rewriteKey.getState(state) ?? []) {
              const rewritten = entry.index > 0;
              decorations.push(
                Decoration.inline(entry.from, entry.to, {
                  class: rewritten
                    ? "favorite-original-hidden"
                    : "favorite-original-outline",
                }),
              );
              let first = true;
              state.doc.nodesBetween(entry.from, entry.to, (node, pos) => {
                if (!node.isTextblock) return true;
                const hide =
                  rewritten &&
                  !first &&
                  pos >= entry.from &&
                  pos + node.nodeSize - 1 <= entry.to;
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: hide ? "favorite-block-hidden" : "favorite-passage",
                  }),
                );
                first = false;
                return false;
              });
              if (rewritten)
                decorations.push(
                  Decoration.widget(
                    entry.from,
                    () => {
                      const text = entry.versions[entry.index - 1].text;
                      const el = document.createElement(
                        hasBlocks(text) ? "div" : "span",
                      );
                      el.contentEditable = "false";
                      el.className = "favorite-rewrite-text";
                      if (hasBlocks(text)) el.dataset.blocks = "true";
                      renderPendingHtml(el, text);
                      return el;
                    },
                    {
                      side: -1,
                      key: `favorite-text-${entry.id}-${entry.index}`,
                    },
                  ),
                );
              decorations.push(
                Decoration.widget(
                  rewritten ? entry.from : entry.to,
                  (view) => toolbar(entry, view, labels()),
                  {
                    side: 1,
                    key: `favorite-controls-${entry.id}-${entry.index}-${entry.loading}-${entry.versions.length}`,
                  },
                ),
              );
            }
            return DecorationSet.create(state.doc, decorations);
          },
        },
        view(view) {
          let queued = false;
          const notify = () => {
            if (queued) return;
            queued = true;
            queueMicrotask(() => {
              queued = false;
              if (view.dom.isConnected)
                view.dom.dispatchEvent(
                  new Event("favorite-rewrite-update", { bubbles: true }),
                );
            });
          };
          notify();
          return { update: notify };
        },
      }),
  );
}
