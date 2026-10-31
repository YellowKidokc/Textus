import { COMPONENTS } from "./registry";
import { newPaper, type ArgumentBlock, type Paper } from "./model";
import { marker } from "./markdown";

export interface Template {
  format: "textus-writing-template";
  version: 1;
  id: string;
  revision: number;
  components: { id: string; version: number }[];
  blocks: {
    id: string;
    purpose: string;
    components: string[];
    dependsOn: string[];
  }[];
}

export function dependencyProblems(
  blocks: Pick<ArgumentBlock, "id" | "dependsOn">[],
): string[] {
  const problems: string[] = [];
  const path = new Set<string>();
  const done = new Set<string>();
  function visit(id: string) {
    if (path.has(id)) {
      problems.push(`Cycle: ${id}`);
      return;
    }
    if (done.has(id)) return;
    path.add(id);
    const block = blocks.find((b) => b.id === id);
    for (const dep of block?.dependsOn ?? []) {
      const before = blocks.findIndex((b) => b.id === dep);
      if (before < 0) problems.push(`Missing dependency: ${dep}`);
      else {
        if (before >= blocks.findIndex((b) => b.id === id))
          problems.push(`Dependency follows block: ${dep}`);
        visit(dep);
      }
    }
    path.delete(id);
    done.add(id);
  }
  blocks.forEach((b) => visit(b.id));
  return problems;
}

/** A whitelist, never a serialization of the paper or its history. */
export function exportTemplate(paper: Paper, orderedIds: string[]): Template {
  const blocks = orderedIds
    .map((id) => paper.blocks.find((b) => b.id === id))
    .filter((b): b is ArgumentBlock => !!b);
  const aliases = new Map(blocks.map((b, i) => [b.id, `block-${i + 1}`]));
  const used = new Set(
    blocks.flatMap((b) => b.intentions.map((i) => i.component)),
  );
  return {
    format: "textus-writing-template",
    version: 1,
    id: crypto.randomUUID(),
    revision: 1,
    components: COMPONENTS.filter((c) => used.has(c.id)).map(
      ({ id, version }) => ({ id, version }),
    ),
    blocks: blocks.map((b) => ({
      id: aliases.get(b.id)!,
      purpose: b.purpose,
      components: b.intentions.map((i) => i.component),
      dependsOn: b.dependsOn.map((d) => aliases.get(d) ?? d),
    })),
  };
}

export function parseTemplate(raw: string): Template {
  if (raw.length > 1_000_000) throw new Error("Template is too large.");
  const t = JSON.parse(raw) as Template;
  if (
    !t ||
    t.format !== "textus-writing-template" ||
    t.version !== 1 ||
    typeof t.id !== "string" ||
    !Number.isInteger(t.revision) ||
    t.revision < 1 ||
    !Array.isArray(t.components) ||
    !Array.isArray(t.blocks) ||
    t.blocks.length > 100 ||
    t.components.length > COMPONENTS.length
  )
    throw new Error("Unsupported template format.");
  const ids = new Set<string>();
  for (const c of t.components) {
    if (
      !c ||
      typeof c.id !== "string" ||
      ids.has(c.id) ||
      !COMPONENTS.some(
        (known) => known.id === c.id && known.version === c.version,
      )
    )
      throw new Error("Unknown or conflicting component version.");
    ids.add(c.id);
  }
  const blockIds = new Set<string>();
  for (const b of t.blocks) {
    if (
      !b ||
      typeof b.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(b.id) ||
      blockIds.has(b.id) ||
      typeof b.purpose !== "string" ||
      b.purpose.length > 2000 ||
      !Array.isArray(b.components) ||
      new Set(b.components).size !== b.components.length ||
      !b.components.every((c) => ids.has(c)) ||
      !Array.isArray(b.dependsOn) ||
      !b.dependsOn.every((d) => typeof d === "string")
    )
      throw new Error("Invalid block or component reference.");
    blockIds.add(b.id);
  }
  if (dependencyProblems(t.blocks).length)
    throw new Error(
      "Template has missing, cyclic, or out-of-order dependencies.",
    );
  // Discard any injected bodies, secrets, scripts or extra object fields.
  return {
    format: t.format,
    version: 1,
    id: t.id,
    revision: t.revision,
    components: t.components.map(({ id, version }) => ({ id, version })),
    blocks: t.blocks.map(({ id, purpose, components, dependsOn }) => ({
      id,
      purpose,
      components,
      dependsOn,
    })),
  };
}

export function instantiateTemplate(template: Template): {
  paper: Paper;
  text: string;
} {
  const aliases = new Map(
    template.blocks.map((b) => [b.id, crypto.randomUUID()]),
  );
  const paper = newPaper();
  paper.template = { id: template.id, revision: template.revision };
  paper.blocks = template.blocks.map((b) => ({
    id: aliases.get(b.id)!,
    purpose: b.purpose,
    dependsOn: b.dependsOn.map((d) => aliases.get(d)!),
    intentions: b.components.map((component) => ({
      id: crypto.randomUUID(),
      component,
      decision: "planned",
    })),
  }));
  return {
    paper,
    text: paper.blocks.map((b, i) => marker(b.id) + `## ${i + 1}\n\n`).join(""),
  };
}
