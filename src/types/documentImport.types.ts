/**
 * The document importer's extraction contract (#353).
 *
 * A DM uploads a PDF or a batch of page photos; an AI pass reads it and returns
 * game entities; a seven-step wizard reviews them before anything lands in a
 * content table. This file is the shape that pass returns and every downstream
 * consumer — extractor prompt, review card, mapper, wizard — reads.
 *
 * ── Why these payloads are narrower than the app's Insert types ──────────────
 *
 * The obvious design is "extract straight into `MonsterInsert`". It is wrong in
 * both directions. An Insert type carries fields a document cannot possibly
 * supply (`campaign_id`, `player_visible_to`, focal points, FK ids to rows that
 * do not exist yet), and asking a model to fill them produces confident
 * fabrication rather than a blank. It also omits the things a *review* step
 * needs and a finished row does not: which page a statblock came from, and
 * whether the extractor thinks it got all of it.
 *
 * So the payloads below say only what a page can honestly say, the envelope
 * carries the review metadata, and `src/lib/documentImport/normalize.ts` is the
 * one place that widens a payload into a real Insert with defaults applied.
 *
 * ── Why prose is capped ─────────────────────────────────────────────────────
 *
 * Mechanics — AC, speeds, damage dice, DCs, spell components, CR — are
 * unprotectable facts in every jurisdiction we operate in (US 17 §102(b); in
 * the EU they fail the *Infopaq* originality threshold). Descriptive prose is
 * the protected expression, and reproducing it verbatim is the one thing that
 * would turn a neutral extraction pipe into a copying machine.
 *
 * `PROSE_FIELD_LIMIT` is therefore load-bearing rather than cosmetic: the
 * extractor is instructed to *paraphrase* descriptive text into a DM-usable
 * summary, and the cap is what makes "paraphrase" checkable instead of
 * aspirational. It is also just better product — a wall of transcribed flavour
 * text is not what a DM wants sitting in Grimoire at the table.
 *
 * Mechanical fields are deliberately NOT capped. A statblock's action text is
 * a rules statement, and truncating "Hit: 7 (1d8 + 3) piercing damage" to fit
 * a prose budget would corrupt the one thing the import exists to get right.
 */
import type { AiProvenance } from "@/ai/provenance";
import type { MonsterStatBlock } from "@/types/monster.types";
import type { QuestObjectiveResult, QuestSpineBeatResult, QuestSpineRouteResult } from "@/ai/types";

// ── Entity kinds ─────────────────────────────────────────────────────────────

/**
 * The seven kinds, in wizard order — which is a **dependency order**, not a
 * presentation preference. Each kind is imported in turn, and a cross-entity
 * link can only resolve against rows that already exist, so a kind must come
 * after everything it points at:
 *
 *   factions  ← nothing
 *   monsters  ← nothing
 *   npcs      ← factions          (`faction_name`)
 *   locations ← locations         (`parent_name`, resolved within the step)
 *   items     ← nothing
 *   spells    ← nothing
 *   quests    ← npcs, locations   (`giver_npc_name`, `location_name`)
 *
 * `factions` leads for that reason alone. An earlier revision of this list put
 * it last — which reads more naturally, since monsters and NPCs are what a DM
 * opens a setting book for — and the consequence was that an NPC's faction link
 * could never resolve: by the time factions existed, the NPC step was long past.
 * Nothing failed, nothing errored; the link was simply always dropped, and it
 * took importing a real document to notice.
 *
 * `document_import_dependency_order.test.ts` pins this against the link fields
 * declared below, so adding a link to a payload without reordering fails.
 */
export const IMPORT_ENTITY_KINDS = [
  "factions",
  "monsters",
  "npcs",
  "locations",
  "items",
  "spells",
  "quests",
] as const;

export type ImportEntityKind = (typeof IMPORT_ENTITY_KINDS)[number];

// ── Review metadata ──────────────────────────────────────────────────────────

/**
 * The extractor's own read on how complete an entry is.
 *
 * `partial` is not a failure — a statblock split across a page break, or a
 * creature mentioned in prose without full stats, is still worth importing with
 * the gaps visible. The review card surfaces it so the DM knows which entries
 * to look at rather than trusting the batch uniformly. There is no `low`: a
 * model asked to grade itself on a three-point scale spreads its answers across
 * it regardless of the evidence, whereas "did I get the whole thing or not" is
 * a question about the page and it can answer honestly.
 */
export const IMPORT_CONFIDENCE = ["complete", "partial"] as const;

export type ImportConfidence = (typeof IMPORT_CONFIDENCE)[number];

/** Cap on any paraphrased descriptive field. See the file header for why. */
export const PROSE_FIELD_LIMIT = 600;

// ── Extracted payloads ───────────────────────────────────────────────────────

