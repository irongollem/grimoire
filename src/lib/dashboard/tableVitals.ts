import type { PartyMember, SpellSlotEntry } from "@/types/party.types";
import { slotPool, type SpellSlotPool } from "@/rules/spellSlots";

/**
 * The Table Vitals dashboard card's row shape (#764): remaining spell slots,
 * class-resource pools (Ki, Rage, Bardic Inspiration…) and active
 * concentration — the three `PartyMember` columns `PartyWidget` does not
 * surface (it already owns HP, AC, conditions and passive scores).
 *
 * Kept pure and apart from the widget for the same reason as
 * `dmScreenCard.ts`: `spell_slots`, `class_resources` and `concentration` are
 * jsonb, so nothing here can trust that a row actually matches its declared
 * TypeScript shape — a hand-edited row, a pre-migration character, or a bug
 * upstream can hand back something that doesn't parse. Structural validation
 * belongs in one place that's cheap to test, not spread across a mounted
 * card. Every reducer below treats its column as `unknown` on purpose, even
 * though `PartyMember` promises a narrower type.
 */

export interface TableVitalsSlotGroup {
  level: number;
  pool: SpellSlotPool;
  remaining: number;
  max: number;
}

export interface TableVitalsResource {
  key: string;
  /** Same casing rule as `PlayerFeaturesTab.vue`, `RunnerMonsterPanel.vue` and
   *  `PlayerChoicesCard.vue` — none of them export it, so it is repeated
   *  exactly here rather than given a fourth, slightly different shape. */
  label: string;
  current: number;
  max: number;
  rest: "short" | "long";
}

export interface TableVitalsConcentration {
  spellName: string;
  startedRound: number | null;
}

export interface TableVitalsRow {
  id: string;
  name: string;
  slots: TableVitalsSlotGroup[];
  resources: TableVitalsResource[];
  concentration: TableVitalsConcentration | null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * `member.spell_slots` is typed as `SpellSlotEntry[]`, but that promise is
 * made by the TS layer, not the database — a jsonb column can hold anything.
 * A slot with `max <= 0` is legacy noise (`spellSlotsFromProgression` in
 * `src/rules/spellSlots.ts` never emits one), not a slot worth a row, so it
 * is dropped along with anything that fails to parse as a slot at all.
 */
function validSlots(raw: unknown): SpellSlotEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is SpellSlotEntry => {
    if (typeof entry !== "object" || entry === null) return false;
    const candidate = entry as Record<string, unknown>;
    return (
      isFiniteNumber(candidate.level) &&
      isFiniteNumber(candidate.max) &&
      isFiniteNumber(candidate.used) &&
      candidate.max > 0
    );
  });
}

/** Matches the reading order `PlayerMySpells.vue` already uses for slot pips:
 *  by level, then the caster's default pool before any special one. */
const POOL_ORDER: Record<SpellSlotPool, number> = {
  spellcasting: 0,
  pact: 1,
  temporary: 2,
  feature: 3,
};

function slotGroups(raw: unknown): TableVitalsSlotGroup[] {
  return validSlots(raw)
    .map((slot) => ({
      level: slot.level,
      // Reuses `slotPool` (src/rules/spellSlots.ts) rather than re-deriving
      // the "legacy rows omit `pool`" default — that interpretation already
      // lives in one place and every other slot-consuming component reads it
      // through this function.
      pool: slotPool(slot),
      remaining: Math.max(0, slot.max - slot.used),
      max: slot.max,
    }))
    .sort((a, b) => a.level - b.level || POOL_ORDER[a.pool] - POOL_ORDER[b.pool]);
}

const REST_CADENCES = new Set(["short", "long"]);

/** Same defensive stance as `validSlots`: `class_resources` is jsonb keyed by
 *  an arbitrary resource name, and neither the key nor the value's shape is
 *  enforced below the application layer. */
function resourceRows(raw: unknown): TableVitalsResource[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>)
    .filter((entry): entry is [string, { current: number; max: number; rest: "short" | "long" }] => {
      const [, value] = entry;
      if (typeof value !== "object" || value === null) return false;
      const candidate = value as Record<string, unknown>;
      return (
        isFiniteNumber(candidate.current) &&
        isFiniteNumber(candidate.max) &&
        candidate.max > 0 &&
        typeof candidate.rest === "string" &&
        REST_CADENCES.has(candidate.rest)
      );
    })
    .map(([key, value]) => ({
      key,
      label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      current: value.current,
      max: value.max,
      rest: value.rest,
    }));
}

/**
 * `member.concentration === null` means "not concentrating" — a real, common
 * state, not an absence to paper over, so it resolves to `null` here too.
 * What this actually guards against is the *other* falsy-ish shape: a blob
 * that parses as an object but is missing the one field a row is useless
 * without (`spellName`). Whatever produced that, showing an unlabelled
 * concentration badge is worse than showing none.
 */
function concentrationRow(raw: unknown): TableVitalsConcentration | null {
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.spellName !== "string" || !candidate.spellName) return null;
  return {
    spellName: candidate.spellName,
    startedRound: isFiniteNumber(candidate.startedRound) ? candidate.startedRound : null,
  };
}

/**
 * `PartyMember[]` → the rows the Table Vitals card renders. A member with no
 * slots, no resources and no active concentration contributes nothing: a
 * card that reserves a row per party member regardless is a worse
 * "at a glance" scan than one that only shows characters with something to
 * show. Order is preserved from `members` (already `sort_order` from
 * `useParty`) rather than re-sorted here.
 */
export function buildTableVitalsRows(members: readonly PartyMember[]): TableVitalsRow[] {
  return members.flatMap((member) => {
    const slots = slotGroups(member.spell_slots);
    const resources = resourceRows(member.class_resources);
    const concentration = concentrationRow(member.concentration);
    if (!slots.length && !resources.length && !concentration) return [];
    return [{ id: member.id, name: member.name, slots, resources, concentration }];
  });
}
