import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginScope } from "./broker-scope";
const mocks = vi.hoisted(() => ({
  agent: vi.fn(),
  cancel: vi.fn(),
  settings: vi.fn(),
  active: vi.fn(),
  target: vi.fn(),
}));
vi.mock("../../platform/ipc", () => ({
  ai: { pluginRequest: mocks.agent, cancelAgentMessage: mocks.cancel },
}));
vi.mock("../../prefs/settings-store", () => ({ loadSettings: mocks.settings }));
vi.mock("../app-bridge", () => ({
  getActiveDocument: mocks.active,
  getDocumentAccess: mocks.target,
}));
import { aiHandlers, PLUGIN_INSTRUCTIONS, stopPluginAi } from "./broker-ai";

function scope(allowed = true): PluginScope {
  return {
    id: crypto.randomUUID(),
    need(permission: string) {
      if (!allowed) throw new Error(`Denied ${permission}`);
    },
  } as PluginScope;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.agent.mockResolvedValue({
    text: "result",
    outputLimitEnforced: false,
    usage: null,
  });
  mocks.cancel.mockResolvedValue(undefined);
  mocks.active.mockReturnValue({ path: "/notes/paper.md" });
  mocks.settings.mockReturnValue({
    aiProvider: "configured-provider",
    agentModels: { "configured-provider": "chosen-model" },
    agentWorkspaceRoot: "/notes",
  });
});
describe("permissioned plugin provider bridge", () => {
  it("sends only the fixed instructions and the prompt, with the selected provider, and returns no credentials", async () => {
    const result = await aiHandlers(scope())["ai.request"]({
      id: "client",
      prompt: "Analyze",
      version: "version-1",
    });
    expect(result).toEqual({
      text: "result",
      provider: "configured-provider",
      model: "chosen-model",
      version: "version-1",
      docPath: "/notes/paper.md",
      outputLimit: "none",
      usage: null,
    });
    // No project folder, document, history or tools reach the backend.
    expect(mocks.agent).toHaveBeenCalledWith({
      provider: "configured-provider",
      model: "chosen-model",
      instructions: PLUGIN_INSTRUCTIONS,
      prompt: "Analyze",
      maxOutputTokens: null,
      requestId: expect.stringMatching(/^plugin-/),
    });
  });
  it("previews exactly what the request sends, without a backend call", async () => {
    const h = aiHandlers(scope());
    const manifest = h["ai.prepare"]({
      prompt: "Assess",
      maxOutputTokens: 900,
    });
    expect(manifest).toEqual({
      provider: "configured-provider",
      model: "chosen-model",
      document: "/notes/paper.md",
      instructions: PLUGIN_INSTRUCTIONS,
      prompt: "Assess",
      sources: [],
      inputCharacters: PLUGIN_INSTRUCTIONS.length + "Assess".length,
      maxOutputTokens: 900,
      outputLimit: "requested",
    });
    expect(mocks.agent).not.toHaveBeenCalled();
    await h["ai.request"]({
      id: "r",
      version: "v",
      prompt: "Assess",
      maxOutputTokens: 900,
    });
    expect(mocks.agent).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: manifest.instructions,
        prompt: manifest.prompt,
        maxOutputTokens: manifest.maxOutputTokens,
      }),
    );
  });
  it("tells an enforced output cap from a requested one, and returns reported usage", async () => {
    mocks.settings.mockReturnValue({
      aiProvider: "anthropic",
      agentModels: {},
      agentWorkspaceRoot: "",
    });
    const h = aiHandlers(scope());
    expect(
      h["ai.prepare"]({ prompt: "x", maxOutputTokens: 500 }).outputLimit,
    ).toBe("enforced");
    const usage = {
      inputTokens: 40,
      outputTokens: 12,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
    mocks.agent.mockResolvedValue({
      text: "ok",
      outputLimitEnforced: true,
      usage,
    });
    const reply = await h["ai.request"]({
      id: "e",
      version: "v",
      prompt: "x",
      maxOutputTokens: 500,
    });
    expect(reply).toMatchObject({ outputLimit: "enforced", usage });
    expect(() => h["ai.prepare"]({ prompt: "x", maxOutputTokens: 0 })).toThrow(
      /maxOutputTokens/,
    );
  });
  it("refuses missing permission before invoking the backend", async () => {
    await expect(
      aiHandlers(scope(false))["ai.request"]({
        id: "x",
        prompt: "Analyze",
        version: "v",
      }),
    ).rejects.toThrow(/Denied/);
    expect(mocks.agent).not.toHaveBeenCalled();
  });
  it("bounds prompt size and requires a saved document", async () => {
    await expect(
      aiHandlers(scope())["ai.request"]({
        id: "x",
        prompt: "x".repeat(80001),
        version: "v",
      }),
    ).rejects.toThrow(/size/);
    mocks.active.mockReturnValue(null);
    await expect(
      aiHandlers(scope())["ai.request"]({ id: "x", prompt: "x", version: "v" }),
    ).rejects.toThrow(/saved/);
  });
  it("limits requests and forwards provider failures without changing documents", async () => {
    const h = aiHandlers(scope());
    for (let i = 0; i < 6; i++)
      await h["ai.request"]({ id: String(i), prompt: "x", version: "v" });
    await expect(
      h["ai.request"]({ id: "7", prompt: "x", version: "v" }),
    ).rejects.toThrow(/six/);
    mocks.agent.mockRejectedValue(new Error("Provider unavailable"));
    await expect(
      aiHandlers(scope())["ai.request"]({ id: "x", prompt: "x", version: "v" }),
    ).rejects.toThrow(/unavailable/);
  });
  it("cancels only the owning plugin request and refuses concurrent calls", async () => {
    mocks.agent.mockReturnValue(new Promise(() => {}));
    const p = scope();
    const h = aiHandlers(p);
    const request = h["ai.request"]({ id: "x", prompt: "x", version: "v" });
    await expect(
      h["ai.request"]({ id: "y", prompt: "x", version: "v" }),
    ).rejects.toThrow(/already/);
    aiHandlers(scope())["ai.cancel"]({ id: "x" });
    expect(mocks.cancel).not.toHaveBeenCalled();
    h["ai.cancel"]({ id: "x" });
    await expect(request).rejects.toThrow(/cancelled/);
    expect(mocks.cancel).toHaveBeenCalledWith(
      expect.stringMatching(/^plugin-/),
    );
  });
  it("cancels an in-flight request when its plugin stops", async () => {
    mocks.agent.mockReturnValue(new Promise(() => {}));
    const p = scope();
    const request = aiHandlers(p)["ai.request"]({
      id: "x",
      prompt: "x",
      version: "v",
    });
    stopPluginAi(p.id);
    await expect(request).rejects.toThrow(/cancelled/);
  });
});

it("reads cost-preview provider metadata without a backend call", () => {
  expect(aiHandlers(scope())["ai.info"]()).toEqual({
    provider: "configured-provider",
    model: "chosen-model",
  });
  expect(mocks.agent).not.toHaveBeenCalled();
});
it("pins requests to an explicit working document and rejects provider drift", async () => {
  mocks.target.mockReturnValue({ path: "/notes/revision.md" });
  const handlers = aiHandlers(scope());
  await expect(
    handlers["ai.request"]({
      id: "p",
      document: "/notes/revision.md",
      version: "v",
      prompt: "Assess",
      expectedProvider: "old",
      expectedModel: null,
    }),
  ).rejects.toThrow(/changed/);
  expect(mocks.agent).not.toHaveBeenCalled();
  const result = await handlers["ai.request"]({
    id: "p",
    document: "/notes/revision.md",
    version: "v",
    prompt: "Assess",
  });
  expect(result.docPath).toBe("/notes/revision.md");
});
