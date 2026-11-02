import { expect, test, type Page } from "@playwright/test";
import { mockInvoke, openApp, pasteMarkdown } from "./helpers";

async function selectText(page: Page, text: string, endText = text) {
  await page.locator('[data-active-tab="true"] .ProseMirror').evaluate(
    (root, { text, endText }) => {
      (root as HTMLElement).focus();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const at = node.textContent?.indexOf(text) ?? -1;
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at);
        if (endText === text) range.setEnd(node, at + text.length);
        else {
          let found = false;
          while (walker.nextNode()) {
            const end = walker.currentNode;
            const endAt = end.textContent?.indexOf(endText) ?? -1;
            if (endAt >= 0) {
              range.setEnd(end, endAt + endText.length);
              found = true;
              break;
            }
          }
          if (!found) throw new Error("Missing selection end");
        }
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new Event("selectionchange"));
        return;
      }
      throw new Error(`Missing selection: ${text}`);
    },
    { text, endText },
  );
  await expect(page.locator(".favorite-selection-actions")).toBeVisible();
}

async function rewrite(page: Page, text: string) {
  await mockInvoke(page, { ai_rewrite_selection: text });
  const actions = page.locator(".favorite-selection-actions");
  await actions.locator("summary").click();
  await actions
    .getByRole("button", { name: "Make more academic", exact: true })
    .click();
  await expect(page.locator(".favorite-rewrite-text").last()).toHaveText(text);
}

test("rewrites only the highlighted sentence, compares in place and prints the complete record", async ({
  page,
}) => {
  await openApp(page, {
    settings: {
      language: "en",
      enableCompletion: false,
      enableGrammarCheck: false,
    },
  });
  await pasteMarkdown(
    page,
    "Before paragraph.\n\nA simple sentence. The rest stays.\n\nAfter paragraph.",
  );
  await selectText(page, "A simple sentence.");
  await rewrite(page, "A precise academic statement.");
  const controls = page.locator(".favorite-version-controls");
  await controls.getByRole("button", { name: "Previous version" }).click();
  await expect(page.locator(".favorite-rewrite-text")).toHaveCount(0);
  await expect(page.locator(".favorite-original-outline")).toHaveText(
    "A simple sentence.",
  );
  await controls.getByRole("button", { name: "Next version" }).click();
  await controls.getByRole("button", { name: "Keep this version" }).click();
  await expect(controls).toHaveCount(0);
  const editor = page.locator('[data-active-tab="true"] .ProseMirror');
  await expect(editor).toContainText(
    "A precise academic statement. The rest stays.",
  );
  await expect(editor).toContainText("Before paragraph.");
  await expect(editor).toContainText("After paragraph.");
  await editor.click();
  await page.keyboard.press("Control+z");
  await expect(editor).toContainText("A simple sentence. The rest stays.");
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("textus-rewrite-journal") || "[]").some(
          (e: { type: string }) => e.type === "undo",
        ),
      ),
    )
    .toBe(true);
  await page.keyboard.press("Control+Shift+z");
  await expect(editor).toContainText(
    "A precise academic statement. The rest stays.",
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("textus-rewrite-journal") || "[]").some(
          (e: { type: string }) => e.type === "redo",
        ),
      ),
    )
    .toBe(true);

  await page
    .getByRole("button", { name: "Rewrite history", exact: true })
    .click();
  const history = page.getByRole("dialog", { name: "Rewrite history" });
  await expect(history).toContainText("A simple sentence.");
  await expect(history).toContainText("A precise academic statement.");
  await expect(history).toContainText("Kept version");
  const download = page.waitForEvent("download");
  await history.getByRole("button", { name: "HTML", exact: true }).click();
  expect((await download).suggestedFilename()).toBe(
    "textus-rewrite-history.html",
  );
  await page.emulateMedia({ media: "print" });
  await expect(history).toBeVisible();
  await expect(page.locator(".app-shell")).toBeHidden();
});

test("keeps all 25 versions of one sentence after choosing an earlier version and reloading", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, {
    settings: {
      language: "en",
      enableCompletion: false,
      enableGrammarCheck: false,
    },
  });
  await pasteMarkdown(page, "Original sentence.");
  await selectText(page, "Original sentence.");
  for (let i = 1; i <= 25; i++) await rewrite(page, `Rewritten version ${i}.`);
  const controls = page.locator(".favorite-version-controls");
  await controls.getByRole("button", { name: "Previous version" }).click();
  await controls.getByRole("button", { name: "Keep this version" }).click();
  await expect(controls).toHaveCount(0);
  await page.reload();
  await page.waitForSelector(".ProseMirror");
  await page
    .getByRole("button", { name: "Rewrite history", exact: true })
    .click();
  const history = page.getByRole("dialog", { name: "Rewrite history" });
  await expect(history.locator("article")).toHaveCount(25);
  await expect(history.locator(".favorite-history-chosen")).toContainText(
    "Rewritten version 24.",
  );
  await expect(history).toContainText("Rewritten version 25.");
});

