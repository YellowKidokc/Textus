// Writing methods and series checklists, as plain Markdown you can keep in
// your notes - and the same as JSON, for Textus or anything else.
//
// A methods file: one "## " heading a method, then optional "key: value"
// lines, then the instructions.
//
//   ## Cut the words
//   level: line
//   check: Every sentence earns its length; no throat-clearing.
//   Rewrite the passage at two thirds of its length, keeping every claim.
//
// level is "line" (checked as you write, sentence by sentence) or "shape"
// (a title, hook, opening or closing - run on demand, a few options back).
//
// A series file (_series.md in a folder) picks methods for every note
// under that folder, and can hold an outline:
//
//   methods: cut-the-words, animate-the-background
//
//   # Outline
//   - Human anchor
//   - Principle revealed

export const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const FIELD = /^(level|check|applies|id):\s*(.*)$/i;

/** Methods Markdown -> [{ id, name, level, check, prompt }]. */
export function parseMethods(md) {
  const out = [];
  let cur = null;
  let body = [];
  const close = () => {
    if (!cur) return;
    cur.prompt = body.join("\n").trim();
    out.push(cur);
  };
  for (const line of md.split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      close();
      cur = {
        id: slug(h[1]),
        name: h[1],
        level: "line",
        check: "",
        prompt: "",
      };
      body = [];
      continue;
    }
    if (!cur) continue;
    const f = FIELD.exec(line);
    if (f && body.every((b) => b.trim() === "")) {
      const key = f[1].toLowerCase();
      const value = f[2].trim();
      if (key === "level")
        cur.level = /shape|para/i.test(value) ? "shape" : "line";
      else if (key === "id") cur.id = slug(value);
      else cur[key] = value;
      continue;
    }
    body.push(line);
  }
  close();
  return out;
}

/** Methods -> Markdown, the inverse of parseMethods. */
export function methodsToMarkdown(methods) {
  return methods
    .map((m) => {
      const lines = [`## ${m.name}`];
      if (m.id && m.id !== slug(m.name)) lines.push(`id: ${m.id}`);
      lines.push(`level: ${m.level || "line"}`);
      if (m.check) lines.push(`check: ${m.check}`);
      if (m.prompt) lines.push("", m.prompt);
      return lines.join("\n");
    })
    .join("\n\n")
    .concat("\n");
}

/** A series file -> { methods: [ids], outline: [lines] }. */
export function parseSeries(md) {
  const ids = /^methods:\s*(.+)$/im.exec(md);
  const outline = /^#\s+Outline\s*$([\s\S]*?)(?=^#\s|(?![\s\S]))/im.exec(md);
  return {
    methods: ids
      ? ids[1]
          .split(/[,;]/)
          .map((s) => slug(s))
          .filter(Boolean)
      : [],
    outline: outline
      ? outline[1]
          .split(/\r?\n/)
          .map((l) => l.replace(/\s+$/, ""))
          .filter((l) => l.trim())
      : [],
  };
}
