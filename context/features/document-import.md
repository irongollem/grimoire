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
| Review | One step per entity kind — select, edit, import or skip | `DocumentImportWizard.vue` |
| Link | Second pass resolves cross-entity references by name | `importPlan.ts` |

Eight kinds, in **dependency order** (`IMPORT_ENTITY_KINDS`):
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
| `importPlan.ts` | Selection → ordered inserts, partial-failure accounting, link resolution |
| `sanitizeEntities.ts` | Validates one kind's raw `extracted[kind]` array into renderable entities, dropping malformed ones — shared by the wizard and the compact review (#839) |
| `runImportKind.ts` | One kind's full run — insert loop, link resolution, quest-spine write, encounter combatant resolution — with every side effect injected (`RunImportKindDeps`), so both review surfaces share this instead of forking it (#839) |
| `questPasteReview.ts` | Pure helpers for the compact review only: pick the headline quest, summarize the other kinds found, derive a default staging-row name |

**Composable** (`src/composables/campaign/`) — `useDocumentImportRunner.ts` is
`runImportKind.ts`'s Supabase-backed half (real inserts, lookups, RPC calls);
`DocumentImportWizard.vue` and `QuestPasteImportPanel.vue` both call its
`runKind`/`finalizeImport` rather than each wiring their own.

**UI** (`src/components/campaign/`) — `DocumentImportTab.vue`,
`DocumentImportWizard.vue`, `DocumentImportEntityCard.vue` (one generic card
driven by field shape, not eight per-kind templates), `DocumentImportPasteStep.vue`
(the settings paste source step) and `DocumentPasteEditor.vue` (the rich
paste-capture box itself, shared with `QuestPasteImportPanel.vue` in
`src/components/quests/`).

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

### An extracted creature or item links to what you already own (#837, #838)

The importer used to create every entity fresh, so a DM who owned a "Giant Rat"
got a second one — and an extracted creature had **no stat block at all**, because
an adventure prints the name and refers you to an appendix. In a digital edition
that name is a link, and a link does not survive a paste. The row it created was
unusable: no AC, no HP, no actions, so it could not go into an encounter, which is
the thing a DM imports a dungeon chapter *to do*.

Two RPCs resolve a name against what the app already holds:

```
public.resolve_monster_references(p_campaign_id uuid, p_names text[])
public.resolve_item_references(p_campaign_id uuid, p_names text[])
```

**The caller's own vault first, then the shared library.** That order is
correctness, not preference: a DM who has already built their own grell wants
*theirs*, with their notes and art. A campaign hit fills the uuid column, a
library hit the text one — shared content is keyed by a stable text id
(`srd_owlbear`-style), so the two cannot share a column. An unmatched name is
simply **absent**, which the importer reads as "create it fresh".

**Name matching, not vectors — and that is deliberate.** Both corpora are 100%
embedded and a similarity search is the obvious reach. Measured on a real
chapter, a plain name match resolved **seven creatures out of seven**: three from
the library, four from the DM's own vault, including a book-specific "Icewind
Kobold" and a typo'd "Mind FLayer". It costs nothing, needs no embedding call
before the lookup, and is legible — a DM reviewing "we matched your grell" can
see why. Vectors remain the fallback for a renamed variant, and belong in the
edge function where an embedding can be computed.

The normalisation is `private.normalize_entity_name` and is deliberately naive —
a lookup key, not an English stemmer. It drops a leading article, de-pluralises
the last word **and** the head noun of an "X of Y" name (`"Potions of healing"` →
`Potion of Healing`, which is how most magic items are named), and matches a
qualifier through a **whole-word suffix anchor** so `"Icewind kobold"` finds
`Kobold` while `"rat"` never finds `"pirate"`. A wrong singularisation costs a
missed match, never a wrong one.

**No `pg_trgm`.** Fuzzy matching would want it and the advisor baseline already
carries one `extension_in_public` finding not worth growing for a match this
narrow.

In the wizard, a matched entity links **by default**, with a per-entity checkbox
to create fresh instead. A linked entity produces **no insert at all** —
`buildImportPlan` drops it before planning — so it cannot duplicate and never
touches quota, and the result reads "3 created, 4 linked" rather than folding the
linked ones into a smaller-looking number.

