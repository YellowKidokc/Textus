import { expect, it } from "vitest";
import { paragraphs, validCriteria } from "./paragraph-scores";

it("scores prose including list and quote paragraphs, excluding code and headings", () => {
  const source =
    "# Title\n\nOne\ncontinued.\n\n- List prose\n\n> Quoted prose\n\n```\nNot prose\n```";
  expect(paragraphs(source).map((p) => p.text)).toEqual([
    "One\ncontinued.",
    "List prose",
    "Quoted prose",
  ]);
});
it("bounds saved criteria and rejects invalid configuration", () => {
  expect(validCriteria(null)).toEqual([]);
  expect(
    validCriteria([
      { name: "", instruction: "x" },
      { name: "Evidence", instruction: "Check supporting evidence" },
    ]),
  ).toHaveLength(1);
  expect(
    validCriteria(
      Array.from({ length: 30 }, () => ({ name: "x", instruction: "y" })),
    ),
  ).toHaveLength(20);
});
