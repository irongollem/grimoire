import { fetchAll } from "@/lib/open5eApi";
import type { CustomClassInsert, CustomSubclassInsert, HitDie } from "@/levelup/customTypes";

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
  document: { key: string; name: string };
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

// ── Public: base classes ──────────────────────────────────────────────────────

export interface Open5eClassPreview {
  key: string;
  name: string;
  source: string;
  hitDie: HitDie;
  savingThrows: string[];
  /** Feature names grouped by the first level they're gained at (CLASS_LEVEL_FEATURE only) */
  featureNamesByLevel: Record<string, string[]>;
}

export interface Open5eSubclassPreview {
  key: string;
  name: string;
  desc: string;
  source: string;
  parentClassName: string;
  /** Feature names grouped by the first level they're gained at */
  featureNamesByLevel: Record<string, string[]>;
}

export async function fetchOpen5eBaseClasses(): Promise<Open5eClassPreview[]> {
  const raw = await fetchAll<Open5eV2Class>(V2_BASE);

  return raw
    .filter(c => c.hit_dice !== null && c.subclass_of === null)
    .map(c => {
      const featureNamesByLevel: Record<string, string[]> = {};
      for (const feat of c.features ?? []) {
        if (feat.feature_type !== "CLASS_LEVEL_FEATURE") continue;
        const level = feat.gained_at?.[0]?.level;
        if (!level) continue;
        const key = String(level);
        if (!featureNamesByLevel[key]) featureNamesByLevel[key] = [];
        featureNamesByLevel[key].push(feat.name);
      }
      return {
        key: c.key,
        name: c.name,
        source: c.document?.name ?? "",
        hitDie: parseHitDie(c.hit_dice),
        savingThrows: (c.saving_throws ?? []).map(s => s.name),
        featureNamesByLevel,
      };
    });
}

export async function fetchOpen5eSubclasses(): Promise<Open5eSubclassPreview[]> {
  const raw = await fetchAll<Open5eV2Class>(V2_BASE);
  return raw
    .filter(c => c.subclass_of !== null)
    .map(c => {
      // Group feature names by level (use the first level in gained_at as the key)
      const featureNamesByLevel: Record<string, string[]> = {};
      for (const feat of c.features ?? []) {
        if (feat.feature_type !== "CLASS_LEVEL_FEATURE") continue;
        const level = feat.gained_at?.[0]?.level;
        if (!level) continue;
        const key = String(level);
        if (!featureNamesByLevel[key]) featureNamesByLevel[key] = [];
        featureNamesByLevel[key].push(feat.name);
      }
      return {
        key: c.key,
        name: c.name,
        desc: c.desc ?? "",
        source: c.document?.name ?? "",
        parentClassName: c.subclass_of!.name,
        featureNamesByLevel,
      };
    });
}

// ── Mappers ───────────────────────────────────────────────────────────────────

export function baseClassToInsert(preview: Open5eClassPreview): CustomClassInsert {
  return {
    class_name: preview.name,
    source: preview.source || null,
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
    description: preview.desc || null,
    campaign_id: null,
    features: {},
    steps: [],
    resources: [],
    hp_per_level: null,
  };
}

// ── System feature description backfill ──────────────────────────────────────

/**
 * Fetches all class feature descriptions from the Open5e v2 API and returns
 * a map of { featureName → tiptapJsonString } for every feature that has a
 * non-empty `desc` field. Used to backfill system (user_id = null) features.
 */
export async function fetchClassFeatureDescriptions(): Promise<Map<string, string>> {
  const raw = await fetchAll<Open5eV2Class>(V2_BASE);
  const map = new Map<string, string>();
  for (const cls of raw) {
    for (const feat of cls.features ?? []) {
      if (!feat.desc || map.has(feat.name)) continue;
      map.set(feat.name, descToTiptap(feat.desc));
    }
  }
  return map;
}
