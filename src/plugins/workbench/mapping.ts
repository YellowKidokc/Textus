import type {} from "../../../docs/dev/textus";
import { blockSpans } from "./markdown";

/** Markers bound groups by order, never by matching repeated prose. */
export function mapEditorBlocks(
  blocks: Textus.Block[],
  argument: string,
): Textus.Block[] {
  const result: Textus.Block[] = [];
  let active = false;
  let seen = false;
  for (const b of blocks) {
    const markers = b.kind === "html" ? blockSpans(b.markdown + "\n") : [];
    if (markers.length) {
      if (markers[0].id === argument) {
        if (seen) return [];
        seen = true;
        active = true;
      } else active = false;
    } else if (active) result.push(b);
  }
  return result;
}
