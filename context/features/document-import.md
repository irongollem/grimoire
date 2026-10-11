# Document Import

A DM supplies source material — a PDF, a batch of page photos, or **text pasted
straight in** — an AI pass extracts game entities from it, and an eight-step
wizard reviews every entity before anything reaches a content table. (A
**wiki export** from LegendKeeper, World Anvil or Obsidian is the one source
that skips the AI pass entirely; see "A wiki export is a fourth source kind".) **DM-only**
— there is no player-facing surface at all.

Lives at **Campaign Settings → Import Document** (`/campaign/settings?tab=import`).

**A second door, since #839:** `/quests/new`'s "Paste a page" mode
(`QuestPasteImportPanel.vue`) runs the exact same extraction and the exact
same insert/link/spine machinery, through **one compact confirmation**
instead of a step per kind — sized for "I want this one quest," not "I have
a chapter PDF." See that story's own section below and
`context/features/quests.md`'s "Three ways to start a quest." The settings
wizard is unchanged and still the way to bulk-import a whole chapter.

Issues #353, #769, #829, #840 and #839.

---

## The shape of it

| Step | What happens | Where |
| --- | --- | --- |
| Upload | Pick file(s), see page count + credit cost + plan cap, tick the rights attestation | `DocumentImportTab.vue` |
| Stage | Objects go to the private `import-documents` bucket; a `document_imports` row is created | `useDocumentImport.ts` |
| Extract | Edge function reads the bytes, calls the model, writes `extracted` jsonb back | `import-extract/index.ts` |
| Review | One step per entity kind — select an `ImportDecision` (link/create/generate/ignore) per entity | `DocumentImportWizard.vue` |
| Sweep | `runImportSweep` imports every kind, then **one** linking phase resolves every cross-entity reference by name across the whole extraction (#893) | `importSweep.ts` |

Eight kinds import in **this order** (`IMPORT_ENTITY_KINDS`) — an ordering
requirement on *inserts* only since #893, never a constraint on which link can
resolve (see "One sweep, one linking phase" below):
`factions → monsters → npcs → locations → items → spells → quests → encounters`.

---

## Files

**Types & pure logic** (`src/types/`, `src/lib/documentImport/`)

| File | Owns |
| --- | --- |
| `documentImport.types.ts` | The extraction contract — eight narrow payloads, review envelope, `ExtractionResult`, `DocumentImport` row type |
| `entityKinds.ts` | Per-kind registry: target table, labels, `displayField`, `quotaResource` |
| `limits.ts` | Page caps (10 free / 50 Pro), MIME allowlist, per-object and per-import byte caps, and the characters→pages conversion for a pasted import |
| `../tiptap/sourceHtml.ts` | Normalises pasted HTML so structure survives into Tiptap — `aside`/hinted classes → blockquote, noise stripped |
| `../tiptap/tiptapToMarkdown.ts` | The inverse of `markdownToTiptap.ts`; what the pasted, trimmed document is sent to the model as |
| `downscale.ts` | Reduces page photos before upload — pure sizing arithmetic plus a browser-only re-encode |
| `pageCount.ts` | PDF page counting via `pdf-lib`; rejects mixed PDF+image and multi-PDF selections |
| `normalize.ts` | The **one** place an extracted payload becomes an `<Entity>Insert` |
| `entityName.ts` | `normalizeEntityName` — the name-lookup key every client-side name match uses, an exact TS port of SQL `private.normalize_entity_name` |
| `entityMatching.ts` | The per-entity DECISION model: `EntityCandidate`, `ImportDecision` (`link`/`create`/`generate`/`ignore`), `parseImportMatches` (the `import-match` edge function's response), `canCreateFromPage`, `defaultDecision` |
| `reviewDecisions.ts` | Pure decision-state helpers both review surfaces share: `seedImportDecisions` (fills in `defaultDecision` once candidates are known, never overwriting a DM choice), `tallyDecisions`, `isAmbiguous`, and the "Ignore all"/"Reset to suggested" group actions |
| `monsterGenerationConcept.ts` | Turns one page's monster payload into a generation concept + constrained options, for a `generate`-decided monster; also `monsterGenerationCreditCost`, the shared credit formula every `generate` decision's cost badge reads |
| `importPlan.ts` | Decisions → ordered inserts, partial-failure accounting, link resolution |
| `sanitizeEntities.ts` | Validates one kind's raw `extracted[kind]` array into renderable entities, dropping malformed ones — shared by the wizard and the compact review (#839) |
| `runImportKind.ts` | One kind's insert/generate loop — with every side effect injected (`RunImportKindDeps`) — now called by `importSweep.ts` rather than by either UI directly. Also owns `runLocationsImportKind`/`orderLocationsParentsFirst`, the `locations` kind's own insert runner — see "A location resolves its own parent AT INSERT" below for why it can't share the generic loop |
| `importSweep.ts` (#893) | `runImportSweep` — every kind imports first, then ONE linking phase resolves every name reference across the whole extraction (a link to a kind that imports *later*, e.g. an NPC's `location_name`, could never resolve under the old per-kind resolution). Owns the sweep-wide `normalizeEntityName → { id, source }` registry, the beat-attachment/loot/quest-ref writes a beat's resolved references produce, the site/room index and room-loot-by-location map the beat pass needs (below), and marking the row complete |
| `importSweepLinking.ts` | Split out of `importSweep.ts` to stay under its line cap: `resolveEncounters` (combatant resolution) and `resolveBeatCrossReferences` (a beat's location/npc/faction/encounter/monster/item names), plus `resolveLocationLoot` and `buildSiteRoomIndex`/`SiteRoomIndex` (below) — the shared `attachItemLoot` helper both loot resolvers use, parameterised by `LootPlacementHome` rather than duplicated per caller |
| `sourceTitle.ts` | The "Source book" field's pure half (below): `normalizeSourceTitle`, `rankSourceOptions`/`pickDefaultSourceTitle` (the DM's own naming history, ranked and prefilled), `hasSourcedCreate` (whether the review would even create a sourced row) |
| `questPasteReview.ts` | Pure helpers for the compact review only: pick the headline quest, summarize the other kinds found, derive a default staging-row name |
| `../archiveImport/*` (#932) | The wiki-export source, all pure: `readArchive` (zip/Markdown/HTML to `ArchivePage`s), `archiveManifest` (the compact row value), `archiveRows` (page to columns), `archiveSweep` (the two-pass sweep), `archiveMatches` (dedupe batching), `archivePreview`, `archiveAiText`, `sortGroups`, `readFiles` |

**Composable** (`src/composables/campaign/`, `src/composables/monsters/`) —
`useDocumentImportRunner.ts` is `importSweep.ts`'s Supabase-backed half (real
inserts, lookups, RPC calls); `DocumentImportWizard.vue` and
`QuestPasteImportPanel.vue` both call its one `runImportSweep(importRow, input,
onProgress)` rather than each wiring their own insert/link loop — this replaced
the older per-kind `runKind`/`finalizeImport` pair (#893), which has no caller
left. `useImportEntityMatches.ts` is the one `import-match` call per row —
keyed on the row id alone, never re-run on a DM's field edit — returning
`candidatesByKind`/`candidatesFor(kind)` both review surfaces read.
`useGenerateMonster.ts` is the generate→create pipeline a `generate`-decided
monster runs through, shared with (extracted from) `MonsterGeneratorPanel.vue`'s
own AI-generation panel. A library pick is stored as a reference, never cloned: see "Choosing a
library candidate references it" below.
`useImportSourceOptions.ts` is the "Source book" field's Supabase-backed
half: three plain reads of the DM's own `monsters`/`items`/`spells` rows
(excluding anything Open5e/library-sourced), reduced through `sourceTitle.ts`'s
pure ranking into the suggestion list and campaign-aware prefill both review
surfaces show.

**UI** (`src/components/campaign/`) — `DocumentImportTab.vue`,
`DocumentImportWizard.vue`, `ImportKindReview.vue` (one kind's whole review
group — header, tally chips, group actions, accordion of rows — used
identically by the wizard and the compact quest-paste review),
`ImportEntityReviewRow.vue` (one entity's accordion row: collapsed shows what
will happen, expanded shows the lettered candidate choice plus Create/Generate/
Ignore; renamed from the old select-and-edit `DocumentImportEntityCard.vue`
when the review moved from a selected/excluded boolean to an explicit decision
per entity), `DocumentImportPasteStep.vue` (the settings paste source step) and
`DocumentPasteEditor.vue` (the rich paste-capture box itself, shared with
`QuestPasteImportPanel.vue` in `src/components/quests/overview/`).

The wiki-export UI (#932) is `ArchiveImportPanel.vue` (the flow and the
in-memory pages) with `ArchiveFilePicker`, `ArchiveSortStep`,
`ArchiveReviewStep` + `ArchiveReviewRow`, `ArchiveResultStep` and
`ArchiveAiExtract`. `ImportDecisionChoice.vue` (the link/create/generate/ignore
radio group) was extracted from `ImportEntityReviewRow.vue` so both reviews
offer the same choice; `reviewDecisions.ts` owns `decisionStatus`, `matchKindHint`
and `candidateLetter` for the same reason. Its composable is
`composables/campaign/useArchiveImport.ts` (create the row, batched matches, run
the sweep).

**Server** (`supabase/functions/`) — `import-extract/index.ts`,
`import-extract/extractionSchema.ts`, `_shared/documentGen.ts`.

**Data** — table `document_imports`, bucket `import-documents`,
`provider_config.document_model`, `ai_system_prompts` row `document_import`,
credit rows `document_import_extraction` (base) + `document_import_page`,
cron job `sweep-stranded-document-imports`.

---

## Things that will look wrong and are not

### The legal design is in the prompt, not just the code

`PROSE_FIELD_LIMIT` and the page cap are inert unless the model is told to
paraphrase. The system prompt instructs it to copy **mechanics exactly** — never
round or abbreviate a damage expression — and to **summarise descriptive prose in
its own words**. Item and spell descriptions are treated as mechanics, because
they are rules text.

Mechanics are unprotectable facts; descriptive prose is the author's expression.
Editing that section of the prompt is a legal change, not a quality tweak. The
page cap is load-bearing for the same reason (EU database right — extracting a
*substantial part* of a compilation), so it is not merely a cost guardrail and
should not be raised as if it were. Full reasoning on #353.

**Copy is deliberately neutral.** "Import from a PDF or page photos" — never a
named book, publisher, or D&D Beyond, anywhere in UI, docs or marketing.

That rule is about books and the publishers who sell them. It does not cover
naming the *software* a DM is moving away from: the wiki-export source (below)
says LegendKeeper, World Anvil and Obsidian on purpose, because "which app do I
export from" is the first thing that DM needs to know.

**A beat's `rumor_text` and `reveal_text` are summary, and that is the same
rule, not an exception to it.** They are the only player-facing prose the
import writes besides the quest `summary`, so the prompt holds them to both
halves: the model's own words, never the page's sentences or its boxed text,
and no DM-only information. Transcribed narrative keeps exactly one home,
`read_aloud`, which no player-facing read returns. They are also the only prose
fields the wire schema refuses a `null` for (`QUEST_BEAT` in
`extractionSchema.ts`): a beat without reveal copy shows the players nothing, so
an import that left them empty (as it did until `20261002211019`) handed the DM
a quest that could not be shared without retyping every beat. See "The spine,
and its two producers" in [quests.md](quests.md).

### Pasting is a third source kind, and the box is rich text on purpose (#829)

`source_kind` was `pdf | images | text` when pasting arrived (a fourth, `archive`, followed in #932). A pasted import carries no storage object
at all — `source_paths` is empty and the text lives in `document_imports.source_text`,
swept by the same `expires_at` cleanup. `document_imports_source_shape_check`
binds all three: each kind to its own `source_paths` cardinality, and whether
`source_text` is set.

**Why the paste box is a `RichTextEditor` and not a `<textarea>`.** This looks
like a violation of CLAUDE.md's sanctioned `<textarea>` exception and is the
opposite case. That exception covers **AI-prompt** fields, where markup reaching
the model is noise the user never intended. This is a **source-document** field,
where the markup *is* the structure and is the only reason extraction works.

The measurement behind it: a real ⌘C from a digital edition puts two flavours on
the clipboard. `text/plain` comes back **completely flat** — every heading a bare
line, all structure gone. `text/html` is ~6x larger and keeps the heading
hierarchy, the tables, and the boxed text as its own element. Paste into a
textarea and the signal is destroyed before anything can use it.

**The converter must not know who published the source.** One vendor's HTML
labels boxed text outright; other books from that publisher and every book from
another will not. So `sourceHtml.ts` works on *generic* semantics — `h1`-`h6`,
`blockquote`, `aside`, tables, lists, `em`/`strong` — with a small extensible
lookup of class hints on top. When the hints miss, heading depth and quoting
still carry; when there is no structure at all, the model judges from prose.
**One output shape, three levels of signal** — richer input means the model
guesses less, never differently.

The division of labour is deliberate: the parser's only job is to *preserve*
structure, and every semantic judgement stays with the model. A parser can tell
you a block is set apart and that a heading is depth-3; only a model can tell
you that one depth-3 heading is a scene and the next is a container that merely
groups the rooms beneath it.

### A wiki export is a fourth source kind, read without AI (#932)

`source_kind` is `pdf | images | text | archive`. A DM moving from LegendKeeper,
World Anvil or Obsidian picks **Wiki export** on the import tab, drops the
export (a `.zip`, loose `.md`/`.html`/`.json` files, or an unzipped folder), and
the **browser** reads it: `src/lib/archiveImport/` turns each exported page
into one `ArchivePage` (kind guessed from folder, frontmatter or template; body
kept whole as Tiptap JSON; `[[wikilinks]]` and relative links as placeholder
nodes). Nothing is sent to a model and nothing is charged, which is why the
flow works with a campaign's AI switched off.

The flow is pick, **sort** (client-only: detected app and evidence, skipped
files with reasons, pages grouped by folder with a kind per page, bulk "set
all"), **review** (per kind: link to an existing entry, create, or ignore, with
the same `import-match` candidates and the same `ImportDecisionChoice` control
the AI review uses) and **result** (counts, problems, links left as text, and
the optional AI pass). It lives in `ArchiveImportPanel.vue`; `DocumentImportTab`
only decides when to show it.

**Why the 50-page ceiling does not apply.** The ceiling exists because the
platform *extracts* from a source (the EU database right, see "The legal design
is in the prompt"). Here nothing is extracted: the DM's own pages are copied in
by their own browser, the way a bundle or a backup restore is. An archive row
has its own sanity bound (`page_count <= 2000`, a CHECK). The ceiling still
binds every page the DM later sends to AI, because that goes through a **`text`
row**, which keeps the cap, the credit charge and the review (below).

**Why the row holds only a manifest.** `extracted` is
`{ archive: { version, source, pages: [{ ref, title, kind }] } }`
(`archiveManifest.ts`), never a page body. The request stays small however big
the export is, and what the DM wrote is not stored twice. The cost is that a
reload during review loses the bodies; the tab then shows "This wiki import was
interrupted", the DM drops the same export again and each page's kind is
restored from the manifest **by `ref`** (a different export is refused when no
page `ref` matches), or the DM abandons the row. The row is inserted directly
with `status = 'review'`: `import-extract` refuses `archive` rows (422) and
nothing server-side reads one.

**The tab stays with AI off.** Campaign settings used to hide Import Document
while the campaign's AI was off, because every source was extraction. A wiki
export is not, so the tab now always shows, and with AI off it offers only the
wiki export and says in one line why the other sources are missing
(`CampaignSettingsView`, `DocumentImportTab`).

**Why no `ai_provenance`.** Nothing in an archive import was generated, so the
rows it creates must not be marked as if it were (AI Act marking, #611). The
database enforces it (`document_imports_archive_not_ai_check`), and because
`DocumentImportWizard` refuses a row without provenance and `normalize.ts`
caps prose at 600 characters, **an archive row must never reach either**:
`DocumentImportTab` keeps it out of `reviewRow`, `QuestPasteImportPanel` treats
an active one as someone else's import, and the type is a union discriminated
by `source_kind` (`AiDocumentImport | ArchiveDocumentImport`, `isArchiveImport`)
so a reader of `extracted` has to say which shape it expects.

**The sweep** (`archiveSweep.ts`, pure with injected writers, wrapped by
`useRunArchiveSweep`). Creates places parent-first (a place's `parent_id` is on
the insert because `guard_location_room_parent` is a BEFORE INSERT trigger; an
interior place with no site to sit in is imported as `other` and the result says
so), then factions, NPCs (`location_id` from the place their page nests under),
items, quests, notes. Everything is DM-only, uncapped, one insert per row so a
quota refusal is reported for that row. A quota refusal stops *that kind* (every
later row would be refused identically) and the other kinds go on. Quests are
created like a hand-made one, with the plain one-line `summary`; a quest page's
prose goes on an **opening beat's `dm_content`** (a hand-made quest creates no
beat, but `summary` is one plain line and the prose has to live somewhere).

**Mentions resolve in two passes**, because a link can point at a record that
does not exist yet. Pass 1 inserts every row with each link as its plain label
and builds a `ref -> { id, entityType }` registry (created *or* linked rows).
Pass 2 rewrites, only for pages that contain links, the body columns with the
links turned into `@mentions` when the target is a place, faction or NPC. A link
to a quest, item or note, an ignored page, or a target outside the export stays
a plain label and is listed on the result screen. An `archiveLink` placeholder is
never written to the database (a test asserts it over every payload).

**Dedupe batches.** `import-match` refuses a request over 300 entities
(`MAX_TOTAL_ENTITIES`) and is rate limited per user, so `archiveMatches.ts` sends
a large export in sequential batches of at most 300 and merges the answers; a
failed batch fails the whole check, because a review missing a third of its
candidates would default those pages to "create" and duplicate what the DM
already owns. Only a name and a 400-character excerpt are sent per page.

**The AI layer** is optional and on the result screen: the DM ticks imported
pages (none by default), sees the page budget against their plan and the cost,
and Start writes them as one markdown document (`archiveAiText.ts`: `# Title` +
body, links flattened to labels) into an ordinary `text` import and starts it.
From there the AI flow and its review take over, and its dedupe offers the
just-imported rows as links. Hidden with a one-line reason when the campaign has
AI off.

### The page cap is enforced where it cannot be forged (#829)

`limits.ts` documents *why* the cap exists, and only one of the two reasons is
cost. The other is the EU sui generis database right (Directive 96/9/EC), which
protects a compiled database against extraction of a *substantial part*. A paste
box with a client-declared page count would be a way straight around it — send
`page_count = 1` with a megabyte of text and the ceiling never fires.

So the CHECK requires `page_count >= ceil(char_length(source_text) / 3500)`,
making the count **derived rather than declared**. With the existing
`page_count <= 50` that caps pasted text at ~175,000 characters as a property of
the row rather than a promise the client keeps. `TEXT_CHARS_PER_PAGE` in
`limits.ts` mirrors the constant in the migration; a client that rounds *down*
fails the check rather than silently under-paying, which is the direction the
mismatch should break in.

### A text import calls the provider with `parts: []`

Not a special text-only code path. All three provider block builders in
`documentGen.ts` map their `parts` and *then* append the instruction, so an empty
`parts` array yields exactly one text block — the document/vision call degrades
into a text call for free, with the source embedded in the instruction. Verified
against the builders rather than assumed; no provider code changed for #829.

### Every entity gets an explicit DECISION — link, create, generate, or ignore (#837, #838, and their successor)

The importer used to create every entity fresh, so a DM who owned a "Giant Rat"
got a second one. #837/#838 fixed monsters and items with a single best-match
resolver; this replaced that with one model covering every kind: each extracted
entity carries an `ImportDecision` (`entityMatching.ts`) —

```ts
type ImportDecision =
  | { action: "link"; candidate: EntityCandidate }
  | { action: "create" }
  | { action: "generate" }   // monsters only
  | { action: "ignore" };
```

**Candidates come from the database, not the client.** `public.match_import_entity_names`
(migration `20260918141022`) is the name tier — one function for every kind
(`npcs`, `factions`, `locations`, `encounters`, `quests`, `monsters`, `items`,
`spells`), returning up to five ranked candidates per extracted name instead of
the old resolvers' single best guess, so the review surface can show the DM
what it found and let *them* pick rather than trusting a rank order silently.
It's wrapped by the `import-match` edge function (service-role, authorizes the
caller as a campaign DM first), which adds an embedding-similarity tier on top
for a renamed variant or a creature described but never named — `entityMatching.ts`'s
`parseImportMatches` is the untrusted-JSON boundary for that response, and its
`semantic` flag says whether the embedding tier actually ran.

**Own rows before the library, exact before fuzzy.** `match_import_entity_names`
ranks a caller's own campaign/global rows ahead of shared-library rows, and an
exact normalized match ahead of a near one, ahead of a whole-word "contains"
one — the same own-vault-first reasoning #837 already established for monsters.
`EntityCandidate.source` is `"campaign"` or `"library"`; `matchKind` is
`"exact"` | `"near"` | `"contains"` (name tier) | `"similar"` (embedding tier,
carrying a cosine `distance`).

**The name tier carries every difference in how a name is written; the
embedding tier does not rescue one.** Migration `20261002131333` exists because
a real chapter (2 Oct 2026) came back with every NPC and every location marked
new, in a campaign that already held two of the towns and three of the people.
The embedding tier ran and added nothing: it compares whole descriptions, and a
row holding "Finn · Human · Child" is nowhere near a page's paragraph about the
same boy. Three rules came out of it, each the narrowest that closed its miss:

| Page | DM's row | Rule |
| --- | --- | --- |
| `Dougan’s Hole`, `Ten-Towns` | `Dougan's Hole`, `Ten Towns` | **Punctuation is not part of the key.** Apostrophes are dropped, other marks become spaces, in the normalizer both runtimes share. An exact match. |
| `Finn Dejarr`, `Hilda` | `Finn`, `Hilda Snowmantle` | **A proper name matches on any whole-word run, in either direction** — npcs, factions and locations only. A `contains` match. |
| `Edgra Durmoot` | `Edgra Durnoot` | **One edit away is `near`** (`private.names_one_edit_apart`: an insertion, deletion, substitution or adjacent swap). The DM's own rows only. |
| `Speaker Edgra Durmoot` | `Edgra Durnoot` | **For a proper name, the one edit may sit inside a longer name** (`private.name_run_one_edit_apart`, migration `20261002133428`): a run of as many words as the shorter name has, compared whole, never word against word. Also `near`. |

The rules live in one function, `private.import_name_verdict`, so changing one
no longer means restating the 150-line body of `match_import_entity_names`.

The limits are as deliberate as the rules. Monsters, items, spells, encounters
and quests keep the whole-word **suffix** rule and nothing wider: a thing is
named head-noun-last ("Icewind kobold" is a kobold), and against a library of
thousands, "Potion of Healing" offering every greater and superior variant
beside its own exact match would turn a settled row into a question. `near`
never reaches the library, where distinct canonical names sit one letter apart
("Ghast" and "Ghost", "Giant Rat" and "Giant Bat"); it needs both names to be
at least eight characters; and a name with an exact match gets no near ones,
because then it was not misspelled. The eight is measured, not guessed: the
first cut said five, and the campaign that found all this holds Holga and
Holgi, Korax, Korux and Koran, Scorp and Snorp, every one a different person.
Invented names are short and dense, so one edit in five letters is no evidence
at all. Any
non-exact candidate opens its review row (`needsDmChoice`), so a wider rule
costs the DM a visible choice, never a silent link.

**The normalizer is now shared between two runtimes, not duplicated by feel.**
`private.normalize_entity_name` (SQL) and `entityName.ts`'s `normalizeEntityName`
(TypeScript) are the same algorithm, ported term-for-term: lowercase, drop
apostrophes, turn other punctuation into spaces, trim, drop a leading article,
de-pluralise the trailing word **and** the head noun of an "X of Y" name
(`"Potions of Healing"` → `"Potion of Healing"`). The punctuation list is
explicit and identical in both, rather than "anything that is not a letter",
because what counts as a letter is a locale question Postgres and JavaScript
answer differently. Both `importPlan.ts`'s `findByName` and `normalize.ts`'s
`findEncounterCandidateByName` route through it now, which is what makes "Blue
Clam" (a page's raw heading) find "The Blue Clam" (a hand-created row) — the
old plain-lowercase match never could, since it never stripped the article.

**`canCreateFromPage`/`defaultDecision` are what decide a monster's default.**
A monster may only default to `create` when its `stat_block` actually carries a
meaningful field — otherwise `create` would land a `BLANK_MONSTER_STAT_BLOCK`
stub (CR 0, every ability score 10, no actions), strictly worse than letting the
AI generator build a real one from the same name and description. So a
stat-less monster defaults to `generate` instead; every other kind, and any
monster the page *did* give real stats for, defaults to `create` when it has no
candidate, or `link`-to-`candidates[0]` when it does. **Quests always default to
`create`**, even with a same-titled candidate — the headline quest a DM is
importing a page *for* is never silently merged into an existing one; a quest
candidate is surfaced only as a duplicate warning.

**`generate` runs through the same pipeline `MonsterGeneratorPanel.vue` uses.**
`useGenerateMonster.ts` (`src/composables/monsters/`) is the extracted
generate→create step both callers now share; `useDocumentImportRunner.ts`'s
`generateMonster` dep calls it with `generateImage: false` (a bulk import
generating portraits for every stat-less monster on the page would be an
unrequested credit spend) and `nameOverride` set to the page's own name, so
link resolution and encounter-combatant resolution can still find the row by
the name the page printed rather than whatever the model chooses to call it.
`monsterGenerationConcept.ts` builds the free-text concept (name, description,
type, size, alignment, habitat, CR) and the validated `challenge_rating`/
`monster_type`/`size` generation options — the latter validated against the
closed enums first, since `useMonsterGeneration`'s own option handling trusts
its caller and force-sets them with no validation of its own.

A `generate`-decided monster is counted as imported exactly like an inserted
one (`runImportKind.ts` runs creates and generates in one ordered pass, so a
mid-run quota refusal still means what it always has) and produces no
`PlannedInsert` at all — `buildImportPlan` only ever plans `action === "create"`
entities, and an entity **absent** from the decisions map isn't planned either;
absence is not consent.

On the reference chapter, name-tier matching alone resolved **seven creatures
out of seven**: three from the library, four from the DM's own vault, including
a book-specific "Icewind Kobold" and a typo'd "Mind FLayer" (a whole-word
"contains" match, not the embedding tier). All five extracted *items* correctly
resolved to nothing: tourmalines, a geode and a carved figurine are
chapter-specific and genuinely new — "Rock dog figurine" did **not** match
"Figurine of Wondrous Power", which a looser matcher would have.

**No `pg_trgm`.** Fuzzy matching would want it and the advisor baseline already
carries one `extension_in_public` finding not worth growing for a match this
narrow. The original reasoning ended "the embedding tier covers the rest",
which the 2 Oct 2026 chapter disproved for names (above); the one-edit check
that replaced that assumption is twenty lines of plain SQL, so the decision
against an extension stands.

**A linked entity still produces no insert at all** — `buildImportPlan` drops
it before planning, exactly as the old `linkedRefs` model did — so it cannot
duplicate and never touches quota, and the result reads "3 created, 2 linked,
1 generated" rather than folding everything into one undifferentiated count.

**A DM's `link` decision carries forward across the whole import, not just its
own kind — and, since #893, this is a sweep-wide registry rather than a
parameter `runImportKind` threads through.** `importSweep.ts` builds one map
per kind, `normalizeEntityName(printed name) → { id, source }`, from every
entity that ended up `create`d, `generate`d, or `link`ed — see "One sweep,
one linking phase (#893)" below. It's consulted ahead of `fetchNameLookup`'s
own rows for cross-entity link resolution, and ahead of `resolveMonsterNames`'s
RPC call for encounter combatants, so an NPC's `faction_name: "Blue Clam
Guild"` resolves to the faction the DM already linked that name to, even when
the row it points at is spelled differently. `runImportKind.ts` itself no
longer knows any of this — it went from doing insert-then-link to insert-only
when the linking moved to one sweep-wide phase (#893).

**The name lookup now includes the DM's global rows.** `fetchNameLookup`
(`useDocumentImportRunner.ts`) queries `campaign_id = X OR campaign_id IS NULL`
for every kind whose table tolerates a null campaign (everything except
`quests`) — a link target search that only checked this campaign would miss a
DM's own campaign-less rows (a personal monster used everywhere, an NPC not yet
assigned anywhere), which their list views for that kind already show
alongside this campaign's own. RLS still scopes a null-`campaign_id` row to the
signed-in user's own, so this can't surface another DM's global rows.

### A room's occupants propose an encounter, never create one silently (#840)

`encounters` is the eighth kind, and deliberately the **last** one:
`ExtractedEncounter.location_name` names a room from `locations`, and each
`combatants[].name` names a creature from `monsters` or `npcs` — all three
earlier steps, all resolved by name. `dependencyOrder.test.ts` pins this the
same way it pins `factions` before `npcs`.

**No schema change.** `encounters.location_id` was already the room link and
`combatants` (jsonb `CombatantDef[]`) already carries `count`, so "three
archers and two warriors" is two `CombatantDef`s (`count: 3`, `count: 2`),
never five rows.

**Combatant resolution is part of `importSweep.ts`'s one linking phase, not
`resolveLinks`.** `EntityLinks`/`LINK_TARGETS` (importPlan.ts) give every named
scalar field exactly one fixed target table — which is why `encounter_location_name`
is its own `EntityLinks` field rather than reusing quests' `location_name` (a
different FK column, `encounters.location_id` vs `quests.location_id`). A
combatant name has no *single* fixed target at all: it might resolve against
this campaign's `npcs` (a named individual, tried first — more specific than a
creature kind), against a monster the DM already `link`-decided or `create`d
elsewhere in this same sweep (the sweep-wide registry, matched by
`normalizeEntityName`), or against `monsters`/`library_monsters` via
`resolve_monster_references` (#837) as the last resort. That RPC is now
consulted only for names the registry doesn't already cover — it predates
`match_import_entity_names` and returns a single best match rather than a
ranked list, which is exactly what a combatant slot needs (one id, not a
DM-facing candidate list). `normalize.ts`'s `mapExtractedEncounter` builds
every combatant slot with its name preserved as `custom_name` and both ids
null; `resolveEncounterCombatants` is the pure per-combatant resolver, called
from `importSweep.ts`'s `resolveEncounters` step once every kind has imported
and the registry is complete — combatant resolution used to be a per-kind pass
inside `runImportKind.ts` itself (since `encounters` was always last in
`IMPORT_ENTITY_KINDS`, that happened to be late enough); #893 moved it into
the sweep's single linking phase along with everything else, which is no
longer an accident of ordering — the same "resolve after the row exists"
idiom as an FK link, just for an array field instead of a scalar column.

A combatant matching neither stays in the row as a named stub (both ids null,
`custom_name` kept) — never silently dropped — and its name is surfaced in the
same "couldn't match a reference to…" banner an unresolved FK link uses. The
DM links it by hand in the encounter's own combatant search afterward.

**The prompt had to be taught the eighth kind explicitly** (migration
`20260907000546`) — a JSON Schema property and a TypeScript type teach the
*wizard* that encounters exist, but the extractor only knows what its system
prompt (a database row, not code) tells it to look for. Without the rewrite it
kept returning exactly the seven kinds it always had.

### One sweep, one linking phase — every resource properly linked (#893)

The maintainer's framing: "every resource we create should be good, and
properly linked to the other resources made here." Before #893, a link only
ever resolved if the kind it pointed at came *earlier* in `IMPORT_ENTITY_KINDS`
— true by construction for `factions → npcs`, `npcs/locations → quests`, and
`locations/npcs/monsters → encounters`, since the dependency order was chosen
around exactly those links (see "`IMPORT_ENTITY_KINDS` order is a dependency
order" below). It was never true in general, and two of #893's own new fields
break it on purpose: an NPC's `location_name` (`npcs` extracts *before*
`locations`) and a quest beat's `encounter_names` (`encounters` is last).
Resolving those under the old per-kind scheme wasn't merely unimplemented —
it was structurally impossible, since the referenced row didn't exist in the
database yet at the moment the referencing kind's own link pass ran.

**The fix is a hard phase split.** `importSweep.ts`'s `runImportSweep` first
imports every kind in `IMPORT_ENTITY_KINDS` order (`runImportKind.ts` — now
*only* the insert/generate loop, no linking of any kind), then runs exactly
one linking phase once every row that will ever exist for this sweep already
does. `runImportKind.ts` lost `fetchNameLookup`, `applyLinkResolution`,
`writeQuestSpine`, `resolveMonsterNames` and `updateEncounterCombatants` from
its dep surface entirely — importing a kind and linking it are no longer the
same call, which is what makes the phase split real rather than cosmetic.

**The sweep-wide registry** is one map per kind, built as each kind finishes
importing: `normalizeEntityName(printed name) → { id, source }`, one entry per
entity that ended up `create`d, `generate`d, or `link`ed (an `ignore`d or
undecided entity contributes nothing — the same "absence is not consent" rule
`buildImportPlan` already applies to inserts). The linking phase resolves
every reference against this registry first and `fetchNameLookup`'s existing
campaign rows second — same "linked rows win" precedence the pre-#893 code
already used for the per-kind case, just no longer scoped to "rows this kind's
own decisions produced."

**The sweep writes a list per request, not a row per request (#951).** One
real chapter used to cost about 200 requests, because every attachment, spine
row, beat location, link and loot placement was its own awaited write. Now:

- **Entity inserts stay one per row.** Each reports its own `quota_exceeded`
  or failure, and the review counts them per kind. Do not batch these.
- **The spine** (`writeQuestSpine`, shared with the AI quest generator through
  `useQuestSpineWriter`) is five requests: the opening beat alone, the other
  beats together, then edges, objectives and consequences. The opening beat
  goes first on its own because its insert settles `quests.entry_beat_id`
  (`private.settle_quest_entry_beat`), which breaks ties on `created_at`, and
  every row of one multi-row insert shares the transaction's `now()`. Rows
  come back keyed by `canvas_x` (beats) and `sort_order` (objectives), never
  by position.
- **A beat's location rides in on the beat insert.** `locations` imports
  before `quests`, so the sweep resolves each beat's `location_name` before
  writing the spine. That replaced one update per beat.
- **Beat attachments, beat loot and room loot** are one insert each.
  Attachments are deduped per beat first, so a page naming the same NPC twice
  cannot trip the unique constraint.
- **Links** go to `applyLinkResolutions` in one call: join rows as one upsert
  per table (`ignoreDuplicates`, since a linked faction may already hold the
  place), FK updates sent together because each row gets a different value.
- **Combatant names** for every encounter go to `resolve_monster_references`
  in one call. The name lookups run in parallel, and `persistImportedCounts`
  skips a kind the page had none of.

A refused list is not a lost list. `writeBatchIsolatingFailures`
(`src/lib/batchWrite.ts`) writes the list in one request, and only if the
database refuses it does it write each row on its own. A refused multi-row
insert is one statement, so nothing in it landed and nothing is written twice.
A good import pays one request; one bad row costs one request per row and is
reported in `unresolvedLinks` with the database's reason, never swallowed.

**New extraction fields, and where each one lands:**

| Field | On | Lands as |
| --- | --- | --- |
| `location_name` | `ExtractedNpc` | `npcs.location_id` (fk_update) |
| `owner_npc_name` | `ExtractedLocation` | `locations.npc_owner_id` (fk_update) |
| `location_names` | `ExtractedFaction` | one `faction_locations` row per name (join_insert) |
| `location_name` | a quest beat | `quest_beats.staged_at_location_id` |
| `npc_names` / `faction_names` / `encounter_names` | a quest beat | one `quest_beat_attachments` row per name (`attachment_type: "npc"/"faction"/"encounter"`) |
| `monster_names` | a quest beat | a `quest_beat_attachments` row (`attachment_type: "monster"`) — **campaign rows only**, see below |
| `item_names` | a quest beat | a `loot_placements` row (`beat_id`+`quest_id` home, `kind: "item"`) — **campaign rows only**, see below |
| `item_names` | `ExtractedLocation` | a `loot_placements` row (`location_id` home, `kind: "item"`) — same shape, a room's OWN loot; see "A room's own loot lives in the room" below |
| `parent_name` | `ExtractedLocation` | `locations.parent_id` — **not** through this table. Resolved AT INSERT by `runLocationsImportKind`, not this linking phase — see the section below. |

The two new scalar fields (`npc_location_name` internally, to avoid colliding
with quest's own `location_name` in `LINK_TARGETS` — same reason
`encounter_location_name` exists; `owner_npc_name`) and the one new list field
(`location_names`, resolved by `resolveLinkLists`, importPlan.ts's new
counterpart to `resolveLinks` for a raw-name field that names *several* rows)
go through the exact same `EntityLinks`/`LINK_TARGETS` machinery every
pre-existing link already used — #893 only moved *when* that machinery runs,
not what it is. A beat's six cross-entity fields are new territory, since
nothing before them named several different kinds of thing from inside a
*beat* rather than from a top-level entity's own row.

**Why a beat's items are `loot_placements`, not a sixth `quest_beat_attachments`
type.** `loot_placements` already models "loot a beat holds until dispatched"
(#830) with exactly the `beat_id`+`quest_id` home a beat's item needs, and
reusing it means the DM sees an imported item exactly where a hand-placed one
would show up — the beat's own loot list, not a bare attachment chip with no
drop/claim behaviour. A generic `attachment_type: "item"` already exists on
`quest_beat_attachments` for other callers, but a beat's *extracted* loot
specifically goes through `loot_placements` (`kind: "item"`, `quantity: 1`,
`label` = the printed name) so it inherits the dispatch/claim machinery for
free.

**Only `monsters` and `items` have a shared library** (`match_import_entity_names`
never returns `source: "library"` for any other kind — verified against the
migration), and library rows are exactly where a beat's cross-reference can't
land structurally: `quest_beat_attachments`'s `validate_quest_beat_attachment`
trigger casts `ref_id::uuid` and checks the campaign's own `monsters`/`items`
table only, and `loot_placements.item_id` is a genuine `uuid` FK into `items`
— neither can ever hold a library row's stable **text** id. `quest_refs.ref_type`
also has no `"quest"`/`"spell"` member, so a beat's or the sweep's own
quest/spell references never produce a `quest_refs` row at all — that table
only ever names npc/location/monster/item/encounter/faction.

**A row the DM linked still gets the page's join rows.** A faction linked to an
existing one gets its `location_names` as `faction_locations` rows, exactly like
a created faction. Join rows are additive (the pair is unique, so a place it
already holds is a no-op). Scalar FKs on a *linked* row (`npcs.location_id`,
`locations.npc_owner_id`, …) are deliberately **not** written: that would
overwrite what the DM set on their own row.

### A guess opens itself; a fact stays closed

`reviewDecisions.ts`'s `needsDmChoice` decides which rows start expanded: more
than one candidate, or a single candidate that matched only on part of the name
or on meaning. "Silt Wraith" partially matches the library's "Wraith", a
different creature, and defaulting to it behind a closed row would be the silent
wrong-link this review exists to prevent. A single same-name match stays
collapsed. Its status chip already says what will happen.

### Choosing a library candidate references it

A beat naming a library-sourced monster or item attaches that library row
directly: the attachment's `ref_id`, the `quest_refs` row, an encounter
combatant's `monster_id` and a loot placement's `library_item_id` all hold the
library id (#954). Nothing is copied into the DM's own `monsters`/`items`.

**History, so it does not come back.** The first version of this feature
"adopted" a library pick: `adoptLibraryLinks` cloned the row into the DM's
vault through `useEnsureOwnedMonster`/`useEnsureOwnedItem` and rewrote the
decision to point at the copy, because `validate_quest_beat_attachment` and
`loot_placements.item_id` could only point at an own row. That is where the
production duplicates came from (#876 retired 591 of them on one account, and
eight `srd-2014 (customized)` monsters were minted by this importer in a
single week). Migration `20261003083553` taught those tables to hold a library
id, and the adoption step, its deps, its `adopted` counts and the "added from
library" copy were deleted rather than kept as a fallback.

**Accounting:** a library `link` tallies as `link` in `reviewDecisions.ts`'s
`tallyDecisions` and as `linked` in the sweep report. `rowsAddedToQuota` counts
only `create` and `generate`: a reference inserts no row, so it never consumes
plan room. `ImportEntityReviewRow.vue` labels a library candidate
`Uses library entry: <name>`.

**A reference resolves even if the book is later disabled** for the campaign.
Enabled sources govern what the review offers as candidates, not whether a
stored reference still exists.

**`quest_refs` for the whole sweep, not just what a beat named.** After the
linking phase, every entity across every kind that ended up created or linked
this sweep (skipping `ignore`d ones, and skipping `quests`/`spells` — no
`QuestRefType` member for either) gets one `quest_refs` row per quest this
sweep created, deduped by `(quest_id, ref_type, ref_id)`. A duplicate write
here is expected, not a bug: `quest_beat_attachments`'s own
`sync_quest_ref_from_beat_attachment` trigger already inserts the same row for
anything that became a beat attachment, `on conflict do nothing`; the sweep's
own insert is best-effort and simply absorbs the resulting unique-violation
the same way every other write in the linking phase absorbs a failure.

**A sweep that creates more than one quest** (the settings wizard, bulk-
importing a whole chapter) applies `parentQuestId` and reports `createdQuestId`
against the *first* quest it created, in `entities`' own order. The compact
paste review (#839, `parentQuestId`'s only real caller) never creates more
than one, so this only matters for the settings wizard, where nothing reads
`createdQuestId` today.

**Crash-resume still works, on a slightly weaker footing than before.** A kind
whose `imported_counts[kind]` is already set (a prior call already inserted
its rows) is skipped entirely on a resumed sweep — no re-insert, no re-count.
Its rows are real database rows by the time the linking phase runs, so
`fetchNameLookup` finds them exactly like any pre-existing campaign row would.
The one gap: a `link` decision for a *skipped* kind is still registered from
`decisions` alone (its target id needs no DB round-trip to know), but a
`create`/`generate` decision for a skipped kind is not re-added to the
registry from this call — the sweep has no way to learn which id a prior,
crashed call's insert actually produced without a query this design doesn't
add. In practice this only matters when two rows of that kind share a printed
name, since `fetchNameLookup` will otherwise find the right one by name alone.

### A location resolves its own parent AT INSERT, never in the linking phase

Every other deferred name reference goes through the sweep's one post-import
linking phase (above) — resolved once every kind has already been inserted.
`ExtractedLocation.parent_name` is the one exception, and production found out
why the hard way: `guard_location_room_parent`, a live `BEFORE INSERT` trigger
on `locations`, requires an interior row (`room`/`grounds`,
`private.location_is_interior`) to already carry a `parent_id` pointing at a
row that can hold one (the `site` tier — `building`/`dungeon`/`store`/`tavern`/
`inn`/`wilds`, `private.location_can_hold_rooms`) on the very insert that
creates it. The linking phase runs far too late for that column — it fires
after every kind, including `locations` itself, has already been inserted with
`parent_id: null`, so a keyed room's insert hit the trigger and every one of
them 400'd (`"M1. Tool Room" has no parent`).

**The fix: `locations` gets its own insert runner**, `runLocationsImportKind`
(`runImportKind.ts`), called by `importSweep.ts` instead of the generic
`runImportKind` for this one kind. It does two things the generic runner
doesn't:

1. **Orders this kind's own creates parents-first** — `orderLocationsParentsFirst`,
   a stable topological sort over the batch by matching `parent_name` against
   other entities' `name` (via `normalizeEntityName`, same as every other name
   match in this feature). A room whose dungeon is elsewhere on the same page,
   in *either* page order, is reordered so the dungeon is attempted first. A
   parent cycle or a self-reference never hangs the sort — once nothing left
   is ready, whatever remains is appended in original order and reported
   unresolved below, rather than spun on forever.
2. **Resolves each row's `parent_name` immediately before that row's own
   insert** — against a map that grows as rows land in this same batch, then
   `existingLocations` (`fetchNameLookup("locations")`, fetched once up front
   and extended with `location_type` for exactly this reason — the one place
   `NameLookupRow.locationType` is ever populated). A `link`-decided sibling's
   target is already inside `existingLocations` by construction, so no special
   case is needed for it.

**An interior row with no resolvable holder parent — none named, or named
something that turns out not to be one (a `town`, say) — is not dropped and
not left to fail the trigger.** It's imported anyway as `location_type: "other"`
(a type the trigger never constrains), and the sweep pushes a line to
`unresolvedLinks` explaining why: `Location "M1. Tool Room": no building,
dungeon, store, tavern, inn or wilds to sit in on this page, so it was
imported as "other".` The site-type list in that message is derived from
`LOCATION_TYPE_TIER` (`src/lib/locations/tiers.ts`), not hand-typed, so it
cannot drift from `isSiteType`'s own definition. A **non-interior** location
with a resolvable parent still gets it written normally — the guard, and this
whole detour, only ever applies to `room`/`grounds`.

`EntityLinks` (normalize.ts) no longer declares `parent_name` at all, and
`LINK_TARGETS` (importPlan.ts) has no entry for it — removed together, since a
field resolved before insert has nothing left to resolve a second time in the
post-import phase. `mapExtractedLocation` still leaves `row.parent_id: null`
(it has no database lookup to resolve it with); `runLocationsImportKind`
overwrites that field itself, immediately before each row's insert.

**Root cause upstream, fixed at the source too:** the room-parent 400s traced
back to `LOCATION_DATA.location_type` (`supabase/functions/import-extract/extractionSchema.ts`)
being an unconstrained nullable string. A real production extraction returned
free-text types the model invented — "mine", "mine room", "mountain",
"underground region" — none of which `resolveEnum` (normalize.ts) can match,
so every one of them silently became `other` before a single row was even
inserted, and `other` can never hold a room regardless of how good the parent
resolution above is. The wire schema now constrains `location_type` to the
real 19-member `location_type_enum` (verified live), hand-copied into
`extractionSchema.ts` as `LOCATION_TYPE_ENUM` since that module is Deno and
cannot import `tiers.ts`; `extractionSchemaLocationTypes.test.ts`
(src/lib/documentImport/) pins the copy equal to `LOCATION_TYPE_TIER`'s keys
so the two can't drift apart again.

**A room's parent can be a container the DM LINKED under a different printed
name.** A real production case: the page's own container "Termalaine Gem
Mine" was linked by the DM to their existing "Gem Mine" (a `dungeon`) — the
container itself is never inserted (a `link` decision produces no row), so it
never appears in `batchResolved`, and its *printed* name doesn't match
`existingLocations` either (only the target row's own name, "Gem Mine", is in
there). Every room in that mine was silently downgraded to `location_type:
"other"` for lack of a resolvable parent, even though the DM had, in fact,
already told the importer exactly where the mine lived.

The fix: `runLocationsImportKind` also builds `buildLinkedLocationCandidates`
— one candidate per this batch's own `locations` `link` decision, keyed by
the **linked entity's own printed name** ("Termalaine Gem Mine"), pointing at
the target's real id and `location_type` (looked up in `existingLocations` by
id, since a `link` candidate's `targetId` is always one of those rows). A
room's `parent_name` now resolves against, in order: this batch's own
inserted rows, then this batch's own `link` decisions, then `existingLocations`
by the target's own name — the same "linked rows win" precedence the sweep's
post-import linking phase already uses everywhere else.

### A room's own loot lives in the room

`ExtractedLocation.item_names` (mirroring a beat's own `item_names`) is loot
the page found in a keyed room — treasure in a chest, a weapon on a corpse.
Per the design (context/features/quests.md, quoting the Sites sheet): a
dungeon's loot lives in the room that holds it, not on the beat staged at the
site as a whole. Resolved in the sweep's linking phase into a `location_id`-
homed `loot_placements` row per name (`kind: "item"`), through the same
`attachItemLoot` helper (`importSweepLinking.ts`) a beat's own `item_names`
already used — parameterised by `LootPlacementHome` (`{ beat_id, quest_id }`
or `{ location_id }`) rather than duplicated into two write paths. A name
resolving to a shared-library row is placed by reference, in
`library_item_id` (#954), exactly as a beat's item is; the runner splits the
picked id into the right column. A placement the database refuses (a library
entry removed since review, for one) is reported in `unresolvedLinks` with the
reason rather than dropped, like every other reference write in the linking
phase.

**Resolved against the sweep-wide `locations` registry, not a phase-1
context list.** `importSweep.ts` walks every `locations` entity after the
whole sweep has imported, looks its own printed name up in
`registry.locations` (already "create/generate/link'd entity's name → its
resolved id," built while the `locations` kind imported), and only builds a
`LocationLootContext` when that lookup lands — an ignored, undecided, or
(the same documented resume gap `buildKindRegistry` already carries) crashed-
before-registering room contributes no loot, the same "absence is not
consent" rule as everywhere else in this sweep. A room the DM **linked** to
an existing one still gets the page's loot — additive, like a linked
faction's `location_names` — since the registry doesn't distinguish how a row
was resolved once it has an id.

### A beat does not re-list what its site's rooms already hold

A beat staged at a site (or one of its rooms) must not re-list an encounter
or an item its own room structure already supplies — "a dungeon needs no
beats inside it… rooms are places, not events," and a room's fights/loot
belong to the room (`encounters.location_id`, `loot_placements.location_id`),
not to a beat that covers the whole site.

`importSweep.ts` builds a `SiteRoomIndex` (`importSweepLinking.ts`) once
per sweep, from this batch's own `locations` entities and the ids the
registry gave them — `buildSiteRoomIndex` matches `parent_name` to another
entity's own `name` the same way `orderLocationsParentsFirst`/
`runLocationsImportKind` do, **never** a database query: the whole point is
"what did this import's own page wire together," not the campaign's full
location tree, which a beat staged at an unrelated pre-existing location has
no business reaching into. A location with no known site/room relationship
in this sweep (an isolated location, one this sweep didn't touch) appears in
neither map, so no skip ever applies to a beat staged there — this is why
"Tavern Brawl" still attaches to a beat staged at a plain tavern with no
rooms of its own, even though it's staged at that same exact location.

`resolveBeatCrossReferences` computes, per beat, the site + all its rooms
(`null` when the staged location is neither — every reference then resolves
exactly as it always did) and skips silently (no `unresolvedLinks` entry —
this is a design decision, not a failure):

- an `encounter_names` entry whose own resolved `location_id` (captured from
  the earlier `encounters` pass of `resolveLinks`, since an encounter's own
  id says nothing about where it's staged) falls inside that set;
- an `item_names` entry whose resolved item id was already placed as one of
  the site's own rooms' loot — `resolveLocationLoot` (which runs *before* the
  beat pass, on purpose) records `(locationId, itemId)` pairs into
  `roomLootByLocation` as each placement lands, and the beat pass consults it.

Everything else — an encounter or item genuinely staged/found elsewhere —
attaches to the beat exactly as it always has.

### "Source book" for created items, monsters and spells

Before this the importer always wrote `source: null` on a created item,
monster or spell — every row an import created carried no book at all, unlike
the maintainer's own content (`source` = the book title, e.g. "Icewind Dale:
Rime of the Frostmaiden") or an AI-generated monster (`source: "Grimoire:AI"`,
set by `useGenerateMonster.ts` and left alone here — a generated monster is
invented, not sourced from this document).

`ImportSweepInput.sourceTitle: string | null` carries the DM's typed title for
the whole sweep, normalized (`normalizeSourceTitle` — trimmed, empty → `null`)
before it ever reaches `runImportSweep`. It's threaded — never read from
module state — through `runImportKind` → `buildImportPlan` → `mapEntity` down
to the three mappers that have a `source` column at all (`mapExtractedMonster`/
`mapExtractedItem`/`mapExtractedSpell`); every other mapper simply has an
unused trailing parameter, the same as it already ignores whichever of its
neighbours' parameters it has no use for. Only a `create`-decided row is
affected — a `link`ed row keeps whatever source it already had, and a
`generate`d monster keeps `Grimoire:AI`.

**The field itself is a DM-typed value with suggestions, not a picker over a
fixed enum** — `AppInput` with a native `<datalist>`, the same "free-text
label with suggestions" idiom `ThemeInput.vue` already established for audio
themes (`EntityCombobox` only ever resolves to an *existing row's id*, which a
brand-new book title is not). Shown only when `hasSourcedCreate` says the
review would actually create at least one monster/item/spell — a review that
only links/generates/ignores has nothing for the field to attach to.
`useImportSourceOptions.ts` supplies the suggestion list and the prefill: the
DM's own **non-library** `source` values (`open5e_import = false` and
`source_document_key is null` — `items` has no `open5e_import` column at all,
so only the second half of that filter applies there) across `monsters`/
`items`/`spells`, ranked by how many rows use them. The prefill is the
most-used title *within the campaign being imported into*, falling back to
the most-used title overall (a DM's global rows, or another campaign's),
falling back to an empty field — seeded exactly once, the moment that query
settles, so a DM who clears the field or types their own title isn't fought
by a reactive re-seed.

### One quest, compact review (#839)

Pasting a page was originally reachable only from Campaign Settings, behind a
title ("Document Import") and a seven-then-eight-step wizard. Fine for "I have
a chapter PDF"; wrong for "I'm looking at my quest list and want to add this
one" — the common case, and what #829 was actually built for. #839 adds a
second door: `/quests/new`'s "Paste a page" mode
(`QuestPasteImportPanel.vue`), a `SegmentedControl` option inside
`QuestFlowStarter.vue` alongside typing a quest by hand.

**Same extraction, not a second contract.** The paste box, the `document_imports`
row, the extraction call, the mappers, `buildImportPlan`, `writeQuestSpine`,
the link resolvers — none of it forked. What changed is the review: instead of
a step per `IMPORT_ENTITY_KINDS` entry, the DM sees the extracted quest as the
headline (its own title/premise editor — a quest always defaults to `create`,
see `defaultDecision` above, so it never goes through the accordion — a beat
count, a caution line when the campaign already has a same-titled quest, and a
note when the page described more than one quest, only the first used) plus
one `ImportKindReview` group per other kind the page yielded, exactly the
same link/create/generate/ignore choice the settings wizard offers.

**The shared logic moved so it has exactly one copy.** `DocumentImportWizard.vue`'s
`runImport()` used to own the insert loop, link resolution, quest-spine write
and encounter combatant resolution inline. That's now `runImportKind.ts` +
`importSweep.ts` (pure, deps injected — same shape as `spineWrite.ts`) plus
`useDocumentImportRunner.ts` (the Supabase wiring for those deps). Both review
surfaces call one `runImportSweep(importRow, input, onProgress)` — the wizard
lets the DM step through every kind before running it once at the end, the
compact review runs it once per confirm, covering every kind it has anything to
do at once. `sanitizeEntities.ts` (dropping a malformed extracted entity) moved
out the same way, for the same reason.

**One import in flight per campaign, enforced by convention, not the schema.**
Nothing in the database stops two `document_imports` rows from being
`pending`/`extracting`/`review` at once, but every reader (`useActiveDocumentImport`,
ordered by `created_at desc`, `limit(1)`) only ever shows the newest one. So
`QuestPasteImportPanel.vue` refuses to start a *second* paste while the query
already returns a row — it shows that row's name and points the DM at
Document Import instead — rather than risk silently orphaning whatever the
DM had in flight there. Its own row is tracked locally (`myRowId`, mirrored to
`sessionStorage` so a reload or a mode-switch back to "Type it" and back still
resumes it); a hard refresh mid-extraction loses that and the DM is sent to
Document Import to finish the same row there instead — accepted, not a bug,
for a flow meant to be finished in one sitting.

**The compact review offers the full per-entity decision, not a shortcut.**
This used to be a wizard-only feature — the compact review filled `decisions`
with a bare `{ action: "create" }` for every toggled-on entity and never
offered linking at all. That gap closed the moment `ImportKindReview.vue` +
`ImportEntityReviewRow.vue` became shared components: both surfaces now seed
`defaultDecision` from the same `import-match` candidates
(`useImportEntityMatches.ts`) and let the DM link/create/generate/ignore each
entity identically. The only thing still exclusive to the compact review is
the headline-quest treatment itself (its own title/premise fields, no
accordion) — everything *else* the page yields is reviewed exactly like a
wizard step.

**A quest created here that already had a parent id** (a sub-quest, via
`QuestFlowStarter`'s own `parentId` prop) is handled by the sweep itself —
`ImportSweepInput.parentQuestId` is threaded through to `runImportSweep`,
which applies it to the first quest it creates (`updateQuestParent` dep).
`mapExtractedQuest` always produces `parent_quest_id: null` on the raw insert,
correctly, since a printed page has no way to know it is being imported as
anyone's sub-quest — the sweep is what turns that into the real parent link.

### `import-documents` is NOT in the `BUCKETS` registry

Deliberate. `src/lib/storage/buckets.ts` has tests asserting every registered
bucket is CDN-fronted **and** R2-backed; a private, transient bucket is neither.
`tile-packs` and `downtime-images` sit outside for the same reason. Uploads call
`supabase.storage.from("import-documents")` directly — registering it turns three
green tests red.

### Deleting a campaign removes an in-review import's pages (#963)

`disposeHomebrewAndDeleteCampaign` reads the caller's `document_imports.source_paths` for the campaign before the delete RPC (`campaignImportSourcePaths`, `src/lib/campaign/campaignFiles.ts`) and removes them from `import-documents` once it succeeds, reporting a storage failure rather than failing the delete. Extraction and discard already remove pages; this covers an import still in review when the campaign goes.

### `document_model` is separate from `text_model`

Reading a document is a distinct capability, exactly as `image_model` is. The
values may coincide; the column exists so they need not. On Anthropic they
diverge: `text_model` is `claude-haiku-4-5`, and reading a whole module is left
to `document_model`, `claude-opus-5`.

### `IMPORT_ENTITY_KINDS` order used to be a dependency order — #893 lifted that

Before #893, a kind had to be imported after everything its links pointed at,
because the wizard resolved each kind's links immediately, against whatever
rows existed at that moment. `factions` led for exactly that reason — NPCs
carry `faction_name`. An earlier revision put `factions` last, which reads
more naturally, and the consequence was that an NPC's faction link **could
never resolve** — no error, no warning, silently dropped every time.

`runImportSweep`'s single post-import linking phase (see "One sweep, one
linking phase" above) removed the constraint itself: a link can resolve
against a kind that imports *later* now (an NPC's `location_name`, a beat's
`encounter_names`). The order is unchanged and still fixed — `dependencyOrder.test.ts`
still pins `factions` before `npcs` and `encounters` last, as the two
pairings a past reordering actually got wrong — but it stays fixed for
deterministic per-kind quota accounting and a stable wizard step order now,
not because reordering it would silently drop a link again.

### Failed imports keep their uploaded document

Deleted on `review` (the document has been consumed into something reviewable),
kept on `failed`. An extraction fails for reasons that have nothing to do with the
document — a provider 500, a storage blip, a malformed response — and deleting the
upload turns a retry into a re-upload **and a second charge**. Observed for real
during the first live run.

That retained upload is what the tab's **Retry extraction** button spends, which
is why the button disappears once `expires_at` has passed: the source has been
collected by then and a retry would fail on a missing object.

### Cleanup runs on two clocks, and neither is the obvious one (#769)

| Failure | Signal | Who fixes it |
| --- | --- | --- |
| The worker died mid-extraction | `extracting` for >15 min, from `updated_at` | `sweep-stranded-document-imports` cron |
| Nobody is coming back | past `expires_at` (24h) | `collectExpiredImports` in `import-extract` |

Issue #769 proposed one sweep over `expires_at`. Built that way it would not fix the
complaint it opens with — a DM whose extraction crashed after four seconds would
still watch a spinner for the rest of the day. Liveness is a foreground concern
and wants minutes; retention is a background one and wants a day.

**The cron deliberately deletes no storage object.** Supabase's guidance is
explicit that removing a `storage.objects` row in SQL orphans the bytes in S3 —
strictly worse than leaving them, because `source_paths` still points at the blob
and the owner, the extractor and the erasure path can all reach it. Collection
needs a Storage API client, so it lives in the edge function.

**The collector is opportunistic, not scheduled**, and that is the deliberate
part. The repo's cron→edge shape (`poll-meshy-jobs`) needs a URL and a token in
`vault` plus an env var on the function; this database holds one vault row, so
that job has been scheduled, active and doing nothing since July. Piggybacking on
the only code path that creates these objects needs no provisioning. The cost:
a quiet month leaves an expired upload in the bucket until the next import.

`review` and `extracting` are excluded from collection — the first has no objects
left and holds paid-for work, the second may be running right now.

Returning a row to `pending` pushes `expires_at` forward, in a **trigger** rather
than in whichever client issues the retry. Without it a document retried on day
two is already expired the moment it restarts.

### Page photos are downscaled before upload

`downscale.ts` caps the long edge at 1600px and re-encodes at JPEG q0.82. Three
limits make it necessary rather than tidy: Storage's size limit is per object so a
batch is otherwise unbounded; every part is base64'd into one provider request;
and at `detail: "high"` the model tiles at 512px and charges per tile, so cost
scales with *dimensions*, not file size.

The per-object cap (25 MB, `MAX_UPLOAD_BYTES`) mirrors the bucket and is a real
database constraint. The per-import cap (40 MB, `MAX_IMPORT_BYTES`) is a different
question and deliberately a different number — reusing the 25 MB figure for both
made the page caps unreachable, since at 2–5 MB a raw photo even ten of them blew
past it and the free tier could not fill its own page allowance.

### `source_paths` is constrained in RLS, and that is a security fix

`document_imports.source_paths` is client-written, and the edge function reads it
with the **service-role** client, which bypasses storage RLS by design. Without
`private.paths_under_caller_prefix` a user could name another user's object and
have the function read it out and then delete it. Guarded in code *and* in the
INSERT **and UPDATE** policies (the original UPDATE policy had no `WITH CHECK`, so
constraining INSERT alone was bypassable). Regression cover in
`supabase/tests/document_import_source_paths.test.sql`.

---

## Quota behaviour

Six kinds are quota-limited (`monsters`, `npcs`, `locations`, `quests`,
`factions`, `encounters`); `items` and `spells` are not. `enforce_quota` is a
**BEFORE INSERT trigger**, so a free user importing forty monsters gets some
rows and then a throw *partway*.

Rows are therefore inserted **one at a time** — a single batched insert cannot say
which landed — and `buildImportRunReport` distinguishes *imported* / *refused* /
*never attempted*, so the DM is told "twelve of forty, stopped at your monster
limit" rather than "failed".

**That report is the backstop, not the design.** A sweep that stops at a quota
has already landed half the page, and every link into the rows that did not
land is left dangling. So both review surfaces check *before* confirm:
`useImportQuotaRoom` (one `check_all_quotas` call) against
`reviewDecisions.ts`'s `rowsAddedToQuota` / `quotaShortfalls`, and
`ImportQuotaWarning` names each kind that would run over. Confirm stays disabled
until the choices fit. `rowsAddedToQuota` counts creates and generations only:
a link, to the DM's own row or to a library entry, is a reference and inserts
nothing (#954). Found by running the fixture on the free plan: 0 of 2
monsters, 2 of 6 NPCs and 0 of 6 locations landed, and seventeen links were
reported unresolved.

---

## Cost, and how to re-derive it

Charged as `document_import_extraction` (base) + `document_import_page` ×
`page_count`. Per-page because the input is a document, not a prompt.

Measured 24 Aug 2026 on a real four-page card deck:

| model | input tokens | output tokens | cost |
| --- | --- | --- | --- |
| `gpt-4o-mini` | 59,436 | 1,003 | $0.0095 |
| `gpt-5.6-luna` | 4,307 | 2,068 | $0.0033 |

**The rate is the least interesting half of the calculation.** Luna costs more per
token and is ~3× cheaper per import, because `gpt-4o-mini` rasterises every page
at `detail: "high"` — ~14,900 tokens/page against luna's ~1,080. Luna was also
100% accurate where mini mis-filed a damage resistance as an immunity.

That token rate is what makes the page caps safe: at mini's rate, its 128k context
holds ~8 pages, so the 10-page **free** cap would have failed outright.

Re-derive from `get_credit_calibration_hints` against real imports rather than
from a rate card. A denser or longer document may move the count again.

---

## Verifying a change

Unit tests cover the pure logic. For the rest, the local stack runs the whole
thing — see #353 for the full recipe:

1. `npm run db:start && npm run dev:auth && npm run dev`
2. Put a provider key in `supabase/functions/.env`, then
   `npx tsx --tsconfig tsconfig.node.json scripts/local-provider-key.ts`
3. `supabase functions serve --env-file supabase/functions/.env`
4. Sign in as **`dm-fixture@example.invalid`** — the importer is DM-gated, and
   per #736 the admin account is not a representative reader.

To exercise the wizard without spending anything, insert a `document_imports` row
with `status = 'review'` and hand-written `extracted` jsonb. That covers the whole
review-and-import path including the quota trigger. The same trick exercises the
compact review at `/quests/new` → "Paste a page" — it reads the same table, so a
row with an `extracted.quests` entry lands it on the headline-quest view.
