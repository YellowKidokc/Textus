import { describe, expect, it } from "vitest";
import { newPaper, snapshot, isCurrent, record } from "./model";
import { marker, blockSpans, moveBlock } from "./markdown";
import { validateFindings, analysisPrompt } from "./analysis";
import {
  exportTemplate,
  parseTemplate,
  instantiateTemplate,
  dependencyProblems,
} from "./templates";
import { mapEditorBlocks } from "./mapping";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
function fixture() {
  const paper = newPaper();
  paper.intent = "Private intent";
  paper.blocks = [A, B].map((id) => ({
    id,
    purpose: "Establish the point",
    dependsOn: [],
    intentions: ["job:claim", "job:evidence", "story:S04"].map((component) => ({
      id: crypto.randomUUID(),
      component,
      decision: "planned" as const,
    })),
  }));
  const text =
    marker(A) +
    "Imagine a bridge.\n\n" +
    marker(B) +
    "The conclusion is limited.\n\n";
  return { paper, text, source: snapshot(paper, text) };
}
function finding(component = "story:S04") {
  return {
    block: A,
    component,
    quote: "Imagine a bridge.",
    start: 1,
    end: 18,
    explanation: "Invites an explicitly imagined case.",
    uncertainty: "This illustrates, not verifies.",
    storyKind: "hypothetical",
    sources: [],
  };
}

describe("persistent argument identity", () => {
  it("moves multiple paragraphs without changing identities, history or unrelated preamble", () => {
    const { paper, text } = fixture();
    const withHistory = record(paper, "confirmed", A, "v1");
    const moved = moveBlock("Preamble\n\n" + text, A, 1);
    expect(blockSpans(moved).map((b) => b.id)).toEqual([B, A]);
    expect(moved.startsWith("Preamble\n\n")).toBe(true);
    expect(blockSpans(moved).find((b) => b.id === A)?.text).toBe(
      blockSpans(text)[0].text,
    );
    expect(withHistory.history[0].target).toBe(A);
  });
  it("keeps splitting, joining and editing inside a block attached to its marker", () => {
    const { text } = fixture();
    for (const prose of [
      "One sentence. Another.",
      "One sentence.\n\nAnother.",
      "One edited sentence.",
    ]) {
      const edited = text.replace("Imagine a bridge.", prose);
      expect(blockSpans(edited).map((b) => b.id)).toEqual([A, B]);
    }
  });
  it("refuses duplicate markers rather than guessing which history belongs where", () => {
    expect(() => blockSpans(marker(A) + "A\n\n" + marker(A))).toThrow(
      /Duplicate/,
    );
  });
  it("ignores markers inside fenced examples", () => {
    expect(blockSpans("```html\n" + marker(A) + "```\n")).toEqual([]);
  });
  it("maps native blocks in order, including repeated prose, without using position as identity", () => {
    const blocks: Textus.Block[] = [
      { id: "m1", kind: "html", markdown: marker(A).trim() },
      { id: "p1", kind: "paragraph", markdown: "Repeated." },
      { id: "p2", kind: "paragraph", markdown: "Repeated." },
      { id: "m2", kind: "html", markdown: marker(B).trim() },
      { id: "p3", kind: "paragraph", markdown: "Repeated." },
    ];
    expect(mapEditorBlocks(blocks, A).map((b) => b.id)).toEqual(["p1", "p2"]);
    expect(mapEditorBlocks(blocks, B).map((b) => b.id)).toEqual(["p3"]);
    expect(
      mapEditorBlocks(
        blocks.filter((b) => b.id !== "m1"),
        A,
      ),
    ).toEqual([]);
    expect(mapEditorBlocks([...blocks, blocks[0]], A)).toEqual([]);
  });
});

