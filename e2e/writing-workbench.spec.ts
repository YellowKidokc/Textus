import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openApp } from "./helpers";

// Each worker builds into its own folder: a shared one is emptied under the
// others while they read it.
const out = mkdtempSync(join(tmpdir(), "textus-workbench-"));
execFileSync(process.execPath, ["scripts/build-writing-workbench.mjs", out], {
  stdio: "pipe",
});
const manifest = JSON.parse(
  readFileSync(join(out, "textus-plugin.json"), "utf8"),
);
const files = Object.fromEntries(
  ["host.js", "view.html", "inspector.html"].map((file) => [
    file,
    readFileSync(join(out, file), "utf8"),
  ]),
);
const PATH = "/work/paper.md";
const editor = '[data-active-tab="true"] .ProseMirror';

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const logs = await page.evaluate(async () => {
    const module = "/src/plugins/store/plugin-log.ts";
    return (await import(module)).pluginLog("yellowkid.writing-workbench");
  });
  await info.attach("plugin-log", {
    body: JSON.stringify(logs, null, 2),
    contentType: "application/json",
  });
});

async function emit(page: Page, event: string, payload?: unknown) {
  await page.evaluate(
    ([name, value]) => (window as any).__devEmitTauriEvent(name, value),
    [event, payload],
  );
}
async function open(page: Page) {
  await page.addInitScript(
    ({ manifest, files, path }) => {
      if (window.top !== window) return;
      const w = window as any;
      const retained = JSON.parse(
        localStorage.getItem("writing-test-retained") || "null",
      );
      w.__devFs = retained?.files ?? {
        [path]:
          "Imagine a bridge that can carry only one person at a time.\n\n",
      };
      w.__devPluginStore = retained?.store ?? {};
      w.__devPickFolder = "/work";
      w.__devPlugins = [
        {
          id: manifest.id,
          dir: "/plugins/workbench",
          manifest: JSON.stringify(manifest),
          files,
          dev: false,
        },
      ];
      w.__devPluginState = {
        allOn: true,
        plugins: {
          [manifest.id]: { enabled: true, granted: manifest.permissions },
        },
      };
    },
    { manifest, files, path: PATH },
  );
  await openApp(page, {
    settings: { language: "en", textusAi: true, aiProvider: "openai" },
  });
  await emit(page, "menu-open-recent", PATH);
  await expect(page.locator(editor)).toContainText("Imagine a bridge");
  await emit(page, "menu-toggle-sidebar");
  await page
    .locator(".sidebar-tabs")
    .getByRole("button", { name: "Writing workbench" })
    .click();
  return page.frameLocator(".plugin-webview-frame");
}
async function model(page: Page, delayed = false, failure = false) {
  await page.evaluate(
    ({ delayed, failure }) => {
      const w = window as any;
      const original = w.__TAURI_INTERNALS__.invoke;
      w.__TAURI_INTERNALS__.invoke = async (cmd: string, args: any) => {
        if (cmd !== "ai_plugin_request") return original(cmd, args);
        w.__writingRequests = (w.__writingRequests || 0) + 1;
        if (failure) throw new Error("Test provider unavailable");
        const payload = JSON.parse(
          args.prompt.slice(args.prompt.lastIndexOf("\n") + 1),
        );
        let result;
        if (args.prompt.startsWith("Analyze writing")) {
          const block = payload.blocks.find((b: any) =>
            b.plan.intentions.some((i: any) => i.component === "story:S04"),
          );
          const quote =
            "Imagine a bridge that can carry only one person at a time.";
          const start = block.text.indexOf(quote);
          result = {
            findings: [
              {
                block: block.id,
                component: "story:S04",
                quote,
                start,
                end: start + quote.length,
                explanation:
                  "An explicitly imagined case invites testing a constraint.",
                uncertainty: "It provides an illustration, not evidence.",
                storyKind: "hypothetical",
                sources: [],
              },
            ],
          };
        } else
          result = {
            text: "Imagine a bridge with room for one person.\n\n",
            reason: "Uses fewer words without adding facts.",
          };
        if (delayed) await new Promise((resolve) => setTimeout(resolve, 1500));
        return {
          text: JSON.stringify(result),
          outputLimitEnforced: false,
          usage: null,
        };
      };
    },
    { delayed, failure },
  );
}

