# Document Import

A DM uploads a PDF or a batch of page photos, an AI pass extracts game entities
from it, and a seven-step wizard reviews every entity before anything reaches a
content table. **DM-only** — there is no player-facing surface at all.

Lives at **Campaign Settings → Import Document** (`/campaign/settings?tab=import`).

Issue #353. Open follow-up: #769 (sweep for stranded rows).

---

## The shape of it

| Step | What happens | Where |
| --- | --- | --- |
| Upload | Pick file(s), see page count + credit cost + plan cap, tick the rights attestation | `DocumentImportTab.vue` |
| Stage | Objects go to the private `import-documents` bucket; a `document_imports` row is created | `useDocumentImport.ts` |
| Extract | Edge function reads the bytes, calls the model, writes `extracted` jsonb back | `import-extract/index.ts` |
| Review | One step per entity kind — select, edit, import or skip | `DocumentImportWizard.vue` |
| Link | Second pass resolves cross-entity references by name | `importPlan.ts` |

Seven kinds, in **dependency order** (`IMPORT_ENTITY_KINDS`):
`factions → monsters → npcs → locations → items → spells → quests`.

---

## Files

**Types & pure logic** (`src/types/`, `src/lib/documentImport/`)

| File | Owns |
| --- | --- |
| `documentImport.types.ts` | The extraction contract — seven narrow payloads, review envelope, `ExtractionResult`, `DocumentImport` row type |
| `entityKinds.ts` | Per-kind registry: target table, labels, `displayField`, `quotaResource` |
| `limits.ts` | Page caps (10 free / 50 Pro), MIME allowlist, byte cap, `validateUpload` |
| `pageCount.ts` | PDF page counting via `pdf-lib`; rejects mixed PDF+image and multi-PDF selections |
| `normalize.ts` | The **one** place an extracted payload becomes an `<Entity>Insert` |
| `importPlan.ts` | Selection → ordered inserts, partial-failure accounting, link resolution |

**UI** (`src/components/campaign/`) — `DocumentImportTab.vue`,
`DocumentImportWizard.vue`, `DocumentImportEntityCard.vue` (one generic card
driven by field shape, not seven per-kind templates).

**Server** (`supabase/functions/`) — `import-extract/index.ts`,
`import-extract/extractionSchema.ts`, `_shared/documentGen.ts`.

**Data** — table `document_imports`, bucket `import-documents`,
`provider_config.document_model`, `ai_system_prompts` row `document_import`,
credit rows `document_import_extraction` (base) + `document_import_page`.

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

Five kinds are quota-limited (`monsters`, `npcs`, `locations`, `quests`,
`factions`); `items` and `spells` are not. `enforce_quota` is a **BEFORE INSERT
trigger**, so a free user importing forty monsters gets some rows and then a
throw *partway*.

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
review-and-import path including the quota trigger.
