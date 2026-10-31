export interface BlockSpan {
  id: string;
  start: number;
  bodyStart: number;
  end: number;
  text: string;
}
const ID = "[a-f0-9-]{36}";
const MARKER = new RegExp(`^<!-- textus-argument:(${ID}) -->\\s*$`);

/** Markers inside code fences are prose, never structural boundaries. */
export function blockSpans(text: string): BlockSpan[] {
  const found: { id: string; start: number; bodyStart: number }[] = [];
  let offset = 0;
  let fence: { char: string; length: number } | null = null;
  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const code = /^ {0,3}(`{3,}|~{3,})(.*)/.exec(line);
    if (code) {
      if (!fence) fence = { char: code[1][0], length: code[1].length };
      else if (
        code[1][0] === fence.char &&
        code[1].length >= fence.length &&
        !code[2].trim()
      )
        fence = null;
    } else if (!fence) {
      const match = MARKER.exec(line.trimEnd());
      if (match)
        found.push({
          id: match[1],
          start: offset,
          bodyStart: offset + line.length,
        });
    }
    offset += line.length;
  }
  if (new Set(found.map((b) => b.id)).size !== found.length)
    throw new Error(
      "Duplicate argument identities. Restore distinct markers before editing the plan.",
    );
  return found.map((b, i) => ({
    ...b,
    end: found[i + 1]?.start ?? text.length,
    text: text.slice(b.bodyStart, found[i + 1]?.start ?? text.length),
  }));
}

export function marker(id: string): string {
  return `<!-- textus-argument:${id} -->\n\n`;
}

export function moveBlock(text: string, id: string, delta: number): string {
  const blocks = blockSpans(text);
  const at = blocks.findIndex((b) => b.id === id);
  const next = at + delta;
  if (at < 0 || next < 0 || next >= blocks.length) return text;
  const pieces = blocks.map((b) => text.slice(b.start, b.end));
  [pieces[at], pieces[next]] = [pieces[next], pieces[at]];
  return (
    text.slice(0, blocks[0].start) +
    pieces.map((p) => (p.endsWith("\n\n") ? p : p + "\n\n")).join("")
  );
}
