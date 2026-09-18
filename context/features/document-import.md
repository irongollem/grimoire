# Document Import

A DM supplies source material — a PDF, a batch of page photos, or **text pasted
straight in** — an AI pass extracts game entities from it, and an eight-step
wizard reviews every entity before anything reaches a content table. **DM-only**
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
| `runImportKind.ts` | One kind's insert/generate loop — with every side effect injected (`RunImportKindDeps`) — now called by `importSweep.ts` rather than by either UI directly |
| `importSweep.ts` (#893) | `runImportSweep` — every kind imports first, then ONE linking phase resolves every name reference across the whole extraction (a link to a kind that imports *later*, e.g. an NPC's `location_name`, could never resolve under the old per-kind resolution). Owns the sweep-wide `normalizeEntityName → { id, source }` registry, the beat-attachment/loot/quest-ref writes a beat's resolved references produce, and marking the row complete |
| `questPasteReview.ts` | Pure helpers for the compact review only: pick the headline quest, summarize the other kinds found, derive a default staging-row name |

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
own AI-generation panel. `useMonsters.ts`'s `useEnsureOwnedMonster` and
`useItems.ts`'s `useEnsureOwnedItem` are the idempotent get-or-create
adoptions `useDocumentImportRunner.ts`'s `adoptLibraryMonster`/`adoptLibraryItem`
deps call — see "Choosing a library candidate ADOPTS it" below.

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
`QuestPasteImportPanel.vue` in `src/components/quests/`).

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

### Pasting is a third source kind, and the box is rich text on purpose (#829)

`source_kind` is `pdf | images | text`. A pasted import carries no storage object
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
exact normalized match ahead of a whole-word "contains" one — the same
own-vault-first reasoning #837 already established for monsters. `EntityCandidate.source`
is `"campaign"` or `"library"`; `matchKind` is `"exact"` | `"contains"` (name
tier) | `"similar"` (embedding tier, carrying a cosine `distance`).

**The normalizer is now shared between two runtimes, not duplicated by feel.**
`private.normalize_entity_name` (SQL) and `entityName.ts`'s `normalizeEntityName`
(TypeScript) are the same algorithm, ported term-for-term: lowercase, trim, drop
a leading article, de-pluralise the trailing word **and** the head noun of an
"X of Y" name (`"Potions of Healing"` → `"Potion of Healing"`). Both `importPlan.ts`'s
`findByName` and `normalize.ts`'s `findEncounterCandidateByName` route through
it now, which is what makes "Blue Clam" (a page's raw heading) find "The Blue
Clam" (a hand-created row) — the old plain-lowercase match never could, since
it never stripped the article.

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
narrow — the name tier's whole-word "contains" anchor covers what occurs in
practice, and the embedding tier covers the rest.

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

### Choosing a library candidate ADOPTS it — it doesn't just link to it

Before this, a beat naming a library-sourced monster or item was linked at
the quest level only (`quest_refs`) and reported in `unresolvedLinks` as
unattachable — correct as far as it went, but it meant most monsters and most
loot of a normal adventure landed nowhere a beat, an encounter, or a loot
list could actually show them, because the DM's `monsters`/`items` review
step defaults to `link`-ing an extracted creature or item straight to the
matching library row. The maintainer's framing: every resource this importer
touches should be "good, and properly linked to the other resources made
here" — a `quest_refs` pointer to a row the beat can't display isn't that.

**The fix: choosing a library candidate for a `monsters`/`items` entity now
means "add it from the library."** `importSweep.ts`'s `adoptLibraryLinks`
runs once per kind, before the sweep-wide registry is built, and for every
`link` decision whose candidate is `source: "library"` it copies that row
into the DM's own content — via `useMonsters.ts`'s `useEnsureOwnedMonster` /
`useItems.ts`'s `useEnsureOwnedItem`, the exact "own a copy" idiom the app
already uses everywhere else a DM reuses shared content — and rewrites the
decision to point at the new owned row (`source: "campaign"`) before anything
else ever reads it. Every downstream consumer — the registry, beat
attachments, loot placements, `quest_refs`, encounter combatants — then sees
an ordinary campaign row and needs no library special case at all.

**Both adoption paths are idempotent get-or-create, keyed on source
identity** (`(user_id, source_document_key, source_record_key)` — a real
unique index on both `monsters` and `items`), so a second sweep, or a beat's
own reference to a monster/item the top-level review already adopted, reuses
the same owned row rather than adopting twice. Next time the same document
(or a different one naming the same library entity) is imported, the name
matcher ranks the DM's own copy above the library row, so there is no repeat
adoption to make.

**Adopted monsters are always global (`campaign_id: null`), never scoped to
the importing campaign — unlike `useCloneLibraryMonster`'s manual "Customize"
clone, which stays scoped to the DM's active campaign.** This is a deliberate
difference, not an inconsistency: `monsters_source_identity_unique` is
`(user_id, source_document_key, source_record_key)` with **no** `campaign_id`
column, so a DM can only ever own one copy of a given library monster, full
stop, across every campaign. Scoping the copy to "the importing campaign"
would make a second import — a different campaign, or a re-run of this one —
collide with that constraint the moment it named the same monster again, and
would fail `validate_quest_beat_attachment`'s null-campaign branch the moment
a *later* campaign's import tried to attach the very same copy to one of its
own beats. `campaign_id: null` is already this app's own meaning for "the
DM's, available in every campaign" (`Monster.campaign_id`'s own doc comment),
exactly the shape `fetchNameLookup`'s `KINDS_WITH_GLOBAL_ROWS` already
understands as "a personal monster used everywhere," and exactly what
`useEnsureOwnedItem` already does for the identical items case — items have
no such tension since `campaign_id: null` was already their only behaviour.

