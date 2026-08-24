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

// ── Entity kinds ─────────────────────────────────────────────────────────────

/**
 * The seven kinds, in wizard order. Ordered by how much the rest depends on
 * them, not alphabetically: monsters and NPCs are what a DM actually opens a
 * setting book for, and locations precede quests because a quest's `location_id`
 * can only resolve against locations the same import already created.
 */
export const IMPORT_ENTITY_KINDS = [
  "monsters",
  "npcs",
  "locations",
  "items",
  "spells",
  "quests",
  "factions",
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

export interface ExtractedQuest {
  title: string;
  summary?: string;
  description?: string;
  rewards?: string;
  notes?: string;
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

export const DOCUMENT_IMPORT_SOURCE_KINDS = ["pdf", "images"] as const;

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
