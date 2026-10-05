import { formatLicenseKeys, licenseKeysFor, rulesetForDocument, slugifyKey } from "@/lib/library/open5eApi";
import type { Open5eDocumentRef } from "@/lib/library/open5eApi";
import type { Open5eV2Class, Open5eV2ClassFeature } from "@/lib/library/open5eClassImport";
import type { Open5eV2Feat } from "@/lib/library/open5eFeatImport";
import { SRD_2014_FEATS, SRD_2014_FEATURES } from "@/rules/features/catalogue/srd2014";
import { SRD_2024_FEATS, SRD_2024_FEATURES } from "@/rules/features/catalogue/srd2024";
import type { FeatCatalogue, FeatureCatalogue } from "@/rules/features/catalogue/types";
import { parseFeatAbilityIncrease, parseFeatPrerequisites, parseMechanics } from "@/rules/features/mechanics";
import { FEAT_CATEGORIES } from "@/rules/features/mechanics.types";
import type { FeatCategory, FeatureMechanics } from "@/rules/features/mechanics.types";
import type { ClassFeatureInsert } from "@/types/feature.types";
import type { CustomClassInsert, CustomSubclassInsert, HitDie } from "@/levelup/customTypes";
import type { RulesetKey } from "@/types/ruleset.types";

/**
 * Official class content (#976): the one shared set of class features, feats,
 * subclasses and non-SRD base classes (`user_id = null`), and the feature maps
 * of the SRD base classes in `system_classes`. This module only *plans* the
 * import: it takes what Open5e served and what the database holds and says
 * what to insert and update. Nothing here touches the network or the database,
 * so the rules (which documents, which levels, which mechanics) are testable.
 * `useOfficialClassContentImport` carries the plan out.
 */

// ── Inputs ────────────────────────────────────────────────────────────────────

/** The columns of `content_sources` the import reads. */
export interface ContentSourceRef {
  key: string;
  open5e_key: string | null;
  /** False parks a book we may not host; its records are not imported. */
  is_redistributable: boolean;
}

/** An official row already in the database, by the identity the import matches on. */
export interface ExistingOfficialRow {
  id: string;
  source_document_key: string | null;
  source_record_key: string | null;
  ruleset: RulesetKey | null;
}

export interface SystemClassRef {
  id: string;
  ruleset: RulesetKey;
  class_name: string;
}

export interface OfficialClassContentCatalogues {
  features: Readonly<Record<RulesetKey, FeatureCatalogue>>;
  feats: Readonly<Record<RulesetKey, FeatCatalogue>>;
}

const DEFAULT_CATALOGUES: OfficialClassContentCatalogues = {
  features: { "2014": SRD_2014_FEATURES, "2024": SRD_2024_FEATURES },
  feats: { "2014": SRD_2014_FEATS, "2024": SRD_2024_FEATS },
};

export interface OfficialClassContentInput {
  classes: Open5eV2Class[];
  feats: Open5eV2Feat[];
  sources: ContentSourceRef[];
  existing: {
    features: ExistingOfficialRow[];
    subclasses: ExistingOfficialRow[];
    classes: ExistingOfficialRow[];
  };
  systemClasses: SystemClassRef[];
  /** Overridable for tests; the SRD catalogues otherwise. */
  catalogues?: OfficialClassContentCatalogues;
}

// ── Plan ──────────────────────────────────────────────────────────────────────

/** `{ "<level>": [feature identity, ...] }`, resolved to ids once the features are written. */
export type PlannedFeatureMap = Record<string, string[]>;

export interface PlannedFeature {
  identity: string;
  /** Null when the row does not exist yet. */
  existingId: string | null;
  insert: ClassFeatureInsert;
}

export interface PlannedSubclass {
  identity: string;
  existingId: string | null;
  insert: CustomSubclassInsert;
  /** What a re-import refreshes; the DM-configured columns are never in it. */
  update: Partial<CustomSubclassInsert>;
  featureMap: PlannedFeatureMap;
}

