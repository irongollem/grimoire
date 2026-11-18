// The campaign's own encounter tables on a journey (#1222, story 7 for the AI table).
//
// A DM places a roll table on a place in the Atlas ("Coast road encounters" on the Sword Coast). On a journey the
// narrator is told which tables hold for the places the road touches, and may roll on one when it decides chance
// should have a say. Whether anything happens at all stays its call (pacing, not a quota: the maintainer, 18 Nov
// 2026); the table only answers what, in the DM's own words. A place's tables hold for every place inside it,
// unless that place has tables of its own.
//
// Pure: the die is handed in.

import type { AgentTool } from "./types.ts";

export const ROLL_TABLE_TOOL_NAME = "roll_table";

export const ROLL_TABLE_TOOL: AgentTool = {
  name: ROLL_TABLE_TOOL_NAME,
  description:
    "Rolls on one of the campaign's own tables, behind the screen, and answers with the entry that came up, in the " +
    "Dungeon Master's own words. Use the table_id of a table travel listed for the road. Roll only once you have " +
    "decided that something happens at a stop and chance should say what; never roll to decide whether anything " +
    "happens, and never more than once for the same stop. An entry that names a prepared fight is started with " +
    "start_fight and that encounter_id. The player does not see the roll or the table: tell what it means in the story.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["table_id"],
    properties: { table_id: { type: "string", description: "The id of a table, as travel listed it." } },
  },
};

const DIE_MAX: Readonly<Record<string, number>> = { "1d4": 4, "1d6": 6, "1d8": 8, "1d10": 10, "1d12": 12, "1d20": 20, "1d100": 100 };

export interface TableEntry {
  min: number;
  max: number;
  label: string;
  notes: string | null;
  /** A prepared encounter this entry is, when the DM linked one. */
  encounterId: string | null;
}

export interface PlacedTable {
  id: string;
  name: string;
  dice: string;
  entries: TableEntry[];
  /** The place it was put on. */
  placeId: string;
}

/** A table's entries as stored (jsonb the DM's editor wrote), read defensively: anything that is not an entry is left out. */
export function entriesOf(raw: unknown): TableEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e: unknown): TableEntry[] => {
    if (typeof e !== "object" || e === null) return [];
    const r = e as Record<string, unknown>;
    if (typeof r.min !== "number" || typeof r.max !== "number" || typeof r.label !== "string" || r.label.trim() === "") return [];
    return [{
      min: r.min,
      max: r.max,
      label: r.label.trim(),
      notes: typeof r.notes === "string" && r.notes.trim() !== "" ? r.notes.trim() : null,
      encounterId: typeof r.encounter_id === "string" && r.encounter_id !== "" ? r.encounter_id : null,
    }];
  });
}

export interface TableOnTheWay {
  table: PlacedTable;
  /** The place of the way it holds for, by name. */
  forPlace: string;
}

/**
 * The tables that hold for the places of a way, in the way's order, each table once (at the first place it holds
 * for). A place's own tables win; a place with none takes those of the nearest place it lies inside that has any.
 */
export function tablesAlong(
  placeIds: readonly string[],
  parentOf: (id: string) => string | null,
  nameOf: (id: string) => string,
  tables: readonly PlacedTable[],
): TableOnTheWay[] {
  const byPlace = new Map<string, PlacedTable[]>();
  for (const table of tables) {
    const list = byPlace.get(table.placeId);
    if (list === undefined) byPlace.set(table.placeId, [table]);
    else list.push(table);
  }
  const out: TableOnTheWay[] = [];
  const listed = new Set<string>();
  for (const placeId of placeIds) {
    const seen = new Set<string>();
    for (let at: string | null = placeId; at !== null && !seen.has(at); at = parentOf(at)) {
      seen.add(at);
      const here = byPlace.get(at);
      if (here === undefined) continue;
      for (const table of here) {
        if (listed.has(table.id)) continue;
        listed.add(table.id);
        out.push({ table, forPlace: nameOf(placeId) });
      }
      break;
    }
  }
  return out;
}

/** The line of travel's answer that lists the tables; nothing when the campaign keeps none for this road. */
export function tablesLine(found: readonly TableOnTheWay[]): string | null {
  if (found.length === 0) return null;
  const list = found.map((f) => `"${f.table.name}" (${f.table.dice}, table_id ${f.table.id}) for ${f.forPlace}`).join("; ");
  return `Tables the campaign keeps for this road: ${list}. When you decide something happens at a stop and chance should say what, roll with roll_table.`;
}

/**
 * What the narrator is told after a roll. `roll(max)` answers a whole number from 1 to max. A face no entry covers
 * is an answer too: nothing from the table, and the narrator goes on by itself.
 */
export function rollAnswer(table: PlacedTable | undefined, roll: (max: number) => number): { content: string; isError: boolean } {
  if (table === undefined) return { content: "No table of this campaign's road has that id. Use a table_id that travel listed.", isError: true };
  const max = DIE_MAX[table.dice];
  if (max === undefined) return { content: `"${table.name}" has a die this table cannot roll.`, isError: true };
  const face = Math.max(1, Math.min(max, Math.trunc(roll(max))));
  const entry = table.entries.find((e) => face >= e.min && face <= e.max);
  if (entry === undefined) return { content: `Rolled ${face} on "${table.name}" (${table.dice}): no entry covers it. Nothing comes of the table; go on as you see fit.`, isError: false };
  const lines = [`Rolled ${face} on "${table.name}" (${table.dice}): ${entry.label}`];
  if (entry.notes !== null) lines.push(`The Dungeon Master's note: ${entry.notes}`);
  if (entry.encounterId !== null) lines.push(`This is a prepared fight: start it with start_fight and encounter_id ${entry.encounterId} when it comes to blows.`);
  return { content: lines.join("\n"), isError: false };
}