On the same chapter, all five extracted *items* correctly resolved to nothing:
tourmalines, a geode and a carved figurine are chapter-specific and genuinely
new. "Rock dog figurine" did **not** match "Figurine of Wondrous Power", which a
looser matcher would have.

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

**Combatant resolution is a second pass `runImportKind.ts` runs, not
`resolveLinks`.** `EntityLinks`/`LINK_TARGETS` (importPlan.ts) give every named
field exactly one fixed target table — which is why `encounter_location_name`
is its own `EntityLinks` field rather than reusing quests' `location_name` (a
different FK column, `encounters.location_id` vs `quests.location_id`). A
combatant name has no *single* fixed target at all: it might resolve against
this campaign's `npcs` (a named individual, tried first — more specific than a
creature kind) or against `monsters`/`library_monsters` via
`resolve_monster_references` (#837). `normalize.ts`'s `mapExtractedEncounter`
builds every combatant slot with its name preserved as `custom_name` and both
ids null; `resolveEncounterCombatants` is the pure second-pass resolver,
called from `runImportKind`'s own `kind === "encounters"` branch once it has
fetched both candidate sets (through the injected `resolveMonsterNames`/
`fetchNameLookup` deps — see the "One quest, compact review" section below for
why this moved out of `DocumentImportWizard.vue` itself) — the same "resolve
after the row exists" idiom as an FK link, just for an array field instead of
a scalar column.

A combatant matching neither stays in the row as a named stub (both ids null,
`custom_name` kept) — never silently dropped — and its name is surfaced in the
same "couldn't match a reference to…" banner an unresolved FK link uses. The
DM links it by hand in the encounter's own combatant search afterward.

**The prompt had to be taught the eighth kind explicitly** (migration
`20260907000546`) — a JSON Schema property and a TypeScript type teach the
*wizard* that encounters exist, but the extractor only knows what its system
prompt (a database row, not code) tells it to look for. Without the rewrite it
kept returning exactly the seven kinds it always had.

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
headline (editable title + premise, a beat count, a note when the page
described more than one quest — only the first is used, the rest wait for the
full wizard) plus **one** block of per-kind checkboxes for everything else the
page yielded ("18 Locations", "11 NPCs", …), defaulted **on**. Unticking
everything but leaves just the quest; two clicks either way.

**The shared logic moved so it has exactly one copy.** `DocumentImportWizard.vue`'s
`runImport()` used to own the insert loop, link resolution, quest-spine write
and encounter combatant resolution inline. That's now `runImportKind.ts`
(pure, deps injected — same shape as `spineWrite.ts`) plus
`useDocumentImportRunner.ts` (the Supabase wiring for those deps). Both
review surfaces call `runKind`; the wizard runs it once per step the DM
confirms, the compact review runs it once per kind it has anything to do,
in `IMPORT_ENTITY_KINDS` order, inside one confirm action. `sanitizeEntities.ts`
(dropping a malformed extracted entity) moved out the same way, for the same
reason.

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

**No per-entity link-to-existing choice in the compact review.** #837/#838's
"this monster already exists, link instead of duplicating" is a wizard-only
feature — `runImportKind`'s `linkedRefs` parameter is simply always empty from
the compact review, so every toggled-on entity is created fresh. A DM who
wants that de-duplication has the full wizard; the compact review optimizes
for speed on the common single-quest case, and a possible duplicate monster
is a smaller cost than a review surface with a per-entity decision on it.

**A quest created here that already had a parent id** (a sub-quest, via
`QuestFlowStarter`'s own `parentId` prop) gets a follow-up
`update({ parent_quest_id })` after `runKind` inserts it — `mapExtractedQuest`
always produces `parent_quest_id: null`, correctly, since a printed page has
no way to know it is being imported as anyone's sub-quest.

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

### `IMPORT_ENTITY_KINDS` order is a dependency order, not a presentation choice

A kind must be imported after everything its links point at. `factions` leads
because NPCs carry `faction_name`. An earlier revision put factions last, which
reads more naturally and meant an NPC's faction link **could never resolve** — no
error, no warning, silently dropped every time. `dependencyOrder.test.ts` pins the
property against the declared link graph.

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
