import type {} from "../../../docs/dev/textus";
import type { WorkspaceHost } from "./workspace";
import type { ParagraphAnchor } from "./passage-notes";
import {
  parseRubric,
  defaultRubrics,
  extractCandidates,
  buildRubric,
  estimateReview,
  rubricPrompt,
  validateAssessment,
  type Rubric,
  type ReviewMode,
} from "./rubrics";
import { parseJson } from "./analysis";
import { blockSpans } from "./markdown";

export function createReviewTools(
  ctx: Textus.PluginContext,
  host: WorkspaceHost,
  context: () => {
    selected: ParagraphAnchor | null;
    comparison: {
      originalText: string;
      originalVersion: string;
      originalTarget?: string;
    } | null;
    includeOriginal: boolean;
  },
) {
  let library: Rubric[] = defaultRubrics();
  let current: Rubric = library[0];
  let busy: string | null = null;
  let error = "";
  let preview: {
    text: string;
    documentText: string;
    document: string;
    version: string;
    scope: string;
    rubric: Rubric;
    prompt: string;
    inputTokens: number;
    outputTokens: number;
    usd: number | null;
    provider: string;
    model: string | null;
  } | null = null;
  let info: { provider: string; model: string | null } | null = null;
  let message = "";
  const ready = ctx.storage.global.get("rubric-library").then(async (raw) => {
    if (Array.isArray(raw))
      library = [
        ...library,
        ...raw
          .map((r) => parseRubric(JSON.stringify(r)))
          .filter((r) => !r.id.startsWith("builtin-")),
      ];
    const saved = await ctx.storage.global.get("rubric-current");
    current = library.find((r) => r.id === saved) ?? library[0];
  });
  const tr = (key: string) => textus.l10n.t(key);
  async function saveLibrary() {
    await ctx.storage.global.set(
      "rubric-library",
      library.filter((r) => !r.id.startsWith("builtin-")),
    );
    await ctx.storage.global.set("rubric-current", current.id);
  }
  async function scopeText(scope: string) {
    const s = host.state(),
      c = context();
    if (!s.path || !s.paper) throw new Error(tr("saveFirst"));
    if (scope === "original") {
      if (!c.comparison || !c.includeOriginal)
        throw new Error(tr("enableOriginal"));
      return {
        text: c.comparison.originalText,
        documentText: c.comparison.originalText,
        document: c.comparison.originalTarget!,
        version: c.comparison.originalVersion,
      };
    }
    let text = s.text;
    if (scope === "paragraph") {
      if (!c.selected) throw new Error(tr("selectParagraph"));
      text = c.selected.markdown;
    }
    if (scope === "block") {
      const block = blockSpans(s.text).find(
        (b) => b.id === c.selected?.argument,
      );
      if (!block) throw new Error(tr("selectParagraph"));
      text = block.text;
    }
    if (scope === "selection") {
      const selection = await textus.editor.getSelection({ document: s.path });
      text = selection?.markdown ?? selection?.text ?? "";
    }
    if (!text.trim()) throw new Error(tr("chooseText"));
    return {
      text,
      documentText: s.text,
      document: s.path,
      version: crypto.randomUUID(),
    };
  }
  function view() {
    const s = host.state();
    return {
      library,
      current,
      preview: preview
        ? {
            inputTokens: preview.inputTokens,
            outputTokens: preview.outputTokens,
            usd: preview.usd,
            scope: preview.scope,
            provider: preview.provider,
            model: preview.model,
          }
        : null,
      error,
      message,
      busy,
      info,
      assessments: s.paper?.assessments ?? [],
    };
  }
  async function handle(
    m: Record<string, any>,
    page: Textus.Webview,
  ): Promise<boolean> {
    if (m.action === "reviewInvalidate") {
      preview = null;
      host.publish();
      return true;
    }
    if (m.action === "rubricChoose") {
      const r = library.find((r) => r.id === m.id);
      if (r) {
        current = r;
        await ctx.storage.global.set("rubric-current", current.id);
      }
      preview = null;
      host.publish();
      return true;
    }
    if (m.action === "rubricImport") {
      const r = parseRubric(String(m.text));
      const collision = library.some((old) => old.id === r.id);
      current = collision ? { ...r, id: crypto.randomUUID() } : r;
      library = [...library, current];
      await saveLibrary();
      preview = null;
      message = tr(collision ? "rubricKeptBoth" : "rubricLoaded");
      host.publish();
      return true;
    }
    if (m.action === "rubricExport") {
      await page.postMessage({ rubricJson: JSON.stringify(current, null, 2) });
      return true;
    }
    if (m.action === "extractSource") {
      await page.postMessage({
        candidates: extractCandidates(String(m.text)),
        sourceName: String(m.filename).split(/[\\/]/).pop(),
      });
      return true;
    }
    if (m.action === "buildSourceJson") {
      if (
        !Array.isArray(m.selected) ||
        !m.selected.length ||
        m.selected.some((s: unknown) => typeof s !== "string")
      )
        throw new Error(tr("chooseCriteria"));
      const selected = (m.selected as string[]).slice(0, 50);
      if (m.kind === "plan")
        await page.postMessage({
          builtJson: JSON.stringify(
            {
              format: "textus-writing-template",
              version: 1,
              id: crypto.randomUUID(),
              revision: 1,
              components: [],
              blocks: selected.map((purpose, i) => ({
                id: `block-${i + 1}`,
                purpose,
                components: [],
                dependsOn: [],
              })),
            },
            null,
            2,
          ),
        });
      else
        await page.postMessage({
          builtJson: JSON.stringify(
            buildRubric(
              String(m.name),
              m.mode as ReviewMode,
              selected,
              String(m.filename),
              Number(m.min),
              Number(m.max),
            ),
            null,
            2,
          ),
        });
      return true;
    }
    if (m.action === "reviewEstimate") {
      const source = await scopeText(String(m.scope));
      const outputTokens = Number(m.outputTokens);
      if (
        !Number.isInteger(outputTokens) ||
        outputTokens < 100 ||
        outputTokens > 8000
      )
        throw new Error(tr("invalidReply"));
      const rate = (r: unknown) =>
        r === "" || r === null || r === undefined ? null : Number(r);
      const inputRate = rate(m.inputRate),
        outputRate = rate(m.outputRate);
      if (
        [inputRate, outputRate].some(
          (r) => r !== null && (!Number.isFinite(r) || r < 0),
        )
      )
        throw new Error(tr("invalidReply"));
      info = await textus.ai.info();
      const prompt =
        rubricPrompt(current, source.text) +
        `\nKeep the response concise, approximately under ${outputTokens} tokens.`;
      preview = {
        ...source,
        scope: String(m.scope),
        rubric: structuredClone(current),
        prompt,
        ...estimateReview(prompt, outputTokens, inputRate, outputRate),
        ...info,
      };
      error = "";
      host.publish();
      return true;
    }
    if (m.action === "reviewRun") {
      if (!preview) throw new Error(tr("estimateFirst"));
      const source = await scopeText(preview.scope);
      if (
        source.document !== preview.document ||
        source.documentText !== preview.documentText ||
        source.text !== preview.text ||
        JSON.stringify(current) !== JSON.stringify(preview.rubric)
      )
        throw new Error(tr("reviewStalePreview"));
      const s = host.state();
      if (!s.paper || !s.path || busy) return true;
      const pinned = preview;
      const cached = s.paper.assessments?.find(
        (a) =>
          a.document === pinned.document &&
          a.text === pinned.text &&
          a.documentText === pinned.documentText &&
          a.scope === pinned.scope &&
          JSON.stringify(a.rubric) === JSON.stringify(pinned.rubric) &&
          a.provider === pinned.provider &&
          a.model === pinned.model,
      );
      if (cached) {
        message = tr("cachedReview");
        host.publish();
        return true;
      }
      const id = crypto.randomUUID(),
        path = s.path;
      busy = id;
      error = "";
      message = "";
      host.publish();
      try {
        const reply = await textus.ai.request({
          id,
          document: path,
          version: pinned.version,
          prompt: pinned.prompt,
          expectedProvider: pinned.provider,
          expectedModel: pinned.model,
        });
        if (
          busy !== id ||
          host.state().path !== path ||
          reply.version !== pinned.version ||
          reply.docPath !== path
        )
          return true;
        const results = validateAssessment(
          parseJson(reply.text),
          pinned.rubric,
          pinned.text,
        );
        await host.transaction(async () => {
          const latest = host.state().paper;
          if (!latest || host.state().path !== path) return;
          await host.save(
            {
              ...latest,
              assessments: [
                ...(latest.assessments ?? []),
                {
                  id,
                  document: pinned.document,
                  documentText: pinned.documentText,
                  version: pinned.version,
                  text: pinned.text,
                  scope: pinned.scope,
                  rubric: pinned.rubric,
                  provider: reply.provider,
                  model: reply.model,
                  at: new Date().toISOString(),
                  results,
                },
              ],
            },
            "rubric-reviewed",
            id,
            pinned.version,
          );
        });
      } catch (e) {
        error = String(e);
      } finally {
        if (busy === id) busy = null;
        host.publish();
      }
      return true;
    }
    if (m.action === "cancel" && busy) {
      const id = busy;
      busy = null;
      await textus.ai.cancel(id);
      host.publish();
      return true;
    }
    return false;
  }
  return { ready, view, handle, busy: () => busy };
}
