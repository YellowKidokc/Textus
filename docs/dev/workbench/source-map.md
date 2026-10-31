# Writing workbench source map

Reference: `YellowKidokc/Deep-Research-Hub`, commit
`11f6159bc77012f7fa55736e61d97d93616b0e56`. Inspected in a separate read-only
reference checkout; no OpenWriter files were changed. Historical build notes
below are not current runtime verification.

| Source                                                                                   | Written requirement                                                                                     | Existing implementation and observed wiring                                                                    | Unverified or missing                                                                                                               |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `docs/WRITER_v0.1.md`, `WRITER_FEATURES_v0.2.md`                                         | Author-controlled rewrites, sources, reusable snippets, templates                                       | DRH plugin routes for checklist, research, nodes, rewrite, craft opening; `StoryTab.tsx` fetches these routes  | Templates and metadata rail are backlog proposals; old runtime not launched                                                         |
| `docs/LOOPS_METHODOLOGY.md`                                                              | Combinable writing moves and unfinished intentions                                                      | Story tab fetches `/api/drh/loops`; route reads a loop file                                                    | Requested `packages/openwriter/src/loops/` is absent at this commit; no inferred implementation                                     |
| `docs/KAIT_MOVES_LIBRARY.md`                                                             | K01–K53, provenance and rhetorical function                                                             | Written catalog is available                                                                                   | Legacy TypeScript loop library requested by brief is absent; conflicting code IDs cannot be reconciled from unavailable definitions |
| `docs/FTP UNIFIED WRITING ENGINE.txt`                                                    | Integrity, claim categories, reader agency, project-specific voice, math translation, source discipline | Requirements document                                                                                          | File ends at §10.1, `For`; no missing continuation invented                                                                         |
| `docs/PERSUASIVE PSYCHOLOGY v2 — Writing That Lands.txt`                                 | Narrative and reader psychology                                                                         | Editorial guidance                                                                                             | Superseded manipulative guidance is not imported as a recommendation                                                                |
| `docs/STORY_REVERSE_ENGINEER_SPEC_v0_1.md`                                               | Quoted functional findings, version pinning, story/evidence distinction                                 | Specification with A/B/C passes                                                                                | No evidence that these passes are running in the checked-out OpenWriter UI                                                          |
| `docs/Now I see the missing piece. And I think it's the most importan`                   | Argument Blocks; separate job, technique and presentation                                               | Design proposal                                                                                                | Not treated as shipped code                                                                                                         |
| `apps/openwriter/UPSTREAM.md`, DRH plugin `src/index.ts`, `src/drh/`, `StoryTab.tsx`     | Explain prior fork and visible integration                                                              | Source inspection confirms route calls, research cards, variant cycler, action stores and pending-edit landing | Some browser stores are best effort localStorage; route/mock history does not prove durability or live AI behavior                  |
| `apps/openwriter/adr/pending-overlay-model.md`, pending overlay/review/version code      | Keep accepted prose separate from proposed changes                                                      | Sidecar design, accept/reject overlay, version restoration paths                                               | Not ported: Textus supplies its own native proposal and undo pipeline                                                               |
| `docs/paper-lifecycle/ID_AND_YAML_SPEC_v0.2.md`, lifecycle maps/checklists, lineage docs | Permanent identities, immutable original records, provenance and human rulings                          | Corpus design distinguishes idea identity from occurrences and versions                                        | Not reduced into a new universal claim enum or completeness score                                                                   |
| `prompts/W_rewrite/RETURN.md`, `plainer.md`                                              | Preserve meaning, facts, formatting and scope                                                           | Existing OpenWriter slot-driven rewrite request assembly                                                       | Adapted constraints, not copied Express/OpenRouter plumbing                                                                         |

## Textus fit

Inspected `AGENTS.md`, `CONTRIBUTING.md`, architecture, plugin guide/reference/
types, storage documentation, AI concepts and AI proposal lifecycle against
the checked-out implementation. Textus supplies Milkdown/ProseMirror, native
file/project organization, sandboxed webviews, document-change source events,
document/project plugin storage, provider settings, project instructions,
skills, style profiles, a library and a review pipeline with undo.

Portable additions are the component registry, Argument Block model, exact
evidence validation and versioned template format. The plugin adapts these to
native editor block groups, events, document storage and proposals. No second
editor, OpenWriter server, browser-only decision store or rewrite review UI
is introduced. Core additions are a permissioned, cancellable provider-text request API
and optional atomic snapshot guards for native edits and proposals. The
existing public AI API only registered tools. It uses the existing Review-mode backend path with every tool disabled
for text requests, including MCP and plugin tools. Project instructions,
style and provider configuration stay in the host.

## Mapping decisions

- Written Kait identities use `kait-written:K07` and `kait-written:K33`.
  Legacy `K07`/`K33` are not assumed aliases. This preserves original written
  identifiers without overwriting an unknown code definition.
- The story thought experiment is `story:S04`; Socratic discovery is
  `engine:socratic`. Jobs and presentation have separate namespaces.
- Claim grades remain source information. The seven Unified Engine categories
  differ from historical route grading/score fields. This increment does not
  migrate or flatten them and produces no quality or truth score.
- Author decisions are separate from provisional model findings. Hypothetical
  stories cannot pass the evidence contract. Selected components are optional
  unless the author selects an argumentative job for that block.
- Existing project assumptions, including Christian theological premises, stay
  in native project instructions and style rather than universal restrictions.

## New behavior and evidence

See the plugin [usage and limitations](../../../extensions/writing-workbench/README.md).
Unit tests and browser checks are current validation; source inspection above
is integration evidence only. No live model or Windows desktop success is
inferred from mocked results.

## Follow-up source documents

The uploaded paper lifecycle checklist, ID/YAML specification, cold-review
handoff, persuasive-psychology notes and discovery-writing note are reference
material for user-created templates. Their embedded reviewer directions do
not change development instructions. The template workshop imports their
headings/list items as editable candidates using a local parser. It neither
executes their instructions nor silently turns proposed additions into rules.
The example lifecycle rubric selects claim scope, definitions, reasoning,
verification boundaries and reader route; it is an editorial review, not a
canon gate, mathematical verifier or corpus research engine.

Persistent paragraph notes extend the existing argument mapping. Frozen
originals and working files use Textus native split panes; rewrites/copies use
native proposals. Rubric results and local plan templates are independent
formats, and paid assessment remains explicit. See the plugin README for the
cost-estimate assumptions and remaining desktop acceptance limits.
