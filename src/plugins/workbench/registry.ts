import type { Component } from "./model";

// Namespaces keep the written Kait library separate from incompatible legacy K ids.
export const COMPONENTS: Component[] = [
  ...[
    [
      "claim",
      "State the claim",
      "State precisely what this block asks the reader to consider.",
    ],
    [
      "evidence",
      "Present evidence",
      "Give checkable support, with its source and limitations.",
    ],
    [
      "reasoning",
      "Connect the reasoning",
      "Explain how the support bears on the conclusion.",
    ],
    [
      "objection",
      "Address an objection",
      "State an opposing case fairly before answering it.",
    ],
    [
      "boundary",
      "State a boundary",
      "Explain assumptions and limits on the conclusion.",
    ],
  ].map(([id, name, purpose]): Component => ({
    id: `job:${id}`,
    version: 1,
    family: "job",
    name,
    purpose,
    contexts: ["argument"],
    limitations: "Presence does not establish soundness or truth.",
    provenance: "User brief §4; STORY_REVERSE_ENGINEER_SPEC_v0_1.md",
  })),
  ...[
    [
      "kait-written:K07",
      "Concrete scene",
      "Make an abstract question tangible with concrete details.",
      "KAIT_MOVES_LIBRARY.md K07",
    ],
    [
      "kait-written:K33",
      "Swap test",
      "Change one variable and compare the resulting judgment.",
      "KAIT_MOVES_LIBRARY.md K33",
    ],
    [
      "story:S04",
      "Thought experiment",
      "Test reasoning through an explicitly imagined situation.",
      "STORY_REVERSE_ENGINEER_SPEC_v0_1.md S04",
    ],
    [
      "engine:socratic",
      "Socratic question",
      "Invite the reader to examine an assumption.",
      "FTP UNIFIED WRITING ENGINE §4.4",
    ],
  ].map(([id, name, purpose, provenance]): Component => ({
    id,
    version: 1,
    family: "technique",
    name,
    purpose,
    contexts: ["opening", "body", "closing"],
    limitations:
      "Optional. An illustration is not evidence. Questions must not conceal unsupported premises.",
    provenance,
  })),
  ...["Prose", "List", "Table", "Quotation"].map((name): Component => ({
    id: `presentation:${name.toLowerCase()}`,
    version: 1,
    family: "presentation",
    name,
    purpose: `Express this block using ${name.toLowerCase()}.`,
    contexts: ["any block"],
    limitations: "A presentation choice does not fulfill an argumentative job.",
    provenance: "User brief §4",
  })),
];