/**
 * Every payload's `name` is required and every other field optional — a page
 * that yields nothing but a name is still a real result the DM may want as a
 * stub, and a required field the document does not contain is an invitation to
 * invent one.
 */
export interface ExtractedMonster {
  name: string;
  /** Free text as printed ("Large fiend (demon)"); the mapper resolves it to the enum. */
  monster_type?: string;
  size?: string;
  alignment?: string;
  /** Paraphrased, capped. Mechanical text belongs in `stat_block`. */
  description?: string;
  habitat?: string;
  /** Partial: a page break can cost the reactions block without costing the rest. */
  stat_block?: Partial<MonsterStatBlock>;
}

export interface ExtractedNpc {
  name: string;
  race?: string;
  alignment?: string;
  age?: string;
  occupation?: string;
  /** All four are paraphrased and capped. */
  appearance?: string;
  personality?: string;
  backstory?: string;
  notes?: string;
  /** Name of a faction in the same document, resolved against `factions` at import. */
  faction_name?: string;
}

export interface ExtractedLocation {
  name: string;
  /** Free text as printed ("a walled city"); the mapper resolves it to `location_type_enum`. */
  location_type?: string;
  description?: string;
  /**
   * The boxed text for a keyed area, read out when the party first enters.
   *
   * It leads `locations.description` and pointedly NOT `player_summary`:
   * transcribed publisher prose must never reach a player-visible field. See
   * the note in `mapExtractedLocation` — this is the bound on the one exception
   * to the extractor's summarise-don't-copy policy.
   *
   * This exists because of where the boxed text in an adventure chapter
   * actually lives. Measured on the reference chapter: of 17 read-aloud
   * blocks, 3 belonged to narrative beats and **14 to keyed rooms**. Extracting
   * rooms without it would discard the majority of the most directly useful
   * prose on the page — the part a DM would otherwise retype at the table.
   *
   * Same prose cap and same private lock as `ExtractedQuest.read_aloud`.
   */
  read_aloud?: string;
  notes?: string;
  /**
   * Name of another location in the same document. The mapper cannot resolve
   * this to a uuid — the parent may not be inserted yet — so hierarchy is wired
   * up in a second pass after the whole kind is imported.
   */
  parent_name?: string;
}

export interface ExtractedItem {
  name: string;
  item_type?: string;
  subtype?: string;
  rarity?: string;
  requires_attunement?: boolean;
  attunement_requirements?: string;
  weight?: number;
  cost?: string;
  /** Mechanical, uncapped. */
  description?: string;
  armor_class?: string;
  properties?: string[];
  charges?: number;
  weapon_range?: string;
  versatile_damage?: string;
}

export interface ExtractedSpell {
  name: string;
  level?: number;
  school?: string;
  casting_time?: string;
  range?: string;
  duration?: string;
  /** As printed: ["V", "S", "M"]. */
  components?: string[];
  material?: string;
  concentration?: boolean;
  ritual?: boolean;
  /** Mechanical, uncapped — a spell's description IS its rules text. */
  description?: string;
  higher_levels?: string;
  classes?: string[];
}

/**
 * A quest as a *graph*, not a prose blob (#829).
 *
 * The beat/route/objective shape is imported from the AI generator's contract
 * rather than redeclared, and that is the point: `quest_beats` is one table
 * with one meaning, so its two producers — the hook generator (#822) and this
 * importer — emit the same spine and share `src/lib/quests/spine.ts` to plan
 * the writes. A parallel importer-only beat type would be the second quest
 * generation epic #780 exists to delete.
 *
 * ── Why an adventure page suits this and a generated hook barely does ───────
 *
 * Published adventures are already written as events with branches, and they
 * mark boxed text typographically — so `read_aloud` here is transcription,
 * where for the generator it would be invention. See `QuestSpineBeatResult`.
 *
 * ── read_aloud is prose, and obeys the prose rule above ─────────────────────
 *
 * Boxed text is protected expression in exactly the way this file's header
 * describes — more purely so than a statblock, which is mostly unprotectable
 * fact. It therefore goes through `capProse` like every other descriptive
 * field, with no carve-out for being useful. What makes transcribing it
 * defensible is not the cap but the lock: per `project_content_licensing` and
 * #353, imported material stays private to the importing account, is never
 * promoted to `library_*`, and is never reused as seed or training data.
 */
