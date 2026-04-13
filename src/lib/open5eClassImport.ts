import { fetchAll } from "@/lib/open5eApi";
import type { CustomClassInsert, CustomSubclassInsert, HitDie } from "@/levelup/customTypes";

// ── Open5e v2 API shape ───────────────────────────────────────────────────────

interface Open5eV2Class {
  key: string;
  name: string;
  /** "D10", "D8" etc, or null for subclasses that inherit from parent */
  hit_dice: string | null;
  /** "NONE", "FULL", "HALF", "THIRD", "WARLOCK" */
  caster_type: string;
  saving_throws: string[];
  subclass_of: { key: string; name: string } | null;
  document: { key: string; name: string };
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
}

export interface Open5eSubclassPreview {
  key: string;
  name: string;
  source: string;
  parentClassName: string;
}

export async function fetchOpen5eBaseClasses(): Promise<Open5eClassPreview[]> {
  const raw = await fetchAll<Open5eV2Class>(V2_BASE);
  return raw
    .filter(c => c.hit_dice !== null && c.subclass_of === null)
    .map(c => ({
      key: c.key,
      name: c.name,
      source: c.document?.name ?? "",
      hitDie: parseHitDie(c.hit_dice),
      savingThrows: c.saving_throws ?? [],
    }));
}

export async function fetchOpen5eSubclasses(): Promise<Open5eSubclassPreview[]> {
  const raw = await fetchAll<Open5eV2Class>(V2_BASE);
  return raw
    .filter(c => c.subclass_of !== null)
    .map(c => ({
      key: c.key,
      name: c.name,
      source: c.document?.name ?? "",
      parentClassName: c.subclass_of!.name,
    }));
}

// ── Mappers ───────────────────────────────────────────────────────────────────

export function baseClassToInsert(preview: Open5eClassPreview): CustomClassInsert {
  return {
    class_name: preview.name,
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
    campaign_id: null,
    features: {},
    steps: [],
    resources: [],
  };
}
