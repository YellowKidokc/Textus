// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ai } from "../platform/ipc";
import { useParagraphScoring } from "./useParagraphScoring";
import type { ParagraphScore } from "./paragraph-scores";

vi.mock("../platform/ipc", () => ({ ai: { scoreParagraph: vi.fn() } }));

it("discards a delayed reply after changing paragraphs and prevents duplicate requests", async () => {
  let resolve!: (scores: ParagraphScore[]) => void;
  vi.mocked(ai.scoreParagraph).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const criteria = [{ name: "Clarity", instruction: "Clear prose" }];
  const { result, rerender } = renderHook(
    ({ paragraph }) => useParagraphScoring("openai", null, paragraph, criteria),
    { initialProps: { paragraph: "First" } },
  );
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.run();
    void result.current.run();
  });
  expect(ai.scoreParagraph).toHaveBeenCalledTimes(1);
  rerender({ paragraph: "Second" });
  await act(async () => {
    resolve([{ name: "Clarity", score: 80, reason: "Clear" }]);
    await pending;
  });
  expect(result.current.result).toBeNull();
  expect(result.current.busy).toBe(false);
});
