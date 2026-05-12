/**
 * Per-character class entry. A party member has one or more of these (one
 * flagged as `is_primary`) representing levels taken in different classes.
 * Single-class characters simply have a single primary row.
 */
export interface CharacterClass {
  id: string;
  party_member_id: string;
  class_name: string;
  subclass_name: string | null;
  levels: number;
  is_primary: boolean;
  hit_dice_used: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type CharacterClassInsert = Omit<
  CharacterClass,
  "id" | "created_at" | "updated_at"
>;
export type CharacterClassUpdate = Partial<Omit<CharacterClass, "id" | "party_member_id" | "created_at" | "updated_at">>;

/**
 * PHB multiclass prerequisite row. Seeded by migration, read-only for clients.
 */
export interface MulticlassPrereq {
  class_name: string;
  require_kind: "and" | "or";
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  /** Restricted proficiency list granted when taking this class as a secondary class. */
  gained_proficiencies: string[];
}

export interface AbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

/**
 * Check whether a character's ability scores meet the multiclass prereqs for
 * `className`. Returns a tuple of [passes, reason]. Used to gate the class
 * picker; can be bypassed by the campaign's optional-rules flag.
 */
export function meetsMulticlassPrereq(
  prereq: MulticlassPrereq | null | undefined,
  scores: AbilityScores,
): { ok: true } | { ok: false; reason: string } {
  if (!prereq) return { ok: true };
  const keys: (keyof AbilityScores)[] = ["str", "dex", "con", "int", "wis", "cha"];
  const label: Record<keyof AbilityScores, string> = {
    str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA",
  };
  const thresholds = keys
    .map((k) => ({ k, threshold: prereq[k], score: scores[k] }))
    .filter((r) => r.threshold > 0);
  if (thresholds.length === 0) return { ok: true };

  if (prereq.require_kind === "or") {
    const ok = thresholds.some((r) => r.score >= r.threshold);
    if (ok) return { ok: true };
    const parts = thresholds.map((r) => `${label[r.k]} ${r.threshold}+`);
    return { ok: false, reason: `Requires ${parts.join(" or ")}` };
  }

  const failing = thresholds.filter((r) => r.score < r.threshold);
  if (failing.length === 0) return { ok: true };
  const parts = failing.map((r) => `${label[r.k]} ${r.threshold}+`);
  return { ok: false, reason: `Requires ${parts.join(" and ")}` };
}

/** Short "Fighter 5 / Wizard 3" label for sheet headers and roster rows. */
export function formatMulticlassLabel(classes: CharacterClass[]): string {
  if (classes.length === 0) return "";
  const sorted = [...classes].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    return a.sort_order - b.sort_order;
  });
  return sorted.map((c) => `${c.class_name} ${c.levels}`).join(" / ");
}

/** Sum of all class levels — the character's total level for proficiency bonus. */
export function totalLevel(classes: CharacterClass[]): number {
  if (classes.length === 0) return 1;
  return classes.reduce((s, c) => s + c.levels, 0);
}

/** Returns the primary class entry, or null if none marked. */
export function primaryClass(classes: CharacterClass[]): CharacterClass | null {
  return classes.find((c) => c.is_primary) ?? classes[0] ?? null;
}

import { getCastingAbility } from "@/types/spell.types";

/**
 * Per-class spellcasting stats (DC and attack bonus). A multiclass character
 * has one entry per casting class — e.g. a Paladin 3 / Wizard 5 casts Paladin
 * spells off CHA and Wizard spells off INT, so each spell uses its own
 * class's DC.
 */
export interface SpellcastingClassStats {
  /** character_classes row id — matches character_spells.source_class_id */
  classId: string;
  className: string;
  castingAbility: "int" | "wis" | "cha";
  dc: number;
  attack: number;
}

/**
 * Compute per-class spell DC and attack bonus from a character's ability
 * scores + classes. Non-casters are omitted. Proficiency bonus comes from
 * the character (single value, shared across classes per 5e RAW).
 */
export function computeSpellcastingPerClass(
  member: AbilityScores & { proficiency_bonus: number },
  classes: CharacterClass[],
): SpellcastingClassStats[] {
  const out: SpellcastingClassStats[] = [];
  for (const c of classes) {
    const ability = getCastingAbility(c.class_name);
    if (!ability) continue;
    const mod = Math.floor((member[ability] - 10) / 2);
    const attack = member.proficiency_bonus + mod;
    out.push({
      classId: c.id,
      className: c.class_name,
      castingAbility: ability,
      attack,
      dc: 8 + attack,
    });
  }
  return out;
}

/**
 * Resolve the right stats row for a spell entry. Matches by `sourceClassId`
 * (the `character_spells.source_class_id` FK); falls back to the first entry
 * for legacy rows that have no source class. Returns null when the array is
 * empty — callers should then fall back to single-class numbers.
 */
export function pickSpellcastingStats(
  entries: SpellcastingClassStats[],
  sourceClassId: string | null | undefined,
): SpellcastingClassStats | null {
  if (entries.length === 0) return null;
  if (sourceClassId) {
    const hit = entries.find((e) => e.classId === sourceClassId);
    if (hit) return hit;
  }
  return entries[0] ?? null;
}
