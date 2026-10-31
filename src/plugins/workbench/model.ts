import type { RubricAssessment } from "./rubrics";
import type { PassageRun, PassageProposal } from "./passage-notes";
export type Family = "job" | "technique" | "presentation";
export interface Component {
  id: string;
  version: number;
  family: Family;
  name: string;
  purpose: string;
  contexts: string[];
  limitations: string;
  provenance: string;
}
export type Decision =
  "planned" | "confirmed" | "deferred" | "dismissed" | "unnecessary";
export interface Intention {
  id: string;
  component: string;
  decision: Decision;
  /** A confirmation applies to this text only. */
  text?: string;
}
export interface ArgumentBlock {
  id: string;
  purpose: string;
  intentions: Intention[];
  dependsOn: string[];
}
export interface Finding {
  id: string;
  block: string;
  component: string;
  quote: string;
  start: number;
  end: number;
  explanation: string;
  uncertainty: string;
}
export interface Snapshot {
  id: string;
  text: string;
  plan: string;
}
export interface Analysis {
  id: string;
  snapshot: Snapshot;
  provider: string;
  model: string | null;
  promptVersion: string;
  findings: Finding[];
}
export interface Proposal {
  id: string;
  snapshot: Snapshot;
  block: string;
  original: string;
  proposed: string;
  reason: string;
  action: string;
  provider: string;
  model: string | null;
  promptVersion: string;
  decision: "pending" | "accepted" | "rejected";
}
export interface HistoryEntry {
  id: string;
  at: string;
  action: string;
  target: string;
  version: string;
}
export interface Paper {
  template?: { id: string; revision: number };
  assessments?: RubricAssessment[];
  comparison?: string;
  passageRuns?: PassageRun[];
  passageProposals?: PassageProposal[];
  schema: "textus-writing/1";
  id: string;
  intent: string;
  blocks: ArgumentBlock[];
  analyses: Analysis[];
  proposals: Proposal[];
  history: HistoryEntry[];
}

export function newPaper(): Paper {
  return {
    schema: "textus-writing/1",
    id: crypto.randomUUID(),
    intent: "",
    blocks: [],
    analyses: [],
    proposals: [],
    history: [],
  };
}

export function record(
  paper: Paper,
  action: string,
  target: string,
  version: string,
): Paper {
  return {
    ...paper,
    history: [
      ...paper.history,
      {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        action,
        target,
        version,
      },
    ],
  };
}

export function planVersion(paper: Paper): string {
  return JSON.stringify([
    paper.intent,
    paper.blocks.map((b) => ({
      id: b.id,
      purpose: b.purpose,
      dependsOn: b.dependsOn,
      intentions: b.intentions.map(({ id, component }) => ({ id, component })),
    })),
  ]);
}

export function snapshot(paper: Paper, text: string): Snapshot {
  return { id: crypto.randomUUID(), text, plan: planVersion(paper) };
}

export function isCurrent(
  source: Snapshot,
  paper: Paper,
  text: string,
): boolean {
  return source.text === text && source.plan === planVersion(paper);
}
