// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { openView, closeViews } from "../../document-view/editor-view-kit";
import { rewriteKey, rewriteMeta, type RewritePreview } from "./rewrite-plugin";
import { applyEditRange } from "../revision/apply-edit";
import { closeHistory } from "@milkdown/kit/prose/history";
import { rewriteAuditKey } from "./rewrite-audit-plugin";

afterEach(closeViews);

it("compares versions without changing the document and only accepts the selected range", async () => {
  const doc = await openView(
    "Before.\n\nOne sentence. Another stays.\n\nAfter.",
  );
  const from = doc.caretAt("One sentence.", 0, "One sentence.".length);
  const to = from + "One sentence.".length;
  const entry: RewritePreview = {
    id: "one",
    from,
    to,
    original: doc.view.state.doc.slice(from, to),
    source: "One sentence.",
    versions: [],
    index: 0,
    loading: true,
  };
  rewriteMeta(doc.view, { type: "add", entry });
  rewriteMeta(doc.view, {
    type: "result",
    id: "one",
    request: "r1",
    text: "An academic sentence.",
  });
  rewriteMeta(doc.view, {
    type: "result",
    id: "one",
    request: "r2",
    text: "A sentence.",
  });
  rewriteMeta(doc.view, { type: "version", id: "one", index: 1 });
  expect(doc.markdown()).toBe(
    "Before.\n\nOne sentence. Another stays.\n\nAfter.",
  );
  expect(
    doc.view.dom.querySelector(".favorite-rewrite-text")?.textContent,
  ).toBe("An academic sentence.");
  doc.editor.action((ctx) => {
    const tr = closeHistory(
      applyEditRange(doc.view.state, ctx, from, to, "An academic sentence."),
    );
    tr.setMeta(rewriteAuditKey, {
      id: "one",
      original: "One sentence.",
      text: "An academic sentence.",
      choice: "r1",
    });
    doc.view.dispatch(tr.setMeta(rewriteKey, { type: "drop", id: "one" }));
  });
  expect(doc.markdown()).toBe(
    "Before.\n\nAn academic sentence. Another stays.\n\nAfter.",
  );
  doc.press("Mod+z");
  expect(doc.markdown()).toContain("One sentence. Another stays.");
  expect(rewriteAuditKey.getState(doc.view.state)?.[0].undone).toBe(true);
});

it("maps independent previews through outside edits but drops a changed target", async () => {
  const doc = await openView("First.\n\nSecond.");
  const from = doc.caretAt("Second.", 0, 7);
  const entry: RewritePreview = {
    id: "second",
    from,
    to: from + 7,
    original: doc.view.state.doc.slice(from, from + 7),
    source: "Second.",
    versions: [],
    index: 0,
    loading: true,
  };
  rewriteMeta(doc.view, { type: "add", entry });
  doc.view.dispatch(doc.view.state.tr.insertText("New ", 1));
  expect(rewriteKey.getState(doc.view.state)?.[0].from).toBe(from + 4);
  doc.view.dispatch(doc.view.state.tr.insertText("Changed ", from + 5));
  expect(rewriteKey.getState(doc.view.state)).toEqual([]);
  rewriteMeta(doc.view, {
    type: "result",
    id: "second",
    request: "late",
    text: "Late reply.",
  });
  expect(rewriteKey.getState(doc.view.state)).toEqual([]);
});
