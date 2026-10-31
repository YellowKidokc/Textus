import { describe, expect, it } from "vitest";
import {
  buildRubric,
  extractCandidates,
  parseRubric,
  validateAssessment,
  estimateReview,
} from "./rubrics";
import {
  paragraphAnchor,
  resolveParagraph,
  validatePassageNotes,
} from "./passage-notes";
import { newPaper } from "./model";
import { marker } from "./markdown";

describe("portable rubric rules", () => {
  const rubric = () =>
    buildRubric(
      "Quality",
      "grading",
      ["Clarity"],
      "C:\\sources\\private.md",
      1,
      5,
    );
  it("extracts candidates as editable data and excludes fenced code", () => {
    expect(
      extractCandidates(
        "# Heading\n- [ ] Clarity\n```\n- Code\n```\nPlain prose",
      ),
    ).toEqual(["Heading", "Clarity"]);
    expect(rubric().source?.filename).toBe("private.md");
  });
  it("rejects credentials, executable fields and invalid scales", () => {
    expect(() =>
      parseRubric(JSON.stringify({ ...rubric(), apiKey: "secret" })),
    ).toThrow();
    expect(() =>
      parseRubric(
        JSON.stringify({ ...rubric(), instructions: "javascript:evil()" }),
      ),
    ).toThrow();
    expect(() =>
      buildRubric("Bad", "grading", ["Clarity"], "x.md", 5, 1),
    ).toThrow();
  });
  it("requires exact evidence and scoring rules, permits explicit insufficient evidence", () => {
    const result = {
      criterion: "criterion-1",
      score: 4,
      quote: "Concrete example",
      explanation: "Clear",
      uncertainty: "Sample",
    };
    expect(
      validateAssessment({ results: [result] }, rubric(), "Concrete example."),
    ).toHaveLength(1);
    expect(() =>
      validateAssessment(
        { results: [{ ...result, quote: "Invented" }] },
        rubric(),
        "Concrete example.",
      ),
    ).toThrow();
    expect(() =>
      validateAssessment(
        { results: [{ ...result, score: 6 }] },
        rubric(),
        "Concrete example.",
      ),
    ).toThrow();
    expect(
      validateAssessment(
        { results: [{ ...result, quote: "", score: null }] },
        rubric(),
        "Concrete example.",
      )[0].score,
    ).toBeNull();
  });
  it("reports unknown price and calculates user-supplied rates without requests", () => {
    expect(estimateReview("abc", 100, null, null).usd).toBeNull();
    expect(estimateReview("abc", 100, 1, 2).usd).toBeCloseTo(0.000201);
  });
});

describe("paragraph ownership", () => {
  const paper = {
    ...newPaper(),
    blocks: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        purpose: "claim",
        intentions: [],
        dependsOn: [],
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        purpose: "objection",
        intentions: [],
        dependsOn: [],
      },
    ],
  };
  const blocks = [
    {
      id: "m1",
      kind: "html",
      markdown: marker("11111111-1111-4111-8111-111111111111"),
    },
    { id: "p1", kind: "paragraph", markdown: "A claim." },
    {
      id: "m2",
      kind: "html",
      markdown: marker("22222222-2222-4222-8222-222222222222"),
    },
    { id: "p2", kind: "paragraph", markdown: "An objection." },
  ] as Textus.Block[];
  it("uses persistent argument ownership and includes neighbors across boundaries", () => {
    const anchor = paragraphAnchor(blocks, paper, "p1")!;
    expect(anchor.after).toBe("An objection.");
    expect(
      resolveParagraph(anchor, [...blocks.slice(2), ...blocks.slice(0, 2)])
        .status,
    ).toBe("current");
    expect(
      resolveParagraph(
        anchor,
        blocks.map((b) => (b.id === "p1" ? { ...b, markdown: "Edited." } : b)),
      ).status,
    ).toBe("stale");
    expect(
      resolveParagraph(anchor, [
        ...blocks.slice(0, 2),
        { id: "duplicate", kind: "paragraph", markdown: "A claim." },
        ...blocks.slice(2),
      ]).status,
    ).toBe("unresolved");
  });
  it("rejects manufactured note quotations and starts valid notes provisional", () => {
    const anchor = paragraphAnchor(blocks, paper, "p1")!;
    const note = {
      category: "USED",
      quote: "A claim",
      explanation: "Claim introduced",
      uncertainty: "Needs evidence",
    };
    expect(validatePassageNotes({ notes: [note] }, anchor)[0].decision).toBe(
      "provisional",
    );
    expect(() =>
      validatePassageNotes(
        { notes: [{ ...note, quote: "Another passage" }] },
        anchor,
      ),
    ).toThrow();
  });
});