export interface ExtractedQuest {
  title: string;
  /**
   * One line, player-facing. Not the page — `quests_summary_is_one_line`
   * (migration 20260906160921) caps this at 280 characters with no line
   * breaks, and `splitQuestSummary` sends the remainder to the opening beat
   * rather than truncating. A cut sentence is a lie (#799).
   */
  summary?: string;
  /**
   * The scenes the page describes, in source order. Absent or empty is not an
   * error and never manufactures a placeholder beat: a page that yields no
   * usable spine imports as a quest with no beats, which the DM can then
   * author by hand. Inventing an "Opening beat" to fill the hole is how the
   * generation-one shape would survive its own deletion (#822).
   */
  beats?: QuestSpineBeatResult[];
  /** Directed edges between `beats`, by `key`. Optional for the same reason. */
  routes?: QuestSpineRouteResult[];
  /**
   * The ledger of what the party is trying to do. `raised_by` names the beat
   * that opens each one, which is what lets `deriveObjectiveStatuses` land a
   * branch the party has not reached yet as `dormant` rather than `pending`.
   */
  objectives?: QuestObjectiveResult[];
  /** Names, resolved against the same import's NPCs and locations at insert. */
  giver_npc_name?: string;
  location_name?: string;
}

export interface ExtractedFaction {
  name: string;
  faction_type?: string;
  alignment?: string;
  description?: string;
}

/**
 * Kind → payload. A map rather than a union so `ExtractedEntity<K>` and the
 * mapper table can both index it by kind and stay exhaustive: adding an eighth
 * kind to `IMPORT_ENTITY_KINDS` without adding it here is a compile error, not
 * a silently-skipped wizard step.
 */
export interface ExtractedPayloadMap {
  monsters: ExtractedMonster;
  npcs: ExtractedNpc;
  locations: ExtractedLocation;
  items: ExtractedItem;
  spells: ExtractedSpell;
  quests: ExtractedQuest;
  factions: ExtractedFaction;
}

// ── Envelope ─────────────────────────────────────────────────────────────────

/** One extracted entity, plus what the review step needs to show about it. */
export interface ExtractedEntity<K extends ImportEntityKind = ImportEntityKind> {
  /**
   * Stable identity for the lifetime of the wizard — minted by the extractor,
   * never a database id. Selection state, edits and the imported/skipped tally
   * key on this, so it must survive the round trip through `document_imports`.
   */
  ref: string;
  /** 1-based page (or photo index) this came from; null when the model could not say. */
  page: number | null;
  confidence: ImportConfidence;
  data: ExtractedPayloadMap[K];
}

/**
 * A whole extraction. Every kind optional: a bestiary chapter legitimately
 * yields monsters and nothing else, and an absent key is meaningfully different
 * from an empty array — absent means the pass did not run for that kind (a
 * failure worth retrying), empty means it ran and found none (a step to skip).
 */
export type ExtractionResult = {
  [K in ImportEntityKind]?: ExtractedEntity<K>[];
};

// ── The staging row ──────────────────────────────────────────────────────────

/**
 * How the source reached us. `pdf` and `images` arrive as objects in the
 * `import-documents` bucket; `text` (#829) is pasted straight in and carries no
 * storage object at all — `document_imports_source_shape_check` binds each kind
 * to its own `source_paths` cardinality and to whether `source_text` is set.
 */
export const DOCUMENT_IMPORT_SOURCE_KINDS = ["pdf", "images", "text"] as const;

export type DocumentImportSourceKind = (typeof DOCUMENT_IMPORT_SOURCE_KINDS)[number];

export const DOCUMENT_IMPORT_STATUSES = [
  "pending",
  "extracting",
  "review",
  "failed",
  "complete",
] as const;

export type DocumentImportStatus = (typeof DOCUMENT_IMPORT_STATUSES)[number];

/**
 * Mirrors `public.document_imports` (migration 20260824204224).
 *
 * `extracted` is typed as `ExtractionResult` here while the column is opaque
 * jsonb, which is the deliberate arrangement recorded in that migration: the
 * shape lives in TypeScript because a SQL copy of it would drift the first time
 * a payload gained a field. Readers must therefore treat it as untrusted —
 * `parseExtractionResult` is the one place that validates it.
 */
export interface DocumentImport {
  id: string;
  user_id: string;
  campaign_id: string;
  source_kind: DocumentImportSourceKind;
  /** Storage paths under `{userId}/` in `import-documents`, in page order. */
  source_paths: string[];
  display_name: string;
  page_count: number;
  status: DocumentImportStatus;
  extracted: ExtractionResult;
  /**
   * Kind → how many rows that step imported. Absent means "not reviewed yet",
   * 0 means "reviewed and skipped everything" — the wizard resumes on the
   * difference, so the two must not be collapsed.
   */
  imported_counts: Partial<Record<ImportEntityKind, number>>;
  rights_attested_at: string;
  ai_provenance: AiProvenance | null;
  error: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export type DocumentImportInsert = Omit<
  DocumentImport,
  "id" | "user_id" | "status" | "extracted" | "imported_counts" | "ai_provenance" | "error" | "expires_at" | "created_at" | "updated_at"
> & {
  status?: DocumentImportStatus;
  expires_at?: string;
};
