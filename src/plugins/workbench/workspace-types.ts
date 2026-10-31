import type {} from "../../../docs/dev/textus";
import type { Paper } from "./model";
export interface Comparison {
  id: string;
  name: string;
  sourcePath: string;
  originalText: string;
  originalVersion: string;
  revisionPath: string;
  ratio: number;
  linked: boolean;
  differences: boolean;
  originalTarget?: string;
}
export interface WorkspaceHost {
  state(): { path: string | null; paper: Paper | null; text: string };
  save(
    paper: Paper,
    action: string,
    target: string,
    version?: string,
  ): Promise<void>;
  refresh(): Promise<void>;
  publish(): void;
  transaction(fn: () => Promise<void>): Promise<void>;
}
