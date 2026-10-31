import { fs } from "../platform/ipc";
import { makeBlankTab, type DocTab } from "../document/doc-tabs";
import { pairLayout, setSplitLayout } from "../app/split/split-layout";
import type { ComparisonOpen } from "./app-bridge";
import { linkScroll } from "../app/split/linked-scroll";

let pair: {
  id: string;
  original: string;
  revision: string;
  stop?: () => void;
} | null = null;
export function setComparisonScrolling(id: string, on: boolean): boolean {
  if (!pair || pair.id !== id) return false;
  pair.stop?.();
  pair.stop = undefined;
  if (!on) return true;
  const first = document.querySelector<HTMLElement>(
    `[data-tab-id="${CSS.escape(pair.original)}"] .editor-scroll`,
  );
  const second = document.querySelector<HTMLElement>(
    `[data-tab-id="${CSS.escape(pair.revision)}"] .editor-scroll`,
  );
  if (!first || !second) return false;
  pair.stop = linkScroll(first, second);
  return true;
}

/** Original content lives in an immutable virtual tab; the revision is a separate file. */
export async function openComparisonWindow(
  request: ComparisonOpen,
  update: (fn: (tabs: DocTab[]) => DocTab[]) => void,
  activate: (id: string) => void,
): Promise<{ original: string; revision: string }> {
  const originalId = `frozen:${request.id}`;
  const revisionId = crypto.randomUUID();
  const content = await fs.readTextFile(request.revisionPath);
  const mtime = await fs.fileMtimeMs(request.revisionPath);
  let actualRevision: string = revisionId;
  update((tabs) => {
    const existing = tabs.find((t) => t.path === request.revisionPath);
    actualRevision = existing?.id ?? revisionId;
    const original: DocTab = {
      ...makeBlankTab(),
      id: originalId,
      content: request.originalText,
      savedContent: request.originalText,
      draftTitle: request.originalTitle,
      readOnly: true,
      frozenOriginal: {
        version: request.originalVersion,
        comparison: request.id,
      },
    };
    const base: DocTab = existing ?? {
      ...makeBlankTab(),
      id: revisionId,
      path: request.revisionPath,
      content,
      savedContent: content,
      diskMtime: mtime,
    };
    const revision = {
      ...base,
      workingRevision: { name: request.revisionTitle, comparison: request.id },
    };
    return [
      ...tabs.filter((t) => t.id !== originalId && t.id !== actualRevision),
      original,
      revision,
    ];
  });
  // React commits the file's editor before the existing pane manager resolves it.
  requestAnimationFrame(() => {
    pair?.stop?.();
    pair = { id: request.id, original: originalId, revision: actualRevision };
    setSplitLayout(
      pairLayout("row", originalId, actualRevision, 1, request.ratio),
    );
    activate(actualRevision);
  });
  return { original: `tab:${originalId}`, revision: request.revisionPath };
}
