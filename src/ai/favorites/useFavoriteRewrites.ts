import { rewriteAuditKey } from "./rewrite-audit-plugin";
import { useCallback, useEffect, useRef, useState } from "react";
import { editorViewCtx } from "@milkdown/kit/core";
import { closeHistory } from "@milkdown/kit/prose/history";
import { ai } from "../../platform/ipc";
import {
  rewriteJournal,
  type RewriteEvent,
} from "../../platform/rewrite-journal";
import type { EditorRunner } from "../../editor/useEditorRunner";
import { markChangeSource } from "../../editor/change-source";
import { readSelection } from "../doc-markdown";
import { applyEditRange } from "../revision/apply-edit";
import { rewriteKey, rewriteMeta, type RewritePreview } from "./rewrite-plugin";
import type { FavoriteAction } from "./favorite-actions";
import type { Settings } from "../../prefs/SettingsContext";
import type { Strings } from "../../i18n/strings";
import { announce } from "../../ui/announce";

function event(
  document: string,
  group: string,
  type: RewriteEvent["type"],
  data: Partial<RewriteEvent>,
): RewriteEvent {
  return {
    ...data,
    id: crypto.randomUUID(),
    document,
    group,
    type,
    time: new Date().toISOString(),
  };
}

export function useFavoriteRewrites(
  run: EditorRunner,
  document: string,
  settings: Settings,
  t: Strings,
) {
  const [snapshot, setSnapshot] = useState<{
    selected: boolean;
    entries: RewritePreview[];
    x: number;
    y: number;
  }>({ selected: false, entries: [], x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState<RewriteEvent[]>([]);
  const retrying = useRef(false);
  const save = useCallback(async (record: RewriteEvent) => {
    try {
      await rewriteJournal.append(record);
    } catch (error) {
      setUnsaved((current) =>
        current.some((e) => e.id === record.id)
          ? current
          : [...current, record],
      );
      throw error;
    }
  }, []);
  const retrySave = async () => {
    if (retrying.current) return;
    retrying.current = true;
    try {
      for (const record of unsaved) {
        await rewriteJournal.append(record);
        if (record.type === "response" && record.request && record.text)
          run((ctx) =>
            rewriteMeta(ctx.get(editorViewCtx), {
              type: "result",
              id: record.group,
              request: record.request!,
              text: record.text!,
            }),
          );
        setUnsaved((current) => current.filter((e) => e.id !== record.id));
      }
      setError(null);
    } catch (error) {
      setError(`${t.favoriteSaveFailed} ${String(error)}`);
    } finally {
      retrying.current = false;
    }
  };

  useEffect(
    () =>
      run((ctx) => {
        const view = ctx.get(editorViewCtx);
        const deciding = new Set<string>();
        const update = () => {
          const selection = readSelection(ctx, view.state);
          const range = selection.range;
          const at = view.coordsAtPos(range?.to ?? view.state.selection.to);
          setSnapshot({
            selected:
              !!range && !!selection.selectedText?.trim() && view.editable,
            entries: rewriteKey.getState(view.state) ?? [],
            x: Math.max(8, Math.min(window.innerWidth - 300, at.left)),
            y: Math.max(8, Math.min(window.innerHeight - 220, at.bottom + 8)),
          });
        };
        const decide = async (id: string, action: string, index?: number) => {
          const entry = rewriteKey
            .getState(view.state)
            ?.find((e) => e.id === id);
          if (!entry) return;
          if (action === "version") {
            rewriteMeta(view, { type: "version", id, index: index ?? 0 });
            return;
          }
          if (entry.loading || !view.editable || deciding.has(id)) return;
          deciding.add(id);
          const chosen =
            entry.index > 0 ? entry.versions[entry.index - 1] : null;
          try {
            await save(
              event(document, id, "decision", {
                choice:
                  action === "discard"
                    ? "discarded"
                    : (chosen?.request ?? "original"),
                text:
                  action === "discard"
                    ? entry.source
                    : (chosen?.text ?? entry.source),
              }),
            );
            const current = rewriteKey
              .getState(view.state)
              ?.find((e) => e.id === id);
            if (
              !current ||
              !view.editable ||
              !view.state.doc.slice(current.from, current.to).eq(entry.original)
            )
              throw new Error(t.favoriteChanged);
            if (action === "keep" && chosen) {
              const tr = closeHistory(
                applyEditRange(
                  view.state,
                  ctx,
                  current.from,
                  current.to,
                  chosen.text,
                ),
              );
              tr.setMeta(rewriteAuditKey, {
                id,
                original: entry.source,
                text: chosen.text,
                choice: chosen.request,
              });
              view.dispatch(
                markChangeSource(
                  tr.setMeta(rewriteKey, { type: "drop", id }),
                  "ai",
                ),
              );
            } else rewriteMeta(view, { type: "drop", id });
            await save(
              event(document, id, "applied", {
                choice:
                  action === "discard"
                    ? "discarded"
                    : (chosen?.request ?? "original"),
                text:
                  action === "discard"
                    ? entry.source
                    : (chosen?.text ?? entry.source),
              }),
            );
            announce(t.favoriteRecorded);
          } catch (e) {
            setError(`${t.favoriteSaveFailed} ${String(e)}`);
          } finally {
            deciding.delete(id);
          }
        };
        const action = (e: Event) => {
          const detail = (
            e as CustomEvent<{ id: string; action: string; index?: number }>
          ).detail;
          void decide(detail.id, detail.action, detail.index);
        };
        const onHistory = (e: Event) => {
          const detail = (
            e as CustomEvent<{
              id: string;
              type: "undo" | "redo";
              choice: string;
              text: string;
            }>
          ).detail;
          void save(
            event(document, detail.id, detail.type, {
              choice: detail.choice,
              text: detail.text,
            }),
          ).catch((error: unknown) =>
            setError(`${t.favoriteSaveFailed} ${String(error)}`),
          );
        };
        view.dom.addEventListener("favorite-rewrite-history", onHistory);
        view.dom.addEventListener("favorite-rewrite-update", update);
        view.dom.addEventListener("favorite-rewrite-action", action);
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        update();
        return () => {
          view.dom.removeEventListener("favorite-rewrite-history", onHistory);
          view.dom.removeEventListener("favorite-rewrite-update", update);
          view.dom.removeEventListener("favorite-rewrite-action", action);
          window.removeEventListener("resize", update);
          window.removeEventListener("scroll", update, true);
        };
      }),
    [run, document, t, save],
  );

  const apply = async (favorite: FavoriteAction) => {
    if (!settings.textusAi || !favorite.instruction.trim()) return;
    const captured = run((ctx) => {
      const view = ctx.get(editorViewCtx);
      const selection = readSelection(ctx, view.state);
      if (
        !view.editable ||
        !selection.range ||
        !selection.selectionMarkdown?.trim()
      )
        return null;
      const { from, to } = selection.range;
      const entries = rewriteKey.getState(view.state) ?? [];
      const existing = entries.find((e) => e.from === from && e.to === to);
      if (
        existing?.loading ||
        entries.some((e) => e.id !== existing?.id && from < e.to && e.from < to)
      )
        return null;
      const entry: RewritePreview = existing ?? {
        id: crypto.randomUUID(),
        from,
        to,
        original: view.state.doc.slice(from, to),
        source: selection.selectionMarkdown,
        versions: [],
        index: 0,
        loading: false,
      };
      // Reserve synchronously: repeated clicks cannot start duplicate calls.
      if (existing)
        rewriteMeta(view, { type: "busy", id: entry.id, loading: true });
      else
        rewriteMeta(view, { type: "add", entry: { ...entry, loading: true } });
      return {
        entry,
        input:
          entry.index > 0 ? entry.versions[entry.index - 1].text : entry.source,
      };
    });
    if (!captured) {
      setError(t.favoriteChanged);
      return;
    }
    const { entry, input } = captured;
    const request = crypto.randomUUID();
    const provider = settings.aiProvider;
    const model = settings.agentModels[provider] || null;
    setError(null);
    try {
      await save(
        event(document, entry.id, "request", {
          request,
          original: input,
          action: favorite.name,
          instruction: favorite.instruction,
          provider,
          model,
        }),
      );
      const text = await ai.rewriteSelection(
        provider,
        model,
        input,
        favorite.instruction,
      );
      if (typeof text !== "string" || !text.trim())
        throw new Error(t.favoriteEmptyReply);
      await save(event(document, entry.id, "response", { request, text }));
      run((ctx) =>
        rewriteMeta(ctx.get(editorViewCtx), {
          type: "result",
          id: entry.id,
          request,
          text,
        }),
      );
      announce(t.favoriteRecorded);
    } catch (e) {
      setError(`${t.favoriteSaveFailed} ${String(e)}`);
      run((ctx) =>
        rewriteMeta(ctx.get(editorViewCtx), {
          type: "busy",
          id: entry.id,
          loading: false,
        }),
      );
      try {
        await save(
          event(document, entry.id, "error", { request, text: String(e) }),
        );
      } catch {
        /* The visible error remains until the writer dismisses it. */
      }
    }
  };
  return {
    ...snapshot,
    apply,
    error,
    clearError: () => setError(null),
    hasUnsaved: unsaved.length > 0,
    retrySave,
  };
}
