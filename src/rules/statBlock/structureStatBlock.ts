/**
 * The one entry point writers call (#1017): a prose stat block in, a structured one
 * out. Every entry of every list gets a checked `structured` payload, and the four
 * defense strings become `defenses`. Pure; the input is never mutated.
 */
import type { ActionStructure, Defenses, StatBlockEntry } from "../../types/statBlock.types.ts";
import { type StatBlockListKey } from "./parseAction.ts";
import { parseDefenses } from "./parseDefenses.ts";
import { structureEntry } from "./structureEntry.ts";

export type ProseEntry = { name: string; description: string; structured?: ActionStructure };

export interface ProseStatBlockFields {
  special_abilities?: ProseEntry[];
  actions?: ProseEntry[];
  bonus_actions?: ProseEntry[];
  reactions?: ProseEntry[];
  legendary_actions?: ProseEntry[];
  lair_actions?: ProseEntry[];
  damage_resistances?: string | null;
  damage_immunities?: string | null;
  damage_vulnerabilities?: string | null;
  condition_immunities?: string | null;
  defenses?: Defenses;
}

const LIST_KEYS = [
  "special_abilities",
  "actions",
  "bonus_actions",
  "reactions",
  "legendary_actions",
  "lair_actions",
] as const satisfies readonly StatBlockListKey[];

type ListKeys = (typeof LIST_KEYS)[number];
type DefenseStringKeys =
  | "damage_resistances"
  | "damage_immunities"
  | "damage_vulnerabilities"
  | "condition_immunities";

export type StructuredStatBlock<T extends ProseStatBlockFields> = Omit<T, DefenseStringKeys | ListKeys | "defenses"> & {
  [K in ListKeys]?: StatBlockEntry[];
} & { defenses: Defenses };

export function structureStatBlock<T extends ProseStatBlockFields>(block: T): StructuredStatBlock<T> {
  const siblings = LIST_KEYS.flatMap((key) => (block[key] ?? []).map((e) => e.name));

  // Widened to a plain record to add, replace and drop keys; the return type restores the shape.
  const rest = { ...block } as Record<string, unknown>;
  for (const key of [
    "damage_resistances",
    "damage_immunities",
    "damage_vulnerabilities",
    "condition_immunities",
  ] as const) {
    delete rest[key];
  }

  for (const key of LIST_KEYS) {
    const entries = block[key];
    if (entries === undefined) continue;
    rest[key] = entries.map(
      (entry): StatBlockEntry => ({
        name: entry.name,
        description: entry.description,
        structured: structureEntry(entry, { list: key, siblings }),
      }),
    );
  }

  rest.defenses = block.defenses ?? parseDefenses(block);
  return rest as unknown as StructuredStatBlock<T>;
}