export interface PlannedClass {
  identity: string;
  existingId: string | null;
  insert: CustomClassInsert;
  update: Partial<CustomClassInsert>;
  featureMap: PlannedFeatureMap;
}

export interface PlannedSystemClass {
  systemClassId: string;
  className: string;
  ruleset: RulesetKey;
  featureMap: PlannedFeatureMap;
}

export interface OfficialClassContentPlan {
  features: PlannedFeature[];
  subclasses: PlannedSubclass[];
  classes: PlannedClass[];
  systemClasses: PlannedSystemClass[];
  /** Existing official rows Open5e no longer lists. They are never deleted. */
  notListed: { features: number; subclasses: number; classes: number };
  /** Open5e document keys with no `content_sources` book (or an unhostable one): skipped. */
  skippedDocuments: string[];
  /** Catalogue entries that failed validation and were cleaned, as "<record key>: <problem>". */
  catalogueWarnings: string[];
}

/** The identity an official row is matched on: one record of one book in one edition. */
export function officialIdentity(
  documentKey: string,
  recordKey: string,
  ruleset: RulesetKey | null,
): string {
  return `${documentKey}::${recordKey}::${ruleset ?? "any"}`;
}

/** Open5e document key to the `content_sources.key` a table enables, or null when no hostable book matches. */
export function sourceKeyForDocument(documentKey: string, sources: readonly ContentSourceRef[]): string | null {
  const book = sources.find(s => s.open5e_key === documentKey) ?? sources.find(s => s.key === documentKey);
  return book && book.is_redistributable ? book.key : null;
}

// ── Row builders ──────────────────────────────────────────────────────────────

function paragraphs(text: string): unknown[] {
  return text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => ({ type: "paragraph", content: [{ type: "text", text: p }] }));
}

/** Plain text to a minimal Tiptap doc string, with an optional bullet list (a feat's benefits). */
export function textToTiptap(text: string, bullets: readonly string[] = []): string {
  const content = paragraphs(text);
  if (bullets.length) {
    content.push({
      type: "bulletList",
      content: bullets.map(b => ({
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text: b.trim() }] }],
      })),
    });
  }
  return JSON.stringify({ type: "doc", content });
}

function provenanceFor(document: Open5eDocumentRef): Record<string, unknown> {
  return {
    provider: "open5e-v2",
    document: {
      key: document.key,
      name: document.name,
      publisher: document.publisher ?? null,
      gamesystem: document.gamesystem ?? null,
      permalink: document.permalink ?? null,
    },
  };
}

function parseHitDie(hitDice: string): HitDie {
  const n = parseInt(hitDice.replace(/[Dd]/g, ""), 10);
  return n === 6 || n === 8 || n === 10 || n === 12 ? n : 8;
}

/** Open5e's `type` for a 2024 feat ("Epic Boon", "Fighting Style"); 2014 feats have no category. */
function featCategoryFromType(type: string | null, ruleset: RulesetKey | null): FeatCategory | null {
  if (ruleset !== "2024" || !type) return null;
  const slug = slugifyKey(type);
  return FEAT_CATEGORIES.find(c => c === slug) ?? null;
}

// ── Merging an import into an existing row ───────────────────────────────────

/**
 * The `class_features` fields the import owns. An admin may edit an official
 * row in the Codex, so a re-import refreshes one of these only while it still
 * holds what the import last wrote there (`provenance.imported`).
 */
export const IMPORT_OWNED_FIELDS = [
  "name",
  "description",
  "prerequisite",
  "mechanics",
  "feat_category",
  "prerequisites",
  "repeatable",
  "ability_increase",
] as const;

/** Structural equality for jsonb values: key order never matters, array order does. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => jsonEqual(v, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = Object.keys(ao);
  return keys.length === Object.keys(bo).length && keys.every(k => k in bo && jsonEqual(ao[k], bo[k]));
}

/** A value nobody has filled in: the column default of an unedited field. */
function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return true;
  return typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** The owned fields of an incoming row: what the import records as "last written". */
