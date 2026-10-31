import { useEffect } from "react";
import { editorViewCtx } from "@milkdown/kit/core";
import type { EditorRunner } from "../../editor/useEditorRunner";
import {
  cachedDocument,
  caretContext,
  readSelection,
  serializeBlocks,
} from "../../ai/doc-markdown";
import {
  emitPluginEvent,
  setActiveDocument,
  registerDocumentAccess,
  setOpenDocument,
  type ActiveDocumentAccess,
  type OpenDocumentAccess,
} from "../../plugins/app-bridge";
import {
  applyPluginEdits,
  documentRevision,
  replaceDocument,
  revealPlace,
} from "./plugin-edits";
import type { useEditorProposals } from "../useEditorProposals";

/**
 * A tab's editor as plugins reach it: while active, its Markdown, selection,
 * edits and proposals; in any tab, its text to read and change in place.
 */
export function usePluginDocumentAccess({
  tabId,
  run,
  isActive,
  filePath,
  addPreviews,
}: {
  tabId: string;
  run: EditorRunner;
  isActive: boolean;
  filePath: string | null;
  addPreviews: ReturnType<typeof useEditorProposals>["addPreviews"];
}): void {
  useEffect(() => {
    if (!filePath) return;
    const text = () =>
      run(
        (ctx) => cachedDocument(ctx, ctx.get(editorViewCtx).state.doc).markdown,
      ) ?? "";
    const access: OpenDocumentAccess = {
      text,
      revision: () => documentRevision(text()),
      replaceText: (next, revision) =>
        documentRevision(text()) === revision &&
        (run((ctx) => replaceDocument(ctx, next)) ?? false),
    };
    setOpenDocument(filePath, access);
    return () => setOpenDocument(filePath, null, access);
  }, [run, filePath]);

  useEffect(() => {
    const access: ActiveDocumentAccess = {
      path: filePath,
      paragraph: () =>
        run((ctx) => {
          const { state } = ctx.get(editorViewCtx);
          return (
            serializeBlocks(ctx, state.doc).find(
              (b) =>
                state.selection.from >= b.from && state.selection.from <= b.to,
            ) ?? null
          );
        }) ?? null,
      text: () =>
        run(
          (ctx) =>
            cachedDocument(ctx, ctx.get(editorViewCtx).state.doc).markdown,
        ) ?? "",
      blocks: () =>
        run(
          (ctx) => cachedDocument(ctx, ctx.get(editorViewCtx).state.doc).blocks,
        ) ?? [],
      selection: () =>
        run((ctx) => {
          const { state } = ctx.get(editorViewCtx);
          const { from, to } = state.selection;
          return {
            text: state.doc.textBetween(from, to, "\n"),
            markdown: readSelection(ctx, state).selectionMarkdown,
          };
        }) ?? { text: "", markdown: null },
      propose: (callId, proposal) => {
        const target = run((ctx) => {
          const { state } = ctx.get(editorViewCtx);
          const selection = readSelection(ctx, state);
          return {
            range: selection.range,
            selectionMarkdown: selection.selectionMarkdown,
            cursor: caretContext(state)?.pos ?? null,
          };
        });
        if (!target) return false;
        addPreviews([{ callId, proposal }], target);
        return true;
      },
      edit: (edits) => run((ctx) => applyPluginEdits(ctx, edits)) ?? false,
      reveal: (place) => run((ctx) => revealPlace(ctx, place)) ?? false,
    };
    const remove = registerDocumentAccess(filePath ?? `tab:${tabId}`, access);
    if (isActive) {
      setActiveDocument(access);
      // The window tells plugins of the new tab before its editor mounts, so
      // a plugin that read the document then found none: tell them again.
      emitPluginEvent("activeDocument", { path: filePath });
    }
    return () => {
      remove();
      if (isActive) setActiveDocument(null, access);
    };
  }, [run, isActive, filePath, addPreviews, tabId]);
}
