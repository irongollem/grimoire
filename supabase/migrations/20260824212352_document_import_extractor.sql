-- Migration: document_import_extractor
-- The model config and system prompt for the document importer's extraction
-- pass (#353, chunk 2). Chunk 1 (20260824204224) built the staging table and
-- the bucket; this is what actually reads the document.

-- ── 1. A model column of its own ─────────────────────────────────────────────
--
-- `provider_config.text_model` cannot be reused here, and not merely as a
-- preference: the configured Anthropic text model is `claude-haiku-3-20240307`,
-- which **cannot read PDFs at all** — document support arrived with the 3.5
-- generation. Pointing the extractor at the campaign's general text model would
-- fail outright for Anthropic and silently degrade for the others.
--
-- So document extraction gets its own column, exactly as image generation
-- already has `image_model` and `image_quality` rather than overloading
-- `text_model`. A distinct capability gets a distinct column; that is the
-- established shape of this table, not a new idea.
--
-- Nullable with no default: a null means "this provider cannot do document
-- extraction", which is the honest state for a provider we have not verified.
-- The extractor treats null as unsupported and refuses rather than guessing a
-- model id.
alter table provider_config add column if not exists document_model text;

comment on column provider_config.document_model is
  'Model used for document/image extraction (the importer, #353). Separate from '
  'text_model because document reading is a distinct capability: the configured '
  'Anthropic text model (claude-haiku-3-20240307) cannot read PDFs. NULL means '
  'this provider is not available for document extraction.';

-- Anthropic reads PDFs and images natively through the same content-block API,
-- which is what lets a batch of page photos and a PDF share one extraction path.
--
-- claude-opus-5 rather than a cheaper tier: this pass runs once per document and
-- its output is then hand-reviewed by the DM, so accuracy on dense statblock
-- pages is worth more than per-call savings — a misread armour class costs the
-- DM more than the credits do. It is a config row precisely so that judgement
-- can be revisited from the admin panel without a deploy: switching to
-- claude-sonnet-5 is a one-row update if measured spend argues for it.
--
-- Gemini also reads PDFs inline and is left NULL until it is actually verified
-- against real documents. OpenAI stays NULL: its document handling differs
-- enough from the content-block shape that it needs its own code path, and
-- shipping an unverified third provider adds risk without adding capability.
update provider_config set document_model = 'claude-opus-5' where provider = 'anthropic';

-- ── 2. The extraction prompt ─────────────────────────────────────────────────
--
-- This prompt is where the legal design of the feature actually lives. Chunk 1
-- put the prose cap in a type and the page cap in a constant; both are
-- meaningless unless the model is told to paraphrase rather than transcribe.
-- The reasoning, in short (full version on #353):
--
--   * Game mechanics are unprotectable facts in every jurisdiction we serve
--     (US 17 §102(b); in the EU they fail the *Infopaq* originality threshold).
--     Extracting them faithfully is both legal and the entire point.
--   * Descriptive prose is the protected expression. Reproducing it verbatim is
--     the one thing that would turn a neutral extraction pipe into a copying
--     machine, so the model is told to summarise it instead.
--   * Mechanical text is explicitly exempt from the cap, because truncating
--     "Hit: 7 (1d8 + 3) piercing damage" to fit a prose budget would corrupt the
--     one thing the import exists to get right.
--
-- Editing this prompt is therefore a legal change as much as a quality one. If
-- you loosen the paraphrase instruction, say so on #353.
insert into ai_system_prompts (generator_type, label, content) values
  ('document_import', 'Document Import Extraction', $$You extract structured tabletop RPG game data from a document a user has supplied — a PDF, or photographs of printed pages.

Return every entity you can find, sorted into these seven kinds:

- monsters — creatures with stat blocks
- npcs — named characters without full stat blocks
- locations — places: regions, settlements, buildings, rooms
- items — equipment, treasure, magic items
- spells — spells and comparable formal abilities
- quests — adventures, plot hooks, missions
- factions — organisations, guilds, cults, orders

## Mechanics: copy them exactly

Numbers and rules text are what this import exists to capture. Transcribe them
faithfully and completely: armour class, hit points and hit dice, speeds,
ability scores, saving throws, skills, resistances, immunities, senses,
languages, challenge rating, attack and action text, damage expressions, spell
level, school, casting time, range, components, duration, item rarity, weight,
cost, and attunement.

Never round, simplify, restate or abbreviate a mechanical value. "Hit: 7 (1d8 +
3) piercing damage" is copied exactly, not shortened. If a number is unreadable,
omit the field — do not estimate it.

## Prose: summarise it, never transcribe it

Descriptive and narrative text is different. For every descriptive field —
a creature's or location's description, an NPC's appearance, personality or
backstory, a quest's summary, a faction's description — write **your own concise
summary of what a DM needs to know**, at most about 400 characters. Do not
reproduce the document's sentences. Do not quote it. Rewrite it.

This is not a length preference: the mechanics are facts and the prose is the
author's expression, and this tool summarises the latter rather than copying it.

Two fields are deliberately exempt because they are rules text rather than
description, and must be copied exactly like any other mechanic:
- an item's description (its rules and properties)
- a spell's description and higher-level text

## Do not invent

Return only what is actually on the page. If a field is not stated, omit it —
an omitted field is a correct answer and the reviewing user can fill it in. A
plausible-looking invented value is the worst possible output, because it is the
one thing they cannot spot in review.

If you find only a name, return the entity with just its name.

## Marking your own confidence

Set `confidence` to "complete" when you captured the whole entry, and "partial"
when you did not — a stat block cut off by a page break, a creature mentioned in
prose without stats, a photograph too blurred to read in places. "partial" is a
useful, expected answer; it tells the user which entries to check. Do not mark
something "complete" because it looks tidy.

Set `page` to the 1-based page or photo the entity came from, or null if you
cannot tell.

Give every entity a `ref` that is unique within this response — "m1", "m2",
"npc1", and so on. It is used to track the user's selections.

## Cross-references

Where an entity names another entity in the same document — an NPC's faction, a
location's parent region, a quest's giver or location — record the **name** in
the matching field. Never invent an identifier.

Return only the JSON. No commentary, no markdown fences.$$)
on conflict (generator_type) do update set content = excluded.content, label = excluded.label;
