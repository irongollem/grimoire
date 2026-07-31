import { fetchAllFromDocuments, fetchSupported5eDocumentKeys, rulesetForDocument, slugifyKey } from "@/lib/library/open5eApi";
import type { Open5eDocumentRef } from "@/lib/library/open5eApi";
import type { CustomClassInsert, CustomSubclassInsert, HitDie } from "@/levelup/customTypes";
import type { RulesetKey } from "@/types/ruleset.types";

// ── Description helpers ───────────────────────────────────────────────────────

/** Convert plain text description to a minimal Tiptap JSON doc string. */
function descToTiptap(desc: string): string {
  const paragraphs = desc
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const content = paragraphs.map((text) => ({
    type: "paragraph",
    content: [{ type: "text", text }],
  }));
  return JSON.stringify({ type: "doc", content });
}

// ── Open5e v2 API shape ───────────────────────────────────────────────────────

interface Open5eV2ClassFeature {
  key: string;
  name: string;
  desc: string;
  feature_type: string;
  /** Levels at which this feature is gained — each entry is {level, detail} */
  gained_at: { level: number; detail: string | null }[];
}

interface Open5eV2Class {
  key: string;
  name: string;
  desc: string;
  /** "D10", "D8" etc, or null for subclasses that inherit from parent */
  hit_dice: string | null;
  /** "NONE", "FULL", "HALF", "THIRD", "WARLOCK" */
  caster_type: string;
  /** API returns objects with name+url, not plain strings */
  saving_throws: { name: string; url: string }[];
  subclass_of: { key: string; name: string } | null;
  document: Open5eDocumentRef;
  features: Open5eV2ClassFeature[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseHitDie(hitDice: string | null): HitDie {
  if (!hitDice) return 8;
  const n = parseInt(hitDice.replace(/[Dd]/g, ""), 10);
  if (n === 6 || n === 8 || n === 10 || n === 12) return n;
  return 8;
}

const V2_BASE = "https://api.open5e.com/v2/classes/";

type SupportedRuleset = RulesetKey;

export interface Open5eClassFeaturePreview {
  key: string;
  name: string;
  description: string;
  ruleset: SupportedRuleset | null;
  sourceDocumentKey: string;
  sourceDocumentName: string;
  sourceLicense: string | null;
  provenance: Record<string, unknown>;
}

// ── Public: base classes ──────────────────────────────────────────────────────

export interface Open5eClassPreview {
  key: string;
  name: string;
  source: string;
  ruleset: SupportedRuleset | null;
  sourceDocumentKey: string;
  sourceRecordKey: string;
  sourceLicense: string | null;
  provenance: Record<string, unknown>;
  hitDie: HitDie;
  savingThrows: string[];
  /** Feature names grouped by the first level they're gained at (CLASS_LEVEL_FEATURE only) */
  featureNamesByLevel: Record<string, string[]>;
  featureRecordsByLevel: Record<string, Open5eClassFeaturePreview[]>;
}

export interface Open5eSubclassPreview {
  key: string;
  name: string;
  desc: string;
  source: string;
  ruleset: SupportedRuleset | null;
  sourceDocumentKey: string;
  sourceRecordKey: string;
  sourceLicense: string | null;
  provenance: Record<string, unknown>;
  parentClassName: string;
  /** Feature names grouped by the first level they're gained at */
  featureNamesByLevel: Record<string, string[]>;
  featureRecordsByLevel: Record<string, Open5eClassFeaturePreview[]>;
}

function featurePreview(feature: Open5eV2ClassFeature, document: Open5eDocumentRef): Open5eClassFeaturePreview {
  return {
    key: feature.key,
    name: feature.name,
    description: feature.desc ?? "",
    ruleset: rulesetForDocument(document),
    sourceDocumentKey: document.key,
    sourceDocumentName: document.display_name || document.name,
    sourceLicense: document.licenses?.map(license => license.key).join(", ") || null,
    provenance: {
      provider: "open5e-v2",
      document: {
        key: document.key,
        name: document.name,
        publisher: document.publisher ?? null,
        gamesystem: document.gamesystem ?? null,
        permalink: document.permalink ?? null,
      },
    },
  };
}

/**
 * Shared fetch of the full Open5e v2 classes list (all supported documents'
 * classes + subclasses), memoized per session. `fetchOpen5eBaseClasses`,
 * `fetchOpen5eSubclasses`, and `fetchClassFeatureDescriptions` each used to
 * independently re-fetch documents + classes — a single admin import
 * session (base classes → subclasses → feature backfill) tripled the same
 * request. A module-level in-flight cache is sufficient here: staleness
 * across one admin import session is acceptable (see caller sites), and the
 * cache lives only for the page/process lifetime.
 */
let classesRawCache: Promise<Open5eV2Class[]> | null = null;

function fetchOpen5eClassesRaw(): Promise<Open5eV2Class[]> {
  if (!classesRawCache) {
    classesRawCache = fetchSupported5eDocumentKeys().then((documentKeys) =>
      fetchAllFromDocuments<Open5eV2Class>(V2_BASE, documentKeys),
    );
  }
  return classesRawCache;
}

export async function fetchOpen5eBaseClasses(): Promise<Open5eClassPreview[]> {
  const raw = await fetchOpen5eClassesRaw();

  return raw
    .filter(c => c.hit_dice !== null && c.subclass_of === null)
    .map(c => {
      const featureNamesByLevel: Record<string, string[]> = {};
      const featureRecordsByLevel: Record<string, Open5eClassFeaturePreview[]> = {};
      for (const feat of c.features ?? []) {
        if (feat.feature_type !== "CLASS_LEVEL_FEATURE") continue;
        const level = feat.gained_at?.[0]?.level;
        if (!level) continue;
        const key = String(level);
        if (!featureNamesByLevel[key]) featureNamesByLevel[key] = [];
        featureNamesByLevel[key].push(feat.name);
        if (!featureRecordsByLevel[key]) featureRecordsByLevel[key] = [];
        featureRecordsByLevel[key].push(featurePreview(feat, c.document));
      }
      return {
        key: c.key,
        name: c.name,
        source: c.document?.name ?? "",
        ruleset: rulesetForDocument(c.document),
        sourceDocumentKey: c.document.key,
        sourceRecordKey: c.key,
        sourceLicense: c.document.licenses?.map(license => license.key).join(", ") || null,
        provenance: featurePreview({ key: c.key, name: c.name, desc: c.desc, feature_type: "", gained_at: [] }, c.document).provenance,
        hitDie: parseHitDie(c.hit_dice),
        savingThrows: (c.saving_throws ?? []).map(s => s.name),
        featureNamesByLevel,
        featureRecordsByLevel,
      };
    });
}

export async function fetchOpen5eSubclasses(): Promise<Open5eSubclassPreview[]> {
  const raw = await fetchOpen5eClassesRaw();
  return raw
    .filter(c => c.subclass_of !== null)
    .map(c => {
      // Group feature names by level (use the first level in gained_at as the key)
      const featureNamesByLevel: Record<string, string[]> = {};
      const featureRecordsByLevel: Record<string, Open5eClassFeaturePreview[]> = {};
      for (const feat of c.features ?? []) {
        if (feat.feature_type !== "CLASS_LEVEL_FEATURE") continue;
        const level = feat.gained_at?.[0]?.level;
        if (!level) continue;
        const key = String(level);
        if (!featureNamesByLevel[key]) featureNamesByLevel[key] = [];
        featureNamesByLevel[key].push(feat.name);
        if (!featureRecordsByLevel[key]) featureRecordsByLevel[key] = [];
        featureRecordsByLevel[key].push(featurePreview(feat, c.document));
      }
      return {
        key: c.key,
        name: c.name,
        desc: c.desc ?? "",
        source: c.document?.name ?? "",
        ruleset: rulesetForDocument(c.document),
        sourceDocumentKey: c.document.key,
        sourceRecordKey: c.key,
        sourceLicense: c.document.licenses?.map(license => license.key).join(", ") || null,
        provenance: featurePreview({ key: c.key, name: c.name, desc: c.desc, feature_type: "", gained_at: [] }, c.document).provenance,
        parentClassName: c.subclass_of!.name,
        featureNamesByLevel,
        featureRecordsByLevel,
      };
    });
}

// ── Mappers ───────────────────────────────────────────────────────────────────

export function baseClassToInsert(preview: Open5eClassPreview): CustomClassInsert {
  return {
    class_name: preview.name,
    source: preview.source || null,
    ruleset: preview.ruleset,
    conceptual_key: slugifyKey(preview.name),
    source_document_key: preview.sourceDocumentKey,
    source_record_key: preview.sourceRecordKey,
    source_revision: preview.source,
    source_license: preview.sourceLicense,
    provenance: preview.provenance,
    campaign_id: null,
    hit_die: preview.hitDie,
    primary_ability: null,
    saving_throws: preview.savingThrows,
    armor_proficiencies: [],
    weapon_proficiencies: [],
    subclass_level: 3,
    features: {},
    asi_levels: [4, 8, 12, 16, 19],
    spell_slots: null,
    spells_known: null,
    cantrips_known: null,
    slot_recovery: "long",
    caster_type: "none",
    prepared_ability: null,
    prepared_divisor: null,
    steps: [],
    resources: [],
  };
}

export function subclassToInsert(preview: Open5eSubclassPreview): CustomSubclassInsert {
  return {
    class_name: preview.parentClassName,
    subclass_name: preview.name,
    source: preview.source || null,
    ruleset: preview.ruleset,
    conceptual_key: slugifyKey(`${preview.parentClassName}-${preview.name}`),
    source_document_key: preview.sourceDocumentKey,
    source_record_key: preview.sourceRecordKey,
    source_revision: preview.source,
    source_license: preview.sourceLicense,
    provenance: preview.provenance,
    description: preview.desc || null,
    campaign_id: null,
    features: {},
    granted_spells: {},
    steps: [],
    resources: [],
    hp_per_level: null,
  };
}

/**
 * Narrows a freshly-built `custom_classes` insert down to the fields a
 * re-import is allowed to refresh on an existing row: upstream identity and
 * shell content (name, source metadata, hit die, saving throws). Open5e's
 * class API exposes none of a class's mechanical progression, so
 * `baseClassToInsert` always fills `primary_ability`, proficiencies,
 * `subclass_level`, `asi_levels`, spellcasting fields, `steps`, `resources`
 * and `campaign_id` with hardcoded defaults — a DM fills those in by hand
 * after the initial import. Refreshing them on every re-run would silently
 * discard that manual work, so they must never appear here.
 */
export function classImportUpdateFields(insert: CustomClassInsert): Partial<CustomClassInsert> {
  return {
    class_name: insert.class_name,
    source: insert.source,
    ruleset: insert.ruleset,
    conceptual_key: insert.conceptual_key,
    source_document_key: insert.source_document_key,
    source_record_key: insert.source_record_key,
    source_revision: insert.source_revision,
    source_license: insert.source_license,
    provenance: insert.provenance,
    hit_die: insert.hit_die,
    saving_throws: insert.saving_throws,
  };
}

/**
 * Subclass counterpart of {@link classImportUpdateFields}. `subclassToInsert`
 * always defaults `granted_spells`, `steps`, `resources`, `hp_per_level` and
 * `campaign_id` — all DM-configured after import — so a re-import must never
 * refresh them either.
 */
export function subclassImportUpdateFields(insert: CustomSubclassInsert): Partial<CustomSubclassInsert> {
  return {
    class_name: insert.class_name,
    subclass_name: insert.subclass_name,
    source: insert.source,
    ruleset: insert.ruleset,
    conceptual_key: insert.conceptual_key,
    source_document_key: insert.source_document_key,
    source_record_key: insert.source_record_key,
    source_revision: insert.source_revision,
    source_license: insert.source_license,
    provenance: insert.provenance,
    description: insert.description,
  };
}

// ── System feature description backfill ──────────────────────────────────────

/**
 * Fetches all class feature descriptions from the Open5e v2 API and returns
 * a map of { featureName → tiptapJsonString } for every feature that has a
 * non-empty `desc` field. Used to backfill system (user_id = null) features.
 */
export async function fetchClassFeatureDescriptions(): Promise<Map<string, string>> {
  const raw = await fetchOpen5eClassesRaw();
  const map = new Map<string, string>();
  for (const cls of raw) {
    for (const feat of cls.features ?? []) {
      if (!feat.desc || map.has(feat.name)) continue;
      map.set(feat.name, descToTiptap(feat.desc));
    }
  }
  return map;
}
