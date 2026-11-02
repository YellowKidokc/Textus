import { fromMarkdown } from "mdast-util-from-markdown";

export interface OutlineSection {
  start: number;
  end: number;
  level: number;
  title: string;
}

/** Source spans preserve all Markdown, including whitespace and fenced code. */
export function outlineSections(source: string): OutlineSection[] {
  const metadata =
    /^(?:\uFEFF)?---[^\S\r\n]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[^\S\r\n]*(?:\r?\n|$)/.exec(
      source,
    );
  const parsed = metadata
    ? metadata[0].replace(/[^\r\n]/g, " ") + source.slice(metadata[0].length)
    : source;
  const headings = fromMarkdown(parsed).children.filter(
    (n) => n.type === "heading",
  );
  return headings.map((heading, index) => {
    const start = heading.position!.start.offset!;
    const next = headings
      .slice(index + 1)
      .find((h) => h.depth <= heading.depth);
    return {
      start,
      end: next?.position?.start.offset ?? source.length,
      level: heading.depth,
      title: source.slice(start, heading.position!.end.offset!).trim(),
    };
  });
}

/** Insert before another section, or at the end. Refuse moves into descendants. */
export function moveSection(
  source: string,
  start: number,
  before: number,
): string {
  const section = outlineSections(source).find((s) => s.start === start);
  if (
    !section ||
    before < 0 ||
    before > source.length ||
    (before >= section.start && before <= section.end)
  )
    return source;
  const chunk = source.slice(section.start, section.end);
  const rest = source.slice(0, section.start) + source.slice(section.end);
  const at =
    before > section.end ? before - (section.end - section.start) : before;
  // A final section may have no newline; separating it avoids merging headings.
  const moved = chunk + (chunk.endsWith("\n") ? "" : "\n\n");
  const prefix = rest.slice(0, at);
  const separator = prefix && !prefix.endsWith("\n") ? "\n\n" : "";
  return prefix + separator + moved + rest.slice(at);
}
