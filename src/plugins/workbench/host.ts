import type {} from "../../../docs/dev/textus";
import { createWorkspace } from "./workspace";
import { readPaper } from "./read-paper";
import { mapEditorBlocks } from "./mapping";
import { COMPONENTS } from "./registry";
import {
  newPaper,
  record,
  snapshot,
  isCurrent,
  type Paper,
  type Decision,
} from "./model";
import { blockSpans, marker, moveBlock } from "./markdown";
import {
  analysisPrompt,
  ANALYSIS_VERSION,
  REWRITE_VERSION,
  parseJson,
  validateFindings,
  rewritePrompt,
} from "./analysis";
import {
  exportTemplate,
  parseTemplate,
  instantiateTemplate,
  dependencyProblems,
} from "./templates";

declare const exports: { activate: (ctx: Textus.PluginContext) => void };

exports.activate = (ctx) => {
  if (
    typeof textus.ai.request !== "function" ||
    typeof textus.ai.info !== "function" ||
    typeof textus.editor.getParagraph !== "function"
  )
    throw new Error("Writing workbench requires Textus plugin API 1.3.");
  const pages = new Set<Textus.Webview>();
  let path: string | null = null;
  let paper: Paper | null = null;
  let text = "";
  let error = "";
  let saved = false;
  let busy: string | null = null;
  let serial: Promise<unknown> = Promise.resolve();
  let loading = 0;
  const tr = (key: string) => textus.l10n.t(key);

  function view() {
    let blocks: ReturnType<typeof blockSpans> = [];
    try {
      blocks = blockSpans(text);
    } catch (e) {
      error = String(e);
    }
    return {
      path,
      paper,
      text,
      blocks,
      components: COMPONENTS,
      dependencyProblems: dependencyProblems(
        blocks
          .map((span) => paper?.blocks.find((b) => b.id === span.id))
          .filter((b): b is NonNullable<typeof b> => !!b),
      ),
      error,
      saved,
      ...workspace.view(),
      busy: busy ?? workspace.view().busy,
    };
  }
  function publish() {
    // A sidebar can close while its asynchronous resolver is still loading.
    // Sending to that disposed view is normal lifecycle, not a plugin failure.
    for (const page of pages)
      void page.postMessage(view()).catch(() => pages.delete(page));
  }
  function report(e: unknown) {
    error = String(e);
    ctx.log.warn(error);
    publish();
  }

  async function refresh() {
    const own = ++loading;
    await workspace.ready;
    const nextPath = workspace.target() ?? (await textus.editor.getPath());
    const nextText =
      (await textus.editor.getText(
        nextPath ? { document: nextPath } : undefined,
      )) ?? "";
    if (own !== loading) return;
    if (nextPath !== path || (nextPath !== null && paper === null)) {
      if (busy) {
        await textus.ai.cancel(busy);
        busy = null;
      }
      path = nextPath;
      paper = null;
      saved = false;
      error = "";
      if (path) {
        const raw = await ctx.storage.document(path).get("paper");
        if (own !== loading) return;
        if (raw) {
          paper = readPaper(raw);
          saved = true;
        } else paper = newPaper();
      }
    }
    text = nextText;
    await workspace.observe();
    publish();
  }
  async function save(
    next: Paper,
    action: string,
    target: string,
    version?: string,
  ) {
    if (!path) throw new Error(tr("saveFirst"));
    const destination = path;
    const value = record(
      next,
      action,
      target,
      version ?? snapshot(next, text).id,
    );
    // Only acknowledge a decision after the durable plugin store accepts it.
    await ctx.storage.document(destination).set("paper", value);
    if (path === destination) {
      paper = value;
      saved = true;
      error = "";
      await workspace.observe();
      publish();
    }
  }
  async function edit(nextText: string) {
    if (!path) throw new Error(tr("saveFirst"));
    const original = text;
    const blocks =
      (await textus.editor.getBlocks(path ? { document: path } : undefined)) ??
      [];
    const change: Textus.Change = blocks.length
      ? {
          action: "replace",
          block: blocks[0].id,
          lastBlock: blocks[blocks.length - 1].id,
          text: nextText,
        }
      : { action: "append", text: nextText };
    const ok = await textus.editor.edit(change, {
      document: path,
      expectedText: original,
      expectedPath: path,
    });
    if (!ok) throw new Error(tr("changed"));
    text =
      (await textus.editor.getText(path ? { document: path } : undefined)) ??
      nextText;
  }
  async function add() {
    if (!paper) throw new Error(tr("saveFirst"));
    const before = paper;
    const id = crypto.randomUUID();
    const first = !blockSpans(text).length;
    // Empty markers need a visible heading so authors have a place to write.
    const next = first
      ? marker(id) + (text.trim() ? text : `## ${tr("argument")}\n\n`)
      : text.trimEnd() + "\n\n" + marker(id) + `## ${tr("argument")}\n\n`;
    await edit(next);
    await save(
      {
        ...before,
        blocks: [
          ...before.blocks,
          { id, purpose: "", intentions: [], dependsOn: [] },
        ],
      },
      "block-added",
      id,
    );
  }
  async function choose(block: string, component: string, selected: boolean) {
    if (!paper || !COMPONENTS.some((c) => c.id === component)) return;
    await save(
      {
        ...paper,
        blocks: paper.blocks.map((b) =>
          b.id !== block
            ? b
            : {
                ...b,
                intentions: selected
                  ? b.intentions.some((i) => i.component === component)
                    ? b.intentions
                    : [
                        ...b.intentions,
                        {
                          id: crypto.randomUUID(),
                          component,
                          decision: "planned",
                        },
                      ]
                  : b.intentions.filter((i) => i.component !== component),
              },
        ),
      },
      selected ? "component-selected" : "component-removed",
      block,
    );
  }
  async function decide(block: string, id: string, decision: Decision) {
    if (
      !paper ||
      ![
        "planned",
        "confirmed",
        "deferred",
        "dismissed",
        "unnecessary",
      ].includes(decision)
    )
      return;
    const body = blockSpans(text).find((b) => b.id === block)?.text;
    await save(
      {
        ...paper,
        blocks: paper.blocks.map((b) =>
          b.id !== block
            ? b
            : {
                ...b,
                intentions: b.intentions.map((i) =>
                  i.id !== id
                    ? i
                    : {
                        ...i,
                        decision,
                        text: decision === "confirmed" ? body : undefined,
                      },
                ),
              },
        ),
      },
      decision,
      id,
    );
  }
  async function analyze(kind: "analysis" | "rewrite", block: string) {
    if (!paper || !path || busy) return;
    const examined = paper;
    const source = snapshot(examined, text);
    const sourcePath = path;
    const span = blockSpans(text).find((b) => b.id === block);
    if (
      kind === "analysis" &&
      paper.analyses.some((a) => isCurrent(a.snapshot, examined, text))
    ) {
      textus.ui.notice(tr("unchanged"));
      return;
    }
    if (kind === "rewrite" && !span?.text.trim())
      throw new Error(tr("writeFirst"));
    const id = crypto.randomUUID();
    busy = id;
    publish();
    try {
      const reply = await textus.ai.request({
        id,
        document: sourcePath!,
        version: source.id,
        prompt:
          kind === "analysis"
            ? analysisPrompt(examined, source)
            : rewritePrompt(span!.text),
      });
      if (
        busy !== id ||
        path !== sourcePath ||
        reply.version !== source.id ||
        reply.docPath !== sourcePath
      )
        return;
      const result = parseJson(reply.text);
      const finish = async () => {
        if (busy !== id || path !== sourcePath) return;
        // Refresh text while retaining newer author decisions in the current plan.
        text =
          (await textus.editor.getText(
            path ? { document: path } : undefined,
          )) ?? text;
        if (!paper) return;
        if (kind === "analysis") {
          const findings = validateFindings(result, examined, source);
          await save(
            {
              ...paper,
              analyses: [
                ...paper.analyses,
                {
                  id,
                  snapshot: source,
                  provider: reply.provider,
                  model: reply.model,
                  promptVersion: ANALYSIS_VERSION,
                  findings,
                },
              ],
            },
            "analysis-completed",
            id,
            source.id,
          );
        } else {
          const r = result as { text?: unknown; reason?: unknown } | null;
          if (
            !r ||
            typeof r.text !== "string" ||
            !r.text.trim() ||
            typeof r.reason !== "string" ||
            blockSpans(r.text).length
          )
            throw new Error(tr("invalidReply"));
          await save(
            {
              ...paper,
              proposals: [
                ...paper.proposals,
                {
                  id,
                  snapshot: source,
                  block,
                  original: span!.text,
                  proposed: r.text,
                  reason: r.reason,
                  action: "plainer",
                  provider: reply.provider,
                  model: reply.model,
                  promptVersion: REWRITE_VERSION,
                  decision: "pending",
                },
              ],
            },
            "rewrite-generated",
            id,
            source.id,
          );
        }
      };
      serial = serial.catch(() => {}).then(finish);
      await serial;
    } finally {
      if (busy === id) {
        busy = null;
        publish();
      }
    }
  }
  async function propose(id: string) {
    if (!paper) return;
    const proposal = paper.proposals.find((r) => r.id === id);
    if (
      !proposal ||
      proposal.decision !== "pending" ||
      !isCurrent(proposal.snapshot, paper, text)
    )
      throw new Error(tr("changed"));
    const blocks = await textus.editor.getBlocks(
      path ? { document: path } : undefined,
    );
    const mapping = mapEditorBlocks(blocks ?? [], proposal.block);
    if (!mapping.length) throw new Error(tr("unresolved"));
    const placed = await textus.editor.propose(
      {
        action: "replace",
        block: mapping[0].id,
        lastBlock: mapping[mapping.length - 1].id,
        text: proposal.proposed,
      },
      {
        document: path!,
        reason: `${proposal.id}: ${proposal.reason}`,
        expectedText: text,
        expectedPath: path!,
      },
    );
    if (!placed) throw new Error(tr("changed"));
    await save(
      paper,
      "rewrite-sent-to-native-review",
      id,
      proposal.snapshot.id,
    );
    textus.ui.notice(tr("reviewNative"));
  }
  async function handle(message: unknown, page: Textus.Webview) {
    if (!message || typeof message !== "object") return;
    const m = message as Record<string, any>;
    if (m.action === "refresh") return refresh();
    await refresh();
    if (await workspace.handle(m, page)) return;
    if (m.action === "new") {
      const root = await textus.files.root();
      if (!root) throw new Error(tr("openFolder"));
      const name = await textus.ui.input({
        prompt: tr("filename"),
        value: `paper-${Date.now()}.md`,
      });
      if (name === null) return;
      if (!/^[\p{L}\p{N} ._-]+\.md$/u.test(name))
        throw new Error(tr("filename"));
      const destination = root.replace(/[\\/]$/, "") + "/" + name;
      await textus.files.create(destination, "");
      await textus.layout.open(destination);
      return refresh();
    }
    if (!paper || !path) throw new Error(tr("saveFirst"));
    if (m.action === "add") return add();
    if (m.action === "intent")
      return save(
        { ...paper, intent: String(m.value).slice(0, 4000) },
        "paper-intent",
        paper.id,
      );
    if (m.action === "purpose")
      return save(
        {
          ...paper,
          blocks: paper.blocks.map((b) =>
            b.id === m.block
              ? { ...b, purpose: String(m.value).slice(0, 2000) }
              : b,
          ),
        },
        "block-purpose",
        m.block,
      );
    if (m.action === "choose")
      return choose(m.block, m.component, m.selected === true);
    if (m.action === "decide") return decide(m.block, m.id, m.decision);
    if (m.action === "move") {
      const before = paper;
      await edit(moveBlock(text, m.block, m.delta === -1 ? -1 : 1));
      return save(before, "block-moved", m.block);
    }
    if (m.action === "analyze") return analyze("analysis", m.block);
    if (m.action === "rewrite") return analyze("rewrite", m.block);
    if (m.action === "propose") return propose(m.id);
    if (m.action === "cancel") {
      const id = busy;
      busy = null;
      if (id) await textus.ai.cancel(id);
      publish();
      return;
    }
    if (m.action === "carry") {
      const item = paper.blocks
        .find((b) => b.id === m.from)
        ?.intentions.find((i) => i.id === m.id);
      if (
        !item ||
        m.from === m.to ||
        paper.blocks
          .find((b) => b.id === m.to)
          ?.intentions.some((i) => i.component === item.component)
      )
        return;
      return save(
        {
          ...paper,
          blocks: paper.blocks.map((b) =>
            b.id === m.from
              ? { ...b, intentions: b.intentions.filter((i) => i.id !== m.id) }
              : b.id === m.to
                ? {
                    ...b,
                    intentions: [
                      ...b.intentions,
                      { ...item, decision: "planned", text: undefined },
                    ],
                  }
                : b,
          ),
        },
        "intention-moved",
        m.id,
      );
    }
    if (m.action === "export") {
      page.postMessage({
        template: JSON.stringify(
          exportTemplate(
            paper,
            blockSpans(text).map((b) => b.id),
          ),
          null,
          2,
        ),
      });
      return;
    }
    if (m.action === "copy") {
      await textus.env.writeClipboard(String(m.text));
      return;
    }
    if (m.action === "preview") {
      const t = parseTemplate(String(m.text));
      page.postMessage({ preview: t });
      return;
    }
    if (m.action === "import") {
      if (text.trim() || paper.blocks.length) throw new Error(tr("blankFirst"));
      const template = parseTemplate(String(m.text));
      const created = instantiateTemplate(template);
      await edit(created.text);
      return save(created.paper, "template-imported-as-new", template.id);
    }
  }
  const workspace = createWorkspace(ctx, {
    state: () => ({ path, paper, text }),
    save,
    refresh,
    publish,
    transaction(fn) {
      const pending = serial.catch(() => {}).then(fn);
      serial = pending;
      return pending;
    },
  });
  const provider = (
    file: string,
  ): Parameters<typeof textus.views.registerWebview>[1] => ({
    async resolve(page) {
      pages.add(page);
      page.onDidDispose(() => pages.delete(page));
      page.onDidReceiveMessage((message) => {
        // Long model requests run alongside author decisions and cancellation.
        if (
          message &&
          typeof message === "object" &&
          "action" in message &&
          [
            "analyze",
            "rewrite",
            "cancel",
            "passageAnalyze",
            "paragraphRewrite",
            "transitionBridge",
            "reviewRun",
            "askOriginal",
          ].includes(String(message.action))
        ) {
          void handle(message, page).catch(report);
          return;
        }
        serial = serial
          .catch(() => {})
          .then(() => handle(message, page))
          .catch(report);
      });
      page.html = await ctx.plugin.readText(file);
      await refresh();
    },
  });
  textus.views.registerWebview(
    "yellowkid.writing-workbench.panel",
    provider("view.html"),
  );
  textus.views.registerWebview(
    "yellowkid.writing-workbench.notes",
    provider("inspector.html"),
  );
  ctx.subscriptions.push(
    textus.editor.onDidChange(() => {
      void refresh().catch(report);
    }),
  );
  ctx.subscriptions.push(
    textus.editor.onDidChangeActive(() => {
      void refresh().catch(report);
    }),
  );
  // No timer or analysis on events: AI/plugin/history changes only invalidate coverage.
};
