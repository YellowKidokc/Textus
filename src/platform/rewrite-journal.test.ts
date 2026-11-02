// @vitest-environment jsdom
import { beforeAll, beforeEach, expect, it } from "vitest";
import { installTestLocalStorage } from "../dev/test-local-storage";
import { rewriteJournal, type RewriteEvent } from "./rewrite-journal";
beforeAll(installTestLocalStorage);
beforeEach(() => localStorage.clear());
it("retains every version, is idempotent and preserves rejected versions", async () => {
  const event = (i: number): RewriteEvent => ({
    id: `e${i}`,
    group: "g",
    document: "draft",
    time: new Date().toISOString(),
    type: "response",
    request: `r${i}`,
    text: `Version ${i}`,
  });
  for (let i = 0; i < 30; i++) await rewriteJournal.append(event(i));
  await rewriteJournal.append(event(0));
  await rewriteJournal.append({
    ...event(31),
    type: "applied",
    choice: "discarded",
    text: "Original",
  });
  expect(await rewriteJournal.list()).toHaveLength(31);
  expect((await rewriteJournal.list())[24].text).toBe("Version 24");
});
it("surfaces corrupt history instead of overwriting it", async () => {
  localStorage.setItem("textus-rewrite-journal", "broken");
  await expect(rewriteJournal.list()).rejects.toThrow();
  await expect(
    rewriteJournal.append({
      id: "new",
      group: "g",
      document: "d",
      time: "now",
      type: "error",
    }),
  ).rejects.toThrow();
  expect(localStorage.getItem("textus-rewrite-journal")).toBe("broken");
});
