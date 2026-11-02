import { fromMarkdown } from "mdast-util-from-markdown";
import type { RootContent } from "mdast";

export interface ScoreCriterion {
  name: string;
  instruction: string;
}
/** Keep in step with ai/client/scoring.rs. Null means insufficient evidence. */
export interface ParagraphScore {
  name: string;
  score: number | null;
  reason: string;
}

export function paragraphs(source: string): { start: number; text: string }[] {
  const found: { start: number; text: string }[] = [];
  const visit = (node: RootContent) => {
    if (node.type === "paragraph" && node.position) {
      const start = node.position.start.offset!;
      found.push({
        start,
        text: source.slice(start, node.position.end.offset!),
      });
    } else if ("children" in node) {
      for (const child of node.children) visit(child as RootContent);
    }
  };
  fromMarkdown(source).children.forEach(visit);
  return found;
}

export function validCriteria(value: unknown): ScoreCriterion[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (v): v is ScoreCriterion =>
        v !== null &&
        typeof v === "object" &&
        typeof v.name === "string" &&
        v.name.trim().length > 0 &&
        v.name.length <= 80 &&
        typeof v.instruction === "string" &&
        v.instruction.trim().length > 0 &&
        v.instruction.length <= 2000,
    )
    .slice(0, 20);
}
