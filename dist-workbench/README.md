# Writing workbench

An initial manual writing workflow for Textus. The native editor remains the
writing surface. This plugin requires this checkout's API 1.3 additions; it
will not run on an unmodified beta.8 release.

## Start

1. Run `npm ci`, then `node scripts/build-writing-workbench.mjs`.
2. Run `npm run tauri dev` with throwaway data directories for testing.
3. Choose **Settings › Extensions › Plugins › Load a plugin folder…**, select
   `dist-workbench`, and turn it on. Review its permissions, including paid AI
   requests through the provider configured in Textus.
4. Open a project folder and a saved Markdown paper, then the **Writing
   workbench** sidebar tab. **New paper** creates a Markdown file in that folder.
5. Add argument blocks. The first block adopts existing prose. Select each
   block to set its purpose and choose independent jobs, techniques and
   presentation options. Write in Textus's editor. Move blocks with the two
   buttons, or edit their Markdown order.
6. Select **Analyze now**. Inspect exact quotations and limitations before
   recording your own decision. Deferred and planned intentions stay visible.
   Select another block and use **Move intention to selected block** to carry
   one forward. Optional techniques are listed separately from jobs.
7. Select **Make this block plainer**, then **Review in the document**. Textus
   draws the original and proposal and provides its existing Accept/Reject
   controls. A generated alternative never changes the paper by itself.
8. **Export template** produces readable JSON. **Copy JSON** copies it for
   saving outside Textus. Paste JSON and select **Preview import**, then
   **Import as new** in a saved blank paper. Import never overwrites a plan.

## Storage and identity

Textus's document-scoped plugin store holds the plan, immutable analysis text
snapshots, generated alternatives and author decision log under `paper` for
`yellowkid.writing-workbench`. Textus owns its durable files in the app's
config folder and moves document-scoped records when it moves a document.
Browser tests use the host's in-memory dev stand-in, not durable desktop storage.

Markdown comments `<!-- textus-argument:UUID -->` begin argument containers.
They contain no author decisions. Textus currently displays these comments
as explicit block boundaries in the native editor. Content up to the next marker belongs to
the block; multiple paragraphs, tables, lists and quotations can belong to one
block. Editor block IDs are mapped by the current marker order only. Duplicate
markers, missing mappings and stale snapshots prevent a rewrite from landing.
Deleting a marker leaves its plan unresolved, preserving history for recovery.
Undo can restore it. Do not copy markers to create another block: use **Add
argument block**, which issues a fresh identity.

Normal template exports whitelist block purposes, order, dependencies and
versioned component references. They exclude document bodies, paper intent,
snapshots, decisions, provider settings, research and preferences. Block
purposes are deliberate template metadata: inspect them before sharing.
Only the included component versions are supported in this first format.
All imported block and intention identities are regenerated with references
remapped. No archive or executable format is accepted.

## Boundaries of this increment

Manual requests analyze the managed blocks up to an 80,000-character prompt
limit, with one request at a time, six per minute and a two-minute timeout.
Token usage and exact cost are unavailable. No timer or background analysis
is enabled. Cancellation, provider errors and stale results do not affect
local saving. Old analyses remain inspectable and cannot update current
coverage. Confirmation belongs to the exact passage and becomes stale after
an edit. Presence of evidence, an objection or an equation does not establish
truth, strength or validity.

Native review owns acceptance/rejection and undo. The plugin records the
generated alternative and its handoff, not a second review system or inferred
acceptance statistics. Native review decisions are not yet correlated back
into plugin preference records. Pending native review reopening, Windows
desktop behavior, external renames and multiwindow concurrent plugin decisions
need further acceptance testing. Full project/decision-history export, custom components, saved preset libraries,
template revision management, project-wide intentions, dependency editing,
interval analysis and preference/outcome statistics remain later increments.

The ten locale entries currently use English wording. They can be translated
without changing the portable component identities.

## Passage notes, reviews and template workshop

Choose **Passage notes** from the left workbench to open the right inspector.
Its **Rubric reviews** tab offers writing quality, argument assessment, grading,
and custom rubrics. Load or export JSON locally. Select the paper, block,
paragraph, native selection, or an explicitly enabled original snapshot.
Enter your provider's USD prices per million input/output tokens, then choose
**Estimate cost** and **Run assessment**. Unknown prices are shown as unknown;
the byte-based token estimate is approximate and is not a billing cap. Only
Run makes the review request. Changing provider/model after the preview blocks
Run until it is estimated again. Results retain the entire examined version
and rubric. Identical requests reuse the saved result across reopening.

**Template workshop** reads `.txt`, `.md` or JSON files locally. Heading/list
extraction produces editable candidate items, not automatic compliance rules.
Check the items to adopt, edit their wording, choose rubric or paper plan, and
build editable JSON. Grading requires an explicit numeric scale; descriptive
reviews remain unscored. Imported rubric fields are strictly whitelisted.
Rubrics contain criteria, scales, instructions and the JSON evidence contract;
keys and executable fields are rejected. Paper-plan JSON uses the separate
portable template format and imports only into a blank saved paper. Review
sources and generated wording before exporting: selected criteria/purposes
are intentionally portable, while private document text and review history
are excluded. Attached review instructions are source data, not development
instructions or automatic rulings.

Examples: [editorial lifecycle rubric](examples/lifecycle-review.json) and
[paper route plan](examples/paper-route.json). The lifecycle rubric adapts
selected concepts from the supplied checklist, with human rulings and external
verification explicitly outside model scoring. It does not adopt every
checklist bullet as a mandatory writing rule.

## Original and working revision

**Revise beside original** freezes the current text into a pathless, read-only
native tab and creates a separately named Markdown revision file. The source
file is never the revision's save target. Native AI and plugin requests remain
pinned to the working file when the original is clicked. Original reference
is off by default and must be explicitly enabled. The original can be selected
and quoted; proposed copies and rewrite alternatives enter native review.
Opening a working revision restores its saved comparison. Independent scroll
is the default. Linked scrolling synchronizes relative scroll position, not
assumed paragraph numbers. Correspondence requires a unique exact paragraph;
edited/repeated text remains unmatched. Difference badges indicate paragraphs
not found in the original; they are not a full structural diff.

Caret selection inside an Argument Block drives paragraph notes. Manual
analysis distinguishes USED, REMINDER, SUGGESTION and TRANSITION and normally
shows up to three notes, with extras collapsed. Decisions are separate from
edits. Notes quote their source and retain provider, model, prompt and version.
Editing or ambiguous duplication makes mappings stale/unresolved; transition
notes also check their neighbors. No timer is enabled. Badges and metadata
stay out of document exports. Right inspector selection, native panel widths
and split ratio are remembered. Native focus mode hides the side panels.

Browser integration tests cover these workflows using throwaway mock data.
Real Windows Tauri verification and real-provider billing accuracy remain
unverified; browser success does not establish either.

## Planned connections and research workspace

The [Connections, Evidence and Runs design](../../docs/design/workbench-connections.md)
adds desktop/mobile wireframes and a staged backlog. The [MCP investigation](../../docs/dev/workbench/mcp-investigation.md)
checks both outward client and inward server directions against this checkout
and the official specification. These are proposed features, not capabilities
enabled by installing the current plugin. Inbound MCP, exact context grants,
Evidence/citation records, batch budgets, private workspace packages and
dictation still require implementation and native acceptance checks.