export function importedBaseline(row: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of IMPORT_OWNED_FIELDS) out[field] = row[field] ?? null;
  return out;
}

/**
 * What a re-import writes into an existing official feature. Per owned field:
 * refreshed when the row still holds what the import last wrote (or, with no
 * record of that, is empty); otherwise the current value stays and the field is
 * reported in `kept`. `update` holds only the columns that actually change, so
 * an empty one means no request is needed. `tags` is never touched.
 */
export function mergeImportedFeature(
  current: Readonly<Record<string, unknown>>,
  incoming: Readonly<Record<string, unknown>>,
): { update: Record<string, unknown>; kept: string[] } {
  const currentProvenance = asRecord(current.provenance);
  const baseline = { ...asRecord(currentProvenance.imported) };
  const update: Record<string, unknown> = {};
  const kept: string[] = [];

  for (const field of IMPORT_OWNED_FIELDS) {
    const have = current[field];
    const want = incoming[field] ?? null;
    const hasBaseline = field in baseline;
    if (jsonEqual(have, want)) {
      baseline[field] = want;
    } else if (hasBaseline ? jsonEqual(have, baseline[field]) : isEmptyValue(have)) {
      update[field] = want;
      baseline[field] = want;
    } else {
      kept.push(field);
    }
  }

  // Columns the import owns outright (book, edition, keys) are refreshed as before.
  for (const [column, value] of Object.entries(incoming)) {
    if (column === "tags" || column === "provenance" || (IMPORT_OWNED_FIELDS as readonly string[]).includes(column)) continue;
    update[column] = value;
  }
  update.provenance = { ...currentProvenance, ...asRecord(incoming.provenance), imported: baseline };

  // Compare before writing: drop what the row already holds.
  for (const column of Object.keys(update)) {
    if (column in current && jsonEqual(current[column], update[column])) delete update[column];
  }
  return { update, kept };
}

/**
 * A feature map with the incoming ids added. Anything already in the map stays,
 * so a feature an admin attached by hand survives; new ids are appended.
 */
export function unionFeatureMap(
  current: Readonly<Record<string, readonly string[]>> | null,
  incoming: Readonly<Record<string, readonly string[]>>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [level, ids] of Object.entries(current ?? {})) out[level] = [...ids];
  for (const [level, ids] of Object.entries(incoming)) {
    const bucket = (out[level] ??= []);
    for (const id of ids) if (!bucket.includes(id)) bucket.push(id);
  }
  return out;
}

/** Stamps a new row's provenance with the baseline its owned fields start from. */
function withImportedBaseline(row: ClassFeatureInsert): ClassFeatureInsert {
  return { ...row, provenance: { ...row.provenance, imported: importedBaseline({ ...row }) } };
}

// ── The plan ──────────────────────────────────────────────────────────────────

