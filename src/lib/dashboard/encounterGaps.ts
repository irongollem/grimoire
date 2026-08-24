import type { Encounter } from "@/types/encounter.types";

/**
 * "Encounters missing pieces" (#764) — which built encounters are not
 * actually ready to run yet, and which specific field is why.
 *
 * Three gaps, each chosen because a DM can directly fill it in from the
 * encounter editor and its absence changes what happens at the table:
 *
 * - **`combatants`** — `combatants` (src/types/encounter.types.ts:55) is
 *   empty. Nothing to roll initiative for; this is the strongest gap, since
 *   every other piece of the encounter (difficulty, factions, events) exists
 *   to describe a fight that in this state does not exist.
 * - **`location`** — `location_id` (encounter.types.ts:61) is null. The
 *   runner's VTT battle map and the atlas link both need a place; without one
 *   the encounter can still theoretically run in theatre of mind, so this
 *   ranks below missing combatants but still blocks the map-driven parts of
 *   the runner.
 * - **`reward`** — neither `item_ids` nor `reward_currency_pools`
 *   (encounter.types.ts:57,59) has anything in it. Ranked last, matching
 *   PrepGapsWidget's ordering rationale one file over: a reward only
 *   disappoints the party after the fight, it never blocks running it.
 *
 * `art_objects` (encounter.types.ts:60) is deliberately NOT part of the
 * reward check even though it lives on the same type: no editor anywhere in
 * the app writes to it (EncounterLoot.vue only binds `item-ids` and
 * `currency-pools`; EncounterGeneratorPanel.vue always creates it as `[]`).
 * Flagging an empty array a DM has no UI to fill in would be inventing a
 * gap, which is exactly what this widget must not do.
 *
 * The reward check is also skipped whenever `combatants` is already empty.
 * `Encounter` has no separate "kind" field to tell a genuine social/
 * negotiation encounter (no monsters, no loot — and that is fine) apart from
 * a combat encounter someone has only half-built, so combatant presence is
 * the only signal available. An encounter with zero combatants already
 * reports the stronger `combatants` gap; also demanding a reward for a fight
 * that does not exist yet would double-penalise the same missing piece and
 * would flag a legitimately reward-less social encounter as broken.
 *
 * A finished encounter (`is_finished: true`) is dropped before gaps are even
 * computed: "not ready to run" cannot apply to something that already ran,
 * whatever it does or doesn't have set.
 */

export type EncounterGapKind = "combatants" | "location" | "reward";

/** Lowercase nouns, meant to follow "Missing " in the widget row, joined with ", ". */
export const ENCOUNTER_GAP_LABELS: Record<EncounterGapKind, string> = {
  combatants: "combatants",
  location: "location",
  reward: "reward",
};

/** Severity order — lower sorts first. Mirrors the rationale in the module comment. */
const GAP_RANK: Record<EncounterGapKind, number> = {
  combatants: 0,
  location: 1,
  reward: 2,
};

export interface EncounterGapRow {
  encounterId: string;
  encounterName: string;
  /** Always non-empty and already in severity order (worst first). */
  gaps: EncounterGapKind[];
}

function gapsFor(encounter: Encounter): EncounterGapKind[] {
  const gaps: EncounterGapKind[] = [];
  const hasCombatants = encounter.combatants.length > 0;

  if (!hasCombatants) gaps.push("combatants");
  if (encounter.location_id === null) gaps.push("location");
  // See module comment: only a combat encounter (one with combatants) is
  // expected to carry a reward, and combatant absence is already its own gap.
  if (
    hasCombatants &&
    encounter.item_ids.length === 0 &&
    encounter.reward_currency_pools.length === 0
  ) {
    gaps.push("reward");
  }

  return gaps;
}

/**
 * One row per not-finished encounter that is missing at least one piece,
 * ordered so the least-ready encounters surface first: primarily by the
 * severity of the worst gap present (combatants < location < reward, per
 * `GAP_RANK`), then by how many pieces are missing, then by name so the
 * order is stable when both are equal.
 */
export function deriveEncounterGapRows(encounters: readonly Encounter[]): EncounterGapRow[] {
  const rows = encounters
    .filter((encounter) => !encounter.is_finished)
    .map((encounter) => ({ encounter, gaps: gapsFor(encounter) }))
    .filter((row) => row.gaps.length > 0);

  return rows
    .map((row) => ({
      encounterId: row.encounter.id,
      encounterName: row.encounter.name || "Unnamed Encounter",
      gaps: [...row.gaps].sort((a, b) => GAP_RANK[a] - GAP_RANK[b]),
    }))
    .sort((a, b) => {
      const worstA = GAP_RANK[a.gaps[0]];
      const worstB = GAP_RANK[b.gaps[0]];
      return worstA - worstB || b.gaps.length - a.gaps.length || a.encounterName.localeCompare(b.encounterName);
    });
}
