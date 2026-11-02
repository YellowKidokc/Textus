import { describe, it, expect } from "vitest";
import { outlineSections, moveSection } from "./outline-edit";

describe("outline rearranging", () => {
  it("moves a heading with its nested headings, prose and code intact", () => {
    const source =
      "Preface\n\n# One\n\nFirst.\n\n## Child\n\n```md\n# Not a heading\n```\n\n# Two\n\nSecond.\n";
    const [one, child, two] = outlineSections(source);
    expect(outlineSections(source)).toHaveLength(3);
    const next = moveSection(source, two.start, one.start);
    expect(next).toBe(
      "Preface\n\n# Two\n\nSecond.\n# One\n\nFirst.\n\n## Child\n\n```md\n# Not a heading\n```\n\n",
    );
    expect(moveSection(source, one.start, child.start)).toBe(source);
  });
  it("understands setext headings and leaves nested blockquote headings out", () => {
    const sections = outlineSections(
      "Title\n=====\n\n> # Quote\n\n## Part\nText\n",
    );
    expect(sections.map((s) => s.level)).toEqual([1, 2]);
  });
  it("separates a final section without a trailing newline when moved up", () => {
    const source = "# A\n\nA.\n\n# B\n\nB.";
    const [a, b] = outlineSections(source);
    expect(
      outlineSections(moveSection(source, b.start, a.start)).map(
        (s) => s.title,
      ),
    ).toEqual(["# B", "# A"]);
  });
});