export function planOfficialClassContent(input: OfficialClassContentInput): OfficialClassContentPlan {
  const catalogues = input.catalogues ?? DEFAULT_CATALOGUES;
  const skipped = new Set<string>();
  const catalogueWarnings: string[] = [];

  /** The book's `content_sources.key`, noting a document that has none. */
  const sourceFor = (document: Open5eDocumentRef): string | null => {
    const key = sourceKeyForDocument(document.key, input.sources);
    if (!key) skipped.add(document.key);
    return key;
  };

  const byIdentity = (rows: ExistingOfficialRow[]): Map<string, string> => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.source_document_key && row.source_record_key) {
        map.set(officialIdentity(row.source_document_key, row.source_record_key, row.ruleset), row.id);
      }
    }
    return map;
  };
  const existingFeatures = byIdentity(input.existing.features);
  const existingSubclasses = byIdentity(input.existing.subclasses);
  const existingClasses = byIdentity(input.existing.classes);

  const features = new Map<string, PlannedFeature>();

  function cleanedMechanics(recordKey: string, raw: unknown): FeatureMechanics {
    const { mechanics, errors } = parseMechanics(raw);
    for (const e of errors) catalogueWarnings.push(`${recordKey}: ${e}`);
    return mechanics;
  }

  function baseFeatureRow(
    document: Open5eDocumentRef,
    source: string,
    recordKey: string,
    name: string,
    description: string,
  ): ClassFeatureInsert {
    const ruleset = rulesetForDocument(document);
    return {
      ruleset,
      conceptual_key: slugifyKey(name),
      source_document_key: document.key,
      source_record_key: recordKey,
      source_revision: document.name,
      source_license: formatLicenseKeys(licenseKeysFor(document)),
      provenance: provenanceFor(document),
      campaign_id: null,
      name,
      description,
      source,
      prerequisite: null,
      tags: [],
      open5e_import: true,
    };
  }

  /** Adds a class or subclass feature once, however many levels or classes reference it. */
  function addFeature(feature: Open5eV2ClassFeature, document: Open5eDocumentRef, source: string): string {
    const ruleset = rulesetForDocument(document);
    const identity = officialIdentity(document.key, feature.key, ruleset);
    if (features.has(identity)) return identity;
    const mechanics = cleanedMechanics(
      feature.key,
      ruleset ? catalogues.features[ruleset][feature.key] : undefined,
    );
    const row = baseFeatureRow(document, source, feature.key, feature.name, textToTiptap(feature.desc ?? ""));
    features.set(identity, {
      identity,
      existingId: existingFeatures.get(identity) ?? null,
      // Every column a feat row sets, set here too: features and feats go up in
      // one batch, and PostgREST fills a column one row lacks with NULL, not its
      // default, so a missing `repeatable` broke the NOT NULL on every insert.
      insert: withImportedBaseline({
        ...row,
        kind: "feature",
        prerequisite: null,
        feat_category: null,
        prerequisites: null,
        repeatable: false,
        ability_increase: null,
        mechanics,
      }),
    });
    return identity;
  }

  /** Every level a feature is gained at, so a feature at [4, 8, 12] sits under each. */
  function featureMapOf(cls: Open5eV2Class, source: string): PlannedFeatureMap {
    const map: PlannedFeatureMap = {};
    for (const feature of cls.features ?? []) {
      if (feature.feature_type !== "CLASS_LEVEL_FEATURE") continue;
      const levels = new Set((feature.gained_at ?? []).map(g => g.level).filter(l => Number.isInteger(l) && l > 0));
      if (levels.size === 0) continue;
      const identity = addFeature(feature, cls.document, source);
      for (const level of levels) {
        const bucket = (map[String(level)] ??= []);
        if (!bucket.includes(identity)) bucket.push(identity);
      }
    }
    return map;
  }

  // ── Feats ──
  for (const feat of input.feats) {
    const source = sourceFor(feat.document);
    if (!source) continue;
    const ruleset = rulesetForDocument(feat.document);
    const identity = officialIdentity(feat.document.key, feat.key, ruleset);
    if (features.has(identity)) continue;
    const entry = ruleset ? catalogues.feats[ruleset][feat.key] : undefined;
    const mechanics = cleanedMechanics(feat.key, entry?.mechanics);
    const benefits = (feat.benefits ?? []).map(b => b.desc).filter(Boolean);
    const row = baseFeatureRow(feat.document, source, feat.key, feat.name, textToTiptap(feat.desc ?? "", benefits));
    features.set(identity, {
      identity,
      existingId: existingFeatures.get(identity) ?? null,
      insert: withImportedBaseline({
        ...row,
        kind: "feat",
        prerequisite: feat.prerequisite?.trim() || null,
        // The catalogue names the category the book gives; Open5e's type is the fallback.
        feat_category: entry ? entry.category : featCategoryFromType(feat.type, ruleset),
        prerequisites: entry ? parseFeatPrerequisites(entry.prerequisites) : null,
        repeatable: entry?.repeatable ?? false,
        ability_increase: entry ? parseFeatAbilityIncrease(entry.ability_increase) : null,
        mechanics,
      }),
    });
  }

  // ── Classes, subclasses ──
  const subclasses: PlannedSubclass[] = [];
  const classes: PlannedClass[] = [];
  const systemClasses: PlannedSystemClass[] = [];
  const planned = new Set<string>();

  for (const cls of input.classes) {
    const source = sourceFor(cls.document);
    if (!source) continue;
    const ruleset = rulesetForDocument(cls.document);
    const identity = officialIdentity(cls.document.key, cls.key, ruleset);
    if (planned.has(identity)) continue;
    planned.add(identity);

    const common = {
      source,
      ruleset,
      source_document_key: cls.document.key,
      source_record_key: cls.key,
      source_revision: cls.document.name,
      source_license: formatLicenseKeys(licenseKeysFor(cls.document)),
      provenance: provenanceFor(cls.document),
      campaign_id: null,
    };

    if (cls.subclass_of) {
      const insert: CustomSubclassInsert = {
        ...common,
        class_name: cls.subclass_of.name,
        subclass_name: cls.name,
        conceptual_key: slugifyKey(`${cls.subclass_of.name}-${cls.name}`),
        description: cls.desc || null,
        features: {},
        granted_spells: {},
        hp_per_level: null,
      };
      // granted_spells and hp_per_level are configured by hand
      // afterwards, so a re-import never refreshes them.
      const update: Partial<CustomSubclassInsert> = {
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
      subclasses.push({
        identity,
        existingId: existingSubclasses.get(identity) ?? null,
        insert,
        update,
        featureMap: featureMapOf(cls, source),
      });
      continue;
    }

    if (cls.hit_dice === null) continue;
    const featureMap = featureMapOf(cls, source);

    // The SRD base classes are the system classes: their chassis (hit die,
    // slots, ASI levels) is already there and only the feature map is imported.
    const system = cls.document.key === "srd-2014" || cls.document.key === "srd-2024"
      ? input.systemClasses.find(s => s.ruleset === ruleset && s.class_name.toLowerCase() === cls.name.toLowerCase())
      : undefined;
    if (system) {
      systemClasses.push({ systemClassId: system.id, className: system.class_name, ruleset: system.ruleset, featureMap });
      continue;
    }

    const insert: CustomClassInsert = {
      ...common,
      class_name: cls.name,
      conceptual_key: slugifyKey(cls.name),
      hit_die: parseHitDie(cls.hit_dice),
      primary_ability: null,
      saving_throws: (cls.saving_throws ?? []).map(s => s.name),
      armor_proficiencies: [],
      weapon_proficiencies: [],
      subclass_level: 3,
      features: {},
      spell_slots: null,
      spells_known: null,
      cantrips_known: null,
      slot_recovery: "long",
      caster_type: "none",
      prepared_ability: null,
      prepared_divisor: null,
    };
    // Open5e exposes none of a class's mechanical progression, so everything
    // past the shell is filled in by hand and a re-import must not reset it.
    const update: Partial<CustomClassInsert> = {
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
    classes.push({ identity, existingId: existingClasses.get(identity) ?? null, insert, update, featureMap });
  }

  const unlisted = (existing: Map<string, string>, plannedIdentities: Iterable<string>): number => {
    const listed = new Set(plannedIdentities);
    let count = 0;
    for (const identity of existing.keys()) if (!listed.has(identity)) count++;
    return count;
  };

  return {
    features: [...features.values()],
    subclasses,
    classes,
    systemClasses,
    notListed: {
      features: unlisted(existingFeatures, features.keys()),
      subclasses: unlisted(existingSubclasses, subclasses.map(s => s.identity)),
      classes: unlisted(existingClasses, classes.map(c => c.identity)),
    },
    skippedDocuments: [...skipped].sort(),
    catalogueWarnings,
  };
}
