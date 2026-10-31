import type { Paper } from "./model";

export function readPaper(raw: unknown): Paper {
  // Validate nested arrays before drawing or mutating a stored record. Refuse
  // incompatible records instead of silently replacing author decisions.
  const p = raw as Paper;
  if (
    !p ||
    p.schema !== "textus-writing/1" ||
    typeof p.id !== "string" ||
    typeof p.intent !== "string" ||
    !Array.isArray(p.blocks) ||
    !Array.isArray(p.analyses) ||
    !Array.isArray(p.proposals) ||
    !Array.isArray(p.history)
  )
    throw new Error("Unsupported writing record.");
  for (const b of p.blocks)
    if (
      !b ||
      typeof b.id !== "string" ||
      typeof b.purpose !== "string" ||
      !Array.isArray(b.intentions) ||
      !Array.isArray(b.dependsOn) ||
      b.intentions.some(
        (i) =>
          !i ||
          typeof i.id !== "string" ||
          typeof i.component !== "string" ||
          ![
            "planned",
            "confirmed",
            "deferred",
            "dismissed",
            "unnecessary",
          ].includes(i.decision),
      )
    )
      throw new Error("Invalid argument record.");
  if (
    p.analyses.some(
      (a) =>
        !a?.snapshot ||
        typeof a.snapshot.text !== "string" ||
        typeof a.snapshot.plan !== "string" ||
        !Array.isArray(a.findings),
    ) ||
    p.proposals.some(
      (r) =>
        !r?.snapshot ||
        typeof r.original !== "string" ||
        typeof r.proposed !== "string",
    )
  )
    throw new Error("Invalid writing history.");
  return p;
}