test("plans, analyzes, records scoped decisions, carries intent, uses native review, and round trips a private template", async ({
  page,
}) => {
  const panel = await open(page);
  await model(page);
  await panel.getByRole("button", { name: "Add argument block" }).click();
  await panel
    .getByLabel("What must this block establish?")
    .fill("Illustrate the constraint");
  await panel.getByLabel("Find components").click();
  await panel.getByLabel("State the claim", { exact: true }).check();
  await panel.getByLabel("Thought experiment", { exact: true }).check();
  await panel.getByLabel("Socratic question", { exact: true }).check();
  await panel.getByRole("button", { name: "Add argument block" }).click();
  await panel.getByRole("button", { name: "Move up" }).nth(1).click();
  await expect(panel.locator("#error")).toBeEmpty();
  await panel.getByRole("button", { name: "Analyze now" }).click();
  await expect(panel.locator("#coverage blockquote")).toContainText(
    "Imagine a bridge",
  );
  const findings = panel.locator("#coverage details");
  await findings.getByRole("combobox").selectOption("confirmed");
  await expect(findings.getByRole("combobox")).toHaveValue("confirmed");
  await panel
    .locator("#coverage .card")
    .filter({ hasText: "Socratic question" })
    .getByRole("combobox")
    .selectOption("deferred");
  await panel
    .locator("#plan .card")
    .first()
    .getByRole("button")
    .first()
    .click();
  await panel
    .locator("#coverage .card")
    .filter({ hasText: "Socratic question" })
    .getByRole("button", { name: "Move intention to selected block" })
    .click();
  await expect(panel.locator("#error")).toBeEmpty();
  await panel
    .locator("#plan .card")
    .filter({ hasText: "Illustrate the constraint" })
    .getByRole("button")
    .first()
    .click();
  await panel
    .getByRole("button", { name: "Make this block plainer", exact: true })
    .first()
    .click();
  await expect(panel.locator("#rewrites details")).toHaveCount(1);
  await panel.locator("#rewrites summary").click();
  await panel.getByRole("button", { name: "Review in the document" }).click();
  await expect(panel.locator("#error")).toBeEmpty();
  await expect(
    page.getByRole("button", { name: "Take this change", exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Take this change", exact: true })
    .first()
    .click();
  await expect(page.locator(editor)).toContainText(
    "Imagine a bridge with room for one person.",
  );
  await emit(page, "menu-save-file");
  await expect
    .poll(() => page.evaluate((path) => (window as any).__devFs[path], PATH))
    .toContain("with room for one person");
  await panel.locator("#templateTitle").click();
  await panel.getByRole("button", { name: "Export template" }).click();
  await expect(panel.getByLabel("Template JSON")).toHaveValue(/"format"/);
  const exported = await panel.getByLabel("Template JSON").inputValue();
  expect(exported).not.toContain("Imagine a bridge");
  expect(exported).not.toContain('"analyses"');
  const parsed = JSON.parse(exported);
  expect(parsed.blocks).toHaveLength(2);
  await panel
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(panel.locator("#preview")).toContainText(parsed.id);
  await panel
    .getByRole("button", { name: "Import as new", exact: true })
    .click();
  await expect(panel.locator("#error")).toContainText("saved blank paper");
  // The dev backend is intentionally in memory: preserve its files and store
  // to test a fresh host loading the same durable-store contract, not the OS.
  await page.evaluate(() =>
    localStorage.setItem(
      "writing-test-retained",
      JSON.stringify({
        files: (window as any).__devFs,
        store: (window as any).__devPluginStore,
      }),
    ),
  );
  await page.reload();
  await emit(page, "menu-open-recent", PATH);
  await expect(page.locator(editor)).toContainText("with room for one person");
  const toggle = page
    .locator(".sidebar-tabs")
    .getByRole("button", { name: "Writing workbench" });
  if (!(await toggle.isVisible())) await emit(page, "menu-toggle-sidebar");
  await toggle.click();
  await expect(panel.locator("#coverage")).toContainText(
    "Earlier confirmation",
  );
  await expect(panel.locator("#history")).toContainText("intention-moved");
  await page.screenshot({
    path: "test-results/writing-workbench.png",
    fullPage: true,
  });
  await panel.getByRole("button", { name: "New paper", exact: true }).click();
  const dialog = page.locator(".app-dialog");
  await dialog.getByRole("textbox").fill("template-copy.md");
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await expect(panel.locator("#plan .card")).toHaveCount(0);
  await panel.locator("#templateTitle").click();
  await panel.getByLabel("Template JSON").fill(exported);
  await panel
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(panel.locator("#preview")).toContainText(parsed.id);
  await panel
    .getByRole("button", { name: "Import as new", exact: true })
    .click();
  await expect(panel.locator("#plan .card")).toHaveCount(2);
  await expect(panel.locator("#error")).toBeEmpty();
});

test("an older response stays stale after native edits, and provider failure leaves prose writable", async ({
  page,
}) => {
  const panel = await open(page);
  await panel.getByRole("button", { name: "Add argument block" }).click();
  await panel.getByLabel("Thought experiment", { exact: true }).check();
  await model(page, true);
  await panel.getByRole("button", { name: "Analyze now" }).click();
  await expect(panel.locator("#status")).toContainText("Running");
  await page.locator(editor).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" More detail.");
  await expect(panel.locator("#coverage details summary")).toContainText(
    "Older analysis",
  );
  await expect(panel.locator("#coverage details select")).toBeDisabled();
  await model(page, false, true);
  await panel.getByRole("button", { name: "Analyze now" }).click();
  await expect(panel.locator("#error")).toContainText(
    "Test provider unavailable",
  );
  await expect(page.locator(editor)).toContainText("More detail.");
  await emit(page, "menu-save-file");
  await expect
    .poll(() => page.evaluate((path) => (window as any).__devFs[path], PATH))
    .toContain("More detail.");
});

test("native review can reject a rewrite and native undo restores reordered block identities", async ({
  page,
}) => {
  const panel = await open(page);
  await model(page);
  await panel.getByRole("button", { name: "Add argument block" }).click();
  await panel
    .getByRole("button", { name: "Make this block plainer", exact: true })
    .click();
  await expect(panel.locator("#rewrites details")).toHaveCount(1);
  await panel.locator("#rewrites summary").click();
  await panel.getByRole("button", { name: "Review in the document" }).click();
  await page
    .getByRole("button", { name: "Keep the original", exact: true })
    .first()
    .click();
  await expect(page.locator(editor)).toContainText(
    "that can carry only one person at a time",
  );
  await expect(page.locator(editor)).not.toContainText(
    "with room for one person",
  );
  await panel.getByRole("button", { name: "Add argument block" }).click();
  await expect(panel.locator("#plan .card")).toHaveCount(2);
  const before = await page.locator(editor).textContent();
  const ids = before!.match(/textus-argument:[a-f0-9-]+/g)!;
  expect(ids).toHaveLength(2);
  await panel.getByRole("button", { name: "Move up" }).nth(1).click();
  await expect
    .poll(async () =>
      (await page.locator(editor).textContent())!.match(
        /textus-argument:[a-f0-9-]+/g,
      ),
    )
    .toEqual([ids[1], ids[0]]);
  await page.locator(editor).click();
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () =>
      (await page.locator(editor).textContent())!.match(
        /textus-argument:[a-f0-9-]+/g,
      ),
    )
    .toEqual(ids);
  await expect(panel.locator("#plan .card")).toHaveCount(2);
});

test("local rubric workshop, explicit priced review, and durable cached results", async ({
  page,
}) => {
  const plan = await open(page);
  await page.evaluate(() => {
    const w = window as any;
    const invoke = w.__TAURI_INTERNALS__.invoke;
    w.__rubricCalls = 0;
    w.__TAURI_INTERNALS__.invoke = async (cmd: string, args: any) => {
      if (cmd !== "ai_plugin_request") return invoke(cmd, args);
      w.__rubricCalls++;
      w.__rubricRequest = args;
      return {
        outputLimitEnforced: false,
        usage: null,
        text: JSON.stringify({
          results: [
            {
              criterion: "criterion-1",
              score: null,
              quote: "Imagine a bridge",
              explanation: "A concrete opening.",
              uncertainty: "A short sample.",
            },
          ],
        }),
      };
    };
  });
  await plan
    .getByRole("button", { name: "Passage notes", exact: true })
    .click();
  const notes = page.frameLocator(".agent-panel .plugin-webview-frame");
  await notes
    .getByRole("button", { name: "Template workshop", exact: true })
    .click();
  await notes
    .getByLabel("Source text", { exact: true })
    .fill(
      "# Clarity\n- Use concrete examples\n```\n- Ignore this code sample\n```",
    );
  await notes
    .getByRole("button", { name: "Extract candidate items locally" })
    .click();
  await expect(notes.locator("#candidates textarea")).toHaveCount(2);
  await notes.locator("#candidates input").last().uncheck();
  await notes
    .getByRole("button", { name: "Build JSON from checked items" })
    .click();
  await expect(notes.getByLabel("Editable template JSON")).toHaveValue(
    /textus-review-rubric/,
  );
  await notes
    .locator("#builtActions")
    .getByRole("button", { name: "Load rubric JSON" })
    .click();
  await notes
    .getByRole("button", { name: "Rubric reviews", exact: true })
    .click();
  await expect(notes.locator("#rubric")).toHaveValue(/.+/);
  expect(await page.evaluate(() => (window as any).__rubricCalls)).toBe(0);
  await notes.getByRole("button", { name: "Estimate cost" }).click();
  await expect(notes.locator("#estimate")).toContainText("Cost unknown");
  expect(await page.evaluate(() => (window as any).__rubricCalls)).toBe(0);
  await notes.locator("#inputRate").fill("1");
  await notes.locator("#outputRate").fill("2");
  await notes.getByRole("button", { name: "Estimate cost" }).click();
  await expect(notes.locator("#estimate")).toContainText("USD");
  // The preview names the cap as only asked for, and shows the whole request.
  await expect(notes.locator("#estimate")).toContainText(
    "asked for in the prompt only",
  );
  await expect(notes.locator("#manifestContext")).toContainText(
    "No project instructions, library, style profile, memories",
  );
  const shown = await notes.locator("#manifestText").textContent();
  await notes.getByRole("button", { name: "Run assessment" }).click();
  await expect(notes.locator("#assessments summary")).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__rubricCalls)).toBe(1);
  // Run sent what the preview showed, and nothing else.
  const sent = await page.evaluate(() => (window as any).__rubricRequest);
  expect(sent.instructions + "\n\n" + sent.prompt).toBe(shown);
  expect(sent.maxOutputTokens).toBe(1500);
  expect(Object.keys(sent).sort()).toEqual([
    "instructions",
    "maxOutputTokens",
    "model",
    "prompt",
    "provider",
    "requestId",
  ]);
  await notes.getByRole("button", { name: "Run assessment" }).click();
  await expect(notes.locator("#reviewMessage")).toContainText("No API request");
  expect(await page.evaluate(() => (window as any).__rubricCalls)).toBe(1);
  await page.evaluate(() => {
    const w = window as any;
    localStorage.setItem(
      "writing-test-retained",
      JSON.stringify({ files: w.__devFs, store: w.__devPluginStore }),
    );
  });
  await page.reload();
  await emit(page, "menu-open-recent", PATH);
  // The saved inspector selection and document-scoped result survive reopening.
  await expect(
    page
      .frameLocator(".agent-panel .plugin-webview-frame")
      .locator("#assessments summary"),
  ).toHaveCount(1);
});

