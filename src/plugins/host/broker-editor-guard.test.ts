// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import type { PluginScope } from "./broker-scope";
const mock = vi.hoisted(() => ({
  active: vi.fn(),
  edit: vi.fn(),
  propose: vi.fn(),
}));
vi.mock("../app-bridge", () => ({
  getActiveDocument: mock.active,
  emitPluginEvent: vi.fn(),
}));
import { editorHandlers } from "./broker-editor";

beforeEach(() => {
  vi.resetAllMocks();
  mock.active.mockReturnValue({
    path: "/paper.md",
    text: () => "current prose",
    blocks: () => [],
    edit: mock.edit,
    propose: mock.propose,
  });
  mock.edit.mockReturnValue(true);
  mock.propose.mockReturnValue(true);
});
const scope = () =>
  ({
    id: "test.workbench",
    name: () => "Workbench",
    need: vi.fn(),
  }) as unknown as PluginScope;

it("refuses an edit and proposal after the examined text or active paper changes", () => {
  const h = editorHandlers(scope());
  const change = { action: "append", text: "new prose" };
  expect(
    h["editor.edit"]({
      changes: change,
      expectedText: "old prose",
      expectedPath: "/paper.md",
    }),
  ).toBe(false);
  expect(
    h["editor.propose"]({
      change,
      expectedText: "current prose",
      expectedPath: "/other.md",
    }),
  ).toBe(false);
  expect(mock.edit).not.toHaveBeenCalled();
  expect(mock.propose).not.toHaveBeenCalled();
});
it("places a guarded change only when both snapshot guards match in the host", () => {
  const p = scope();
  const h = editorHandlers(p);
  const change = { action: "append", text: "new prose" };
  expect(
    h["editor.edit"]({
      changes: change,
      expectedText: "current prose",
      expectedPath: "/paper.md",
    }),
  ).toBe(true);
  expect(
    h["editor.propose"]({
      change,
      expectedText: "current prose",
      expectedPath: "/paper.md",
    }),
  ).toBe(true);
  expect(p.need).toHaveBeenCalledWith("editor.read");
});
it("keeps unguarded existing plugin edits compatible", () => {
  expect(
    editorHandlers(scope())["editor.edit"]({
      changes: { action: "append", text: "new prose" },
    }),
  ).toBe(true);
});
