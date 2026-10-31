import { ai } from "../../platform/ipc";
import { loadSettings } from "../../prefs/settings-store";
import { getActiveDocument, getDocumentAccess } from "../app-bridge";
import { str, type Params, type PluginScope } from "./broker-scope";

const active = new Map<
  string,
  { id: string; backend: string; cancel: () => void }
>();
const starts = new Map<string, number[]>();

export function stopPluginAi(plugin: string): void {
  active.get(plugin)?.cancel();
}

/** The broker owns credentials, provider choice, request limits and cancellation. */
export function aiHandlers(p: PluginScope) {
  return {
    "ai.info": () => {
      p.need("ai.request");
      const settings = loadSettings();
      return {
        provider: settings.aiProvider,
        model: settings.agentModels[settings.aiProvider] || null,
      };
    },
    "ai.request": async ({
      id,
      prompt,
      version,
      expectedProvider,
      expectedModel,
      document: target,
    }: Params) => {
      p.need("ai.request");
      p.need("editor.read");
      const requestId = str(id, "id");
      const message = str(prompt, "prompt");
      const sourceVersion = str(version, "version");
      if (
        requestId.length > 100 ||
        sourceVersion.length > 100 ||
        !message.trim() ||
        message.length > 80_000
      )
        throw new Error("Invalid AI request size.");
      if (active.has(p.id))
        throw new Error("An AI request is already running.");
      const recent = (starts.get(p.id) ?? []).filter(
        (at) => Date.now() - at < 60_000,
      );
      if (recent.length >= 6)
        throw new Error("At most six plugin AI requests per minute.");
      if (target !== undefined) p.need("editor.targets");
      const document =
        typeof target === "string"
          ? getDocumentAccess(target)
          : getActiveDocument();
      if (!document?.path) throw new Error("Open a saved document first.");
      const docPath = document.path;
      const settings = loadSettings();
      const provider = settings.aiProvider;
      const model = settings.agentModels[provider] || null;
      if (
        expectedProvider !== undefined &&
        (expectedProvider !== provider || expectedModel !== model)
      )
        throw new Error("Provider or model changed since the cost preview.");
      const backend = `plugin-${crypto.randomUUID()}`;
      let rejectCancel: (e: Error) => void = () => {};
      const cancelled = new Promise<never>((_, reject) => {
        rejectCancel = reject;
      });
      const cancel = () => {
        void ai.cancelAgentMessage(backend).catch(() => {});
        rejectCancel(new Error("AI request cancelled."));
      };
      active.set(p.id, { id: requestId, backend, cancel });
      starts.set(p.id, [...recent, Date.now()]);
      const timer = setTimeout(cancel, 120_000);
      try {
        const turns = await Promise.race([
          cancelled,
          ai.agentMessage({
            provider,
            model,
            docPath,
            workspaceRoot: settings.agentWorkspaceRoot || null,
            blocks: [],
            history: [],
            message,
            images: [],
            webSearch: false,
            mode: "review",
            textOnly: true,
            requestId: backend,
          }),
        ]);
        const text = turns
          .filter((t) => t.kind === "Assistant")
          .map((t) => t.text)
          .join("\n");
        if (!text.trim()) throw new Error("The model returned no text.");
        return { text, provider, model, version: sourceVersion, docPath };
      } finally {
        clearTimeout(timer);
        if (active.get(p.id)?.backend === backend) active.delete(p.id);
      }
    },
    "ai.cancel": ({ id }: Params) => {
      p.need("ai.request");
      if (active.get(p.id)?.id === str(id, "id")) active.get(p.id)?.cancel();
    },
  };
}
