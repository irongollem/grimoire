/**
 * Rolling a random encounter table.
 *
 * `rollOnTable` returns the rolled value + the matching entry (or null when
 * no entry covers the rolled face — sparse tables are fine, that just means
 * "no encounter, keep walking"). The roll itself is delegated to the central
 * `rollDice` so sound + future history hook in for free.
 */

import { rollDice, type DieSize } from "@/lib/roller";
import {
  ROLL_TABLE_DIE_MAX,
  type RollTable,
  type RollTableDie,
  type RollTableEntry,
} from "@/types/rollTable.types";

const DIE_TO_SIZE: Record<RollTableDie, DieSize> = {
  "1d4":   4,
  "1d6":   6,
  "1d8":   8,
  "1d10":  10,
  "1d12":  12,
  "1d20":  20,
  "1d100": 100,
};

export interface RollTableRollResult {
  /** The rolled face (1..die_max). */
  rolled: number;
  /** The matching entry, or null when no entry covers the rolled face. */
  entry: RollTableEntry | null;
}

/** Roll the table's die and return the matching entry (or null). */
export function rollOnTable(table: RollTable): RollTableRollResult {
  const size = DIE_TO_SIZE[table.dice];
  const max = ROLL_TABLE_DIE_MAX[table.dice];
  const rolled = rollDice({ [size]: 1 }, 0).total;
  // Defensive clamp in case rollDice is ever changed to return something off-range.
  const face = Math.max(1, Math.min(max, rolled));
  const entry = table.entries.find((e) => face >= e.min && face <= e.max) ?? null;
  return { rolled: face, entry };
}