test("frozen original stays unchanged while paragraph rewrites target the separate working revision", async ({
  page,
}) => {
  const plan = await open(page);
  await plan.getByRole("button", { name: "Add argument block" }).click();
  await page
    .locator(editor)
    .getByText("Imagine a bridge", { exact: false })
    .click();
  await plan.getByRole("button", { name: "Revise beside original" }).click();
  // Native Textus input dialog names the separate revision.
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").locator("input").fill("Plain language");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /OK|Create|Confirm/ })
    .click();
  const original = page.locator('[data-tab-id^="frozen:"] .ProseMirror');
  await expect(original).toContainText("Imagine a bridge");
  const revision = page.locator('[data-active-tab="true"] .ProseMirror');
  await expect(revision).toContainText("Imagine a bridge");
  const frozen = await original.textContent();
  await expect(original).toHaveAttribute("contenteditable", "false");
  await revision.getByText("Imagine a bridge", { exact: false }).click();
  await plan
    .getByRole("button", { name: "Passage notes", exact: true })
    .click();
  const notes = page.frameLocator(".agent-panel .plugin-webview-frame");
  await expect(notes.locator("#paragraph")).toContainText("Imagine a bridge");
  await page.evaluate(() => {
    const w = window as any,
      invoke = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (cmd: string, args: any) => {
      if (cmd !== "ai_plugin_request") return invoke(cmd, args);
      if (args.prompt.startsWith("Inspect this paragraph"))
        return {
          outputLimitEnforced: false,
          usage: null,
          text: JSON.stringify({
            notes: [
              {
                category: "USED",
                quote: "Imagine a bridge",
                explanation: "An imagined constraint illustrates the point.",
                uncertainty: "It is not evidence.",
              },
            ],
          }),
        };
      return {
        outputLimitEnforced: false,
        usage: null,
        text: JSON.stringify({
          alternatives: [
            {
              text: "Imagine a bridge with room for one person.",
              reason: "Uses fewer words.",
            },
          ],
        }),
      };
    };
  });
  await notes
    .getByRole("button", { name: "Analyze paragraph", exact: true })
    .click();
  await expect(notes.locator("#findings blockquote")).toContainText(
    "Imagine a bridge",
  );
  await notes.locator("#findings select").selectOption("confirmed");
  await expect(notes.locator("#findings select")).toHaveValue("confirmed");
  await original.getByText("Imagine a bridge", { exact: false }).click();
  await notes
    .getByRole("button", { name: "Rewrite paragraph", exact: true })
    .click();
  await expect(notes.locator("#proposals summary")).toHaveCount(1);
  // The request is about the working revision, never the frozen original or
  // the source file: the proposal it saved names the revision.
  const targets = await page.evaluate(() => {
    const found: string[] = [];
    const walk = (v: any) => {
      if (!v || typeof v !== "object") return;
      if (Array.isArray(v.passageProposals))
        for (const p of v.passageProposals) found.push(p.document);
      Object.values(v).forEach(walk);
    };
    walk((window as any).__devPluginStore);
    return found;
  });
  expect(targets).toHaveLength(1);
  expect(targets[0]).toMatch(/^\/work\/revision-/);
  await notes.locator("#proposals summary").click();
  await notes.getByRole("button", { name: "Send to native review" }).click();
  await expect(
    page.getByRole("button", { name: "Take this change", exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Take this change", exact: true })
    .first()
    .click();
  await expect(
    page
      .locator(".ProseMirror")
      .filter({ hasText: "Imagine a bridge with room for one person." }),
  ).toHaveCount(1);
  await expect(original).toHaveText(frozen!);
  expect(
    await page.evaluate(() => (window as any).__devFs["/work/paper.md"]),
  ).toContain("Imagine a bridge that can carry only one person at a time.");
  const revisionPath = targets[0];
  await emit(page, "menu-save-file");
  await page.evaluate(() => {
    const w = window as any;
    localStorage.setItem(
      "writing-test-retained",
      JSON.stringify({ files: w.__devFs, store: w.__devPluginStore }),
    );
  });
  await page.reload();
  await emit(page, "menu-open-recent", revisionPath);
  await expect(
    page.locator('[data-tab-id^="frozen:"] .ProseMirror'),
  ).toHaveText(frozen!);
  await expect(
    page
      .locator(".ProseMirror")
      .filter({ hasText: "Imagine a bridge with room for one person." }),
  ).toHaveCount(1);
});
