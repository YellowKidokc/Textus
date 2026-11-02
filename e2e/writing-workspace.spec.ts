import { expect, test } from "@playwright/test";
import { openApp, pasteMarkdown, mockInvoke } from "./helpers";

test("outline mode locks the body, moves a whole section and supports editor undo", async ({
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
    "# First\n\nFirst paragraph.\n\n## Child\n\nNested paragraph.\n\n# Second\n\nSecond paragraph.",
  );
  await page
    .getByRole("button", { name: "Writing tools", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Writing tools" });
  await expect(page.locator(".app-shell")).toHaveAttribute("inert", "");
  await dialog.getByRole("button", { name: "Move section up" }).last().click();
  await expect(dialog.locator(".writing-outline li").first()).toContainText(
    "Second",
  );
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const editor = page.locator('[data-active-tab="true"] .ProseMirror');
  await expect(editor.locator("h1").first()).toHaveText("Second");
  await expect(editor).toContainText("Nested paragraph.");
  await editor.click();
  await page.keyboard.press("Control+z");
  await expect(editor.locator("h1").first()).toHaveText("First");
});

test("both side panels offer three columns and keyboard resizing survives reload", async ({
  page,
}) => {
  await openApp(page, {
    settings: { language: "en" },
    storage: { "textus-sidebar-open": "1", "textus-agent-panel-open": "1" },
  });
  const left = page.locator(".sidebar .side-columns");
  const right = page.locator(".agent-panel .side-columns");
  await expect(left.locator(".side-column")).toHaveCount(2);
  await expect(right.locator(".side-column")).toHaveCount(2);
  for (const panel of [left, right]) {
    const filled = await panel
      .locator(".side-columns-grid")
      .evaluate((grid) => {
        const widths = Array.from(grid.children).reduce(
          (sum, el) => sum + el.getBoundingClientRect().width,
          0,
        );
        return Math.abs(widths - grid.getBoundingClientRect().width) < 2;
      });
    expect(filled).toBe(true);
  }
  await left.getByRole("combobox").selectOption("3");
  await right
    .getByRole("combobox", { name: "Textus AI: Columns" })
    .selectOption("3");
  await expect(left.locator(".side-column")).toHaveCount(3);
  await expect(right.locator(".side-column")).toHaveCount(3);
  const divider = left.getByRole("separator").first();
  const before = await divider.getAttribute("aria-valuenow");
  await divider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(divider).not.toHaveAttribute("aria-valuenow", before!);
  await page.reload();
  await expect(left.locator(".side-column")).toHaveCount(3);
  await expect(left.getByRole("separator").first()).not.toHaveAttribute(
    "aria-valuenow",
    before!,
  );
});

test("the visible split control opens three resizable document panes", async ({
  page,
}) => {
  await openApp(page, { settings: { language: "en" } });
  const split = page.getByRole("button", { name: "Split document column" });
  await split.click();
  await expect(page.locator(".split-pane")).toHaveCount(2);
  await split.click();
  await expect(page.locator(".split-pane")).toHaveCount(3);
  await expect(page.locator(".split-divider")).toHaveCount(2);
});

test("paragraph scoring uses the selected paragraph and clears stale results", async ({
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
    "# Heading\n\nFirst paragraph.\n\nSecond paragraph.",
  );
  await mockInvoke(page, {
    ai_score_paragraph: [
      { name: "Clarity", score: 82, reason: "Clear statement." },
      { name: "Evidence", score: null, reason: "No sources supplied." },
      { name: "Persuasion", score: 60, reason: "A plain statement." },
      {
        name: "Statistical accuracy",
        score: null,
        reason: "No statistics supplied.",
      },
    ],
  });
  await page
    .getByRole("button", { name: "Writing tools", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Writing tools" });
  await dialog
    .getByRole("button", { name: "Paragraph scores", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Score paragraph", exact: true })
    .click();
  await expect(dialog).toContainText("Clarity: 82/100");
  await dialog
    .getByRole("combobox", { name: "Paragraph scores" })
    .selectOption("1");
  await expect(dialog).not.toContainText("82/100");
  await expect(dialog.locator("blockquote")).toHaveText("Second paragraph.");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".app-shell")).not.toHaveAttribute("inert");
});