**A link that fails to adopt — a real error, or a quota refusal — falls back
to exactly the pre-adoption behaviour**, unchanged: the decision keeps
pointing at the library candidate, the registry still resolves it at the
`quest_refs` level, and a beat/loot reference to it is still reported in
`unresolvedLinks` as unattachable. Nothing here is ever silently dropped —
`adoptLibraryLinks` itself reports *why* the adoption didn't happen (the
underlying error message, or "your monster limit stopped this from being
added from the library") as a **separate** `unresolvedLinks` line from the
beat's own "can't attach a library row" line, since they explain two
different facts. A quota refusal (monsters only — `items`/`spells` have no
`enforce_quota` trigger at all, so `adoptLibraryItem` can in practice never
return `quota_exceeded`) stops further *adoption* attempts for that kind for
the rest of the sweep, the same way a mid-batch quota refusal already stops
further `create`/`generate` attempts in `runImportKind.ts`.

**Accounting:** `ImportKindOutcome.adopted` counts successful adoptions,
separately from `linked` (which keeps meaning "linked to a row the DM
already owned before this sweep ran"). The review-time mirror is
`reviewDecisions.ts`'s `tallyDecisions`, whose `adopt` bucket is a `link`
decision whose candidate is `source: "library"` — computed straight off the
decision, since nothing has run yet at review time. Both wizards' summary/tally
lines, and `ImportEntityReviewRow.vue`'s per-entity status and candidate
option text, say "add(ed) from library" rather than "link(s) to library"
wherever a library candidate is involved, and give it a distinct status tone
— it is a different action from reusing a row the DM already owns, not a
wording nuance.

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

### `document_model` is separate from `text_model`

Reading a document is a distinct capability, exactly as `image_model` is. The
values may coincide; the column exists so they need not. On Anthropic they
diverge sharply — `text_model` is `claude-haiku-3-20240307`, which cannot read a
PDF at all.

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

#769 proposed one sweep over `expires_at`. Built that way it would not fix the
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
until the choices fit. `rowsAddedToQuota` counts creates and generations, plus
library adoptions for monsters (a copy is a monster row). That is an upper
bound, because an adoption the DM already owns inserts nothing, and erring high
is the safe side here. Found by running the fixture on the free plan: 0 of 2
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