test("keeps two pending rewrites independent and preserves discarded output in history", async ({
  page,
}) => {
  await openApp(page, {
    settings: {
      language: "en",
      enableCompletion: false,
      enableGrammarCheck: false,
    },
  });
  await pasteMarkdown(page, "First sentence.\n\nSecond sentence.");
  await selectText(page, "First sentence.");
  await rewrite(page, "First revision.");
  await selectText(page, "Second sentence.");
  await rewrite(page, "Second revision.");
  await expect(page.locator(".favorite-version-controls")).toHaveCount(2);
  await page
    .locator(".favorite-version-controls")
    .first()
    .getByRole("button", { name: "Reject", exact: true })
    .click();
  await expect(page.locator(".favorite-version-controls")).toHaveCount(1);
  await page
    .locator(".favorite-version-controls")
    .getByRole("button", { name: "Keep this version" })
    .click();
  await page
    .getByRole("button", { name: "Rewrite history", exact: true })
    .click();
  const history = page.getByRole("dialog", { name: "Rewrite history" });
  await expect(history.locator("article")).toHaveCount(2);
  await expect(history).toContainText("First revision.");
  await expect(history).toContainText("Discarded; original kept");
});

test("compares and accepts a selection spanning complete paragraphs", async ({
  page,
}) => {
  await openApp(page, {
    settings: {
      language: "en",
      enableCompletion: false,
      enableGrammarCheck: false,
    },
  });
  await pasteMarkdown(
    page,
    "Before.\n\nFirst passage.\n\nSecond passage.\n\nAfter.",
  );
  await selectText(page, "First passage.", "Second passage.");
  await rewrite(page, "Combined rewritten passage.");
  const controls = page.locator(".favorite-version-controls");
  await expect(controls).toBeVisible();
  await controls.getByRole("button", { name: "Keep this version" }).click();
  const editor = page.locator('[data-active-tab="true"] .ProseMirror');
  await expect(editor.locator("p")).toHaveText([
    "Before.",
    "Combined rewritten passage.",
    "After.",
  ]);
});

test("keeps ten pending passages independently reviewable", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page, {
    settings: {
      language: "en",
      enableCompletion: false,
      enableGrammarCheck: false,
    },
  });
  await pasteMarkdown(
    page,
    Array.from({ length: 10 }, (_, i) => `Passage number ${i}.`).join("\n\n"),
  );
  for (let i = 0; i < 10; i++) {
    await selectText(page, `Passage number ${i}.`);
    await rewrite(page, `Revision number ${i}.`);
  }
  await expect(page.locator(".favorite-version-controls")).toHaveCount(10);
  await page
    .locator(".favorite-version-controls")
    .first()
    .getByRole("button", { name: "Keep this version" })
    .click();
  await expect(page.locator(".favorite-version-controls")).toHaveCount(9);
  await expect(page.locator(".favorite-rewrite-text")).toHaveCount(9);
});

test("retains a rewrite for retry when saving its history fails", async ({
  page,
}) => {
  await openApp(page, {
    settings: {
      language: "en",
      enableCompletion: false,
      enableGrammarCheck: false,
    },
  });
  await pasteMarkdown(page, "Original sentence.");
  await selectText(page, "Original sentence.");
  await mockInvoke(page, { ai_rewrite_selection: "Recovered rewrite." });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (
        key === "textus-rewrite-journal" &&
        JSON.parse(value).at(-1)?.type === "response"
      )
        throw new Error("Simulated save failure");
      original.call(this, key, value);
    };
    (
      window as unknown as { restoreJournalWrites: () => void }
    ).restoreJournalWrites = () => {
      Storage.prototype.setItem = original;
    };
  });
  await page.locator(".favorite-selection-actions summary").click();
  await page
    .getByRole("button", { name: "Make more academic", exact: true })
    .click();
  await expect(page.locator(".favorite-error")).toBeVisible();
  await expect(page.locator(".favorite-rewrite-text")).toHaveCount(0);
  await page.evaluate(() =>
    (
      window as unknown as { restoreJournalWrites: () => void }
    ).restoreJournalWrites(),
  );
  await page
    .locator(".favorite-error")
    .getByRole("button", { name: "Retry", exact: true })
    .click();
  await expect(page.locator(".favorite-rewrite-text")).toHaveText(
    "Recovered rewrite.",
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("textus-rewrite-journal") || "[]").some(
          (e: { type: string; text?: string }) =>
            e.type === "response" && e.text === "Recovered rewrite.",
        ),
      ),
    )
    .toBe(true);
});