describe("provisional coverage and author decisions", () => {
  it("requires exact evidence at the examined offsets", () => {
    const { paper, source } = fixture();
    const valid = validateFindings({ findings: [finding()] }, paper, source);
    expect(valid[0].quote).toBe(
      source.text.slice(
        blockSpans(source.text)[0].bodyStart + 1,
        blockSpans(source.text)[0].bodyStart + 18,
      ),
    );
    expect(() =>
      validateFindings(
        { findings: [{ ...finding(), quote: "Invented bridge" }] },
        paper,
        source,
      ),
    ).toThrow(/evidence/);
    expect(() =>
      validateFindings(
        { findings: [{ ...finding(), start: 0 }] },
        paper,
        source,
      ),
    ).toThrow(/evidence/);
  });
  it("rejects hypothetical stories as evidence even when a source is claimed", () => {
    const { paper, source } = fixture();
    expect(() =>
      validateFindings(
        { findings: [{ ...finding("job:evidence"), sources: ["A citation"] }] },
        paper,
        source,
      ),
    ).toThrow(/hypothetical/);
  });
  it("does not turn mere keyword presence into an automatic finding", () => {
    const { paper, source } = fixture();
    expect(validateFindings({ findings: [] }, paper, source)).toEqual([]);
    expect(analysisPrompt(paper, source)).toContain(
      "A keyword alone does not fulfill a function",
    );
    expect(
      paper.blocks[0].intentions.every((i) => i.decision === "planned"),
    ).toBe(true);
  });
  it("requires an explanation and a selected obligation rather than inventing mandatory work", () => {
    const { paper, source } = fixture();
    expect(() =>
      validateFindings(
        { findings: [{ ...finding(), explanation: "" }] },
        paper,
        source,
      ),
    ).toThrow();
    expect(() =>
      validateFindings(
        { findings: [{ ...finding(), component: "kait-written:K33" }] },
        paper,
        source,
      ),
    ).toThrow();
  });
  it("keeps text changes and newer author decisions from being silently covered by old results", () => {
    const { paper, source, text } = fixture();
    expect(isCurrent(source, paper, text)).toBe(true);
    expect(isCurrent(source, paper, text + "changed")).toBe(false);
    const edited = structuredClone(paper);
    edited.blocks[0].purpose = "New intent";
    expect(isCurrent(source, edited, text)).toBe(false);
    expect(source.plan).not.toBe(snapshot(edited, text).plan);
  });
  it("keeps mixed components and a dismissal independent in different blocks", () => {
    const { paper } = fixture();
    const changed = structuredClone(paper);
    changed.blocks[0].intentions[2].decision = "dismissed" as any;
    expect(changed.blocks[0].intentions[0].decision).toBe("planned");
    expect(changed.blocks[1].intentions[2].decision).toBe("planned");
    expect(
      JSON.parse(JSON.stringify(changed)).blocks[0].intentions[2].decision,
    ).toBe("dismissed");
  });
});

describe("portable templates", () => {
  it("round trips structure, references and dependencies into new identities", () => {
    const { paper } = fixture();
    paper.blocks[1].dependsOn = [A];
    const template = parseTemplate(
      JSON.stringify(exportTemplate(paper, [A, B])),
    );
    const one = instantiateTemplate(template);
    const two = instantiateTemplate(template);
    expect(one.paper.id).not.toBe(two.paper.id);
    expect(one.paper.blocks[0].id).not.toBe(A);
    expect(one.paper.blocks[1].dependsOn).toEqual([one.paper.blocks[0].id]);
    expect(one.paper.blocks[0].intentions.map((i) => i.component)).toEqual(
      paper.blocks[0].intentions.map((i) => i.component),
    );
    expect(blockSpans(one.text).map((b) => b.id)).toEqual(
      one.paper.blocks.map((b) => b.id),
    );
  });
  it("excludes bodies, research, credentials and personal decisions by construction", () => {
    const { paper, text, source } = fixture();
    const decorated = {
      ...paper,
      apiKey: "PRIVATE_CREDENTIAL",
      research: "PRIVATE_RESEARCH",
      body: text,
    };
    decorated.analyses.push({
      id: "a",
      snapshot: source,
      provider: "private",
      model: "private",
      promptVersion: "1",
      findings: [],
    });
    const out = JSON.stringify(exportTemplate(decorated, [A, B]));
    for (const secret of [
      "PRIVATE_CREDENTIAL",
      "PRIVATE_RESEARCH",
      "Imagine a bridge",
      "Private intent",
      '"analyses"',
      '"history"',
      '"provider"',
    ])
      expect(out).not.toContain(secret);
  });
  it("rejects conflicting component versions and duplicate identities without overwriting definitions", () => {
    const { paper } = fixture();
    const t = exportTemplate(paper, [A, B]);
    t.components[0].version = 100;
    expect(() => parseTemplate(JSON.stringify(t))).toThrow(/conflicting/);
    const duplicate = exportTemplate(paper, [A, B]);
    duplicate.blocks[1].id = duplicate.blocks[0].id;
    expect(() => parseTemplate(JSON.stringify(duplicate))).toThrow(/Invalid/);
  });
  it("rejects unsupported schemas, unsafe ids and broken dependency graphs", () => {
    const { paper } = fixture();
    const t = exportTemplate(paper, [A, B]);
    expect(() => parseTemplate(JSON.stringify({ ...t, version: 2 }))).toThrow(
      /Unsupported/,
    );
    t.blocks[0].id = "../../file";
    expect(() => parseTemplate(JSON.stringify(t))).toThrow(/Invalid/);
    expect(
      dependencyProblems([
        { id: "a", dependsOn: ["b"] },
        { id: "b", dependsOn: ["a", "missing"] },
      ]).join(" "),
    ).toMatch(/Cycle/);
  });
  it("discards unrecognized fields and never executes imported code", () => {
    const { paper } = fixture();
    const t = {
      ...exportTemplate(paper, [A, B]),
      script: "throw new Error()",
      apiKey: "private",
    };
    expect(parseTemplate(JSON.stringify(t))).not.toHaveProperty("script");
    expect(parseTemplate(JSON.stringify(t))).not.toHaveProperty("apiKey");
  });
});
