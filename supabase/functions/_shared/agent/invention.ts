// The Dungeon Master's ruling on a player's invention at the AI table (#1021 row 14, #1103 story 6). Pure: no I/O.
//
// A player invents an item in the Workshop; it waits as `pending` for the campaign's DM. At the AI table the player
// is the campaign's owner, who holds the DM membership, so the Narrator rules through the same RPC the DM's queue
// calls (`decide_crafting_invention`), as the caller. The six checks of #1103 (rarity and value paid for in
// materials, the discipline's lane, power fits rarity, an existing item preferred, the roll) ran in code before the
// draft existed and are not repeated here: the Narrator judges what code cannot, whether the thing fits this world.
//
// Like every move at the table the ruling is queued and applied only once the turn is kept: an approval creates an
// item and a recipe and has no undo, and a turn that was not kept is sent again by the player.

import type { InventionDraft, InventionMechanic } from "../invention/types.ts";
import type { AgentTool } from "./types.ts";
import { type Parsed, refuse } from "./parse.ts";

export const RULE_INVENTION_TOOL_NAME = "rule_invention";

/** How many are shown at once, oldest first; the rest wait for a later turn. */
export const INVENTIONS_SHOWN = 3;
/** The database's own limit on the note (`crafting_inventions.dm_note`). */
export const RULING_NOTE_MAX = 1000;
const RULES_TEXT_MAX = 300;

export interface PendingInvention {
  id: string;
  /** When the player sent it to the DM, ISO; the oldest is shown first. */
  createdAt: string;
  discipline: string;
  name: string;
  rarity: string;
  itemType: string;
  /** The value as the campaign's coins word it when the item is new, else in copper. */
  value: string;
  /** The item's rules in prose; null when the draft is an existing item. */
  rules: string | null;
  /** Each declared mechanic in a few words. */
  mechanics: string[];
  /** The checker's plain sentences about undeclared mechanics found in the prose. */
  warnings: string[];
  /** The new materials the draft proposes, which approving also creates. */
  newMaterials: string[];
}

export interface InventionRuling {
  inventionId: string;
  decision: "approve" | "return";
  /** Present only for a return. */
  note: string | null;
  /** For the answer and the logs; never sent to the database. */
  name: string;
}

function mechanicText(m: InventionMechanic): string {
  switch (m.kind) {
    case "minor": return m.text;
    case "attack_bonus": return `+${m.value} to attack`;
    case "ac_bonus": return `+${m.value} to AC`;
    case "save_bonus": return `+${m.value} to saves`;
    case "extra_damage": return `extra ${m.dice} ${m.damage_type} damage`;
    case "healing": return `heals ${m.dice}`;
    case "spell": return m.level === 0 ? `the cantrip ${m.name}` : `the level ${m.level} spell ${m.name}`;
    case "charges": return m.recharge === null ? `${m.max} charges` : `${m.max} charges, ${m.recharge}`;
    case "resistance": return `resistance to ${m.damage_type}`;
    case "advantage": return `advantage on ${m.on}`;
  }
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** The pending invention a stored draft stands for. */
export function pendingFrom(row: { id: string; createdAt: string; discipline: string; draft: InventionDraft }): PendingInvention {
  const { item } = row.draft;
  return {
    id: row.id,
    createdAt: row.createdAt,
    discipline: row.discipline,
    name: item.name,
    rarity: item.rarity,
    itemType: item.item_type,
    value: item.new === null ? `${item.value_cp} cp` : item.new.cost,
    rules: item.new === null ? null : oneLine(item.new.rules_text, RULES_TEXT_MAX),
    mechanics: row.draft.mechanics.map(mechanicText),
    warnings: row.draft.warnings,
    newMaterials: row.draft.ingredients.flatMap((i) => (i.new === null ? [] : [`${i.new.name} (${i.new.rarity}, ${i.new.cost})`])),
  };
}

/** The inventions waiting on a ruling, oldest first, at most three; empty (the section is absent) with none. */
export function inventionsSection(pending: readonly PendingInvention[]): string {
  const shown = [...pending].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).slice(0, INVENTIONS_SHOWN);
  if (shown.length === 0) return "";
  const blocks = shown.map((p) => {
    const lines = [
      `- id: ${p.id}`,
      `  ${p.name} (${p.rarity} ${p.itemType}, worth ${p.value}), invented through ${p.discipline}`,
      ...(p.rules === null || p.rules === "" ? [] : [`  Rules: ${p.rules}`]),
      `  Declared mechanics: ${p.mechanics.length === 0 ? "none" : p.mechanics.join("; ")}`,
      ...p.warnings.map((w) => `  Warning: ${w}`),
      ...p.newMaterials.map((m) => `  Proposes a new material: ${m}`),
    ];
    return lines.join("\n");
  });
  return [
    "## Inventions waiting on your ruling",
    "",
    "The player's character has invented these in the Workshop. The checks on rarity, value, the discipline and power have already passed; what is left is yours, as the Dungeon Master: whether it fits this world and this story. Rule with rule_invention.",
    "",
    blocks.join("\n"),
  ].join("\n");
}

export const RULE_INVENTION_TOOL: AgentTool = {
  name: RULE_INVENTION_TOOL_NAME,
  description:
    "Rules on an invention listed under \"Inventions waiting on your ruling\", in the Dungeon Master's place, by its id. " +
    "The rules checks have already passed, so judge what they cannot: whether the thing fits this world and this story, " +
    "whether any proposed new material is reasonable, and look hard at every warning about undeclared mechanics, since " +
    "a warning means the text promises more than the declared mechanics pay for. Approve what fits: the item and its " +
    "recipe then exist and are the player's. Return what does not, with a short note the player can act on, in the " +
    "voice of the world but clear about what to change; the player revises it and sends it again. A return needs a " +
    "note. Once a turn at most for each invention. The ruling takes effect when the turn is kept.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["invention_id", "decision"],
    properties: {
      invention_id: { type: "string", description: "The id of the invention, exactly as listed." },
      decision: { type: "string", enum: ["approve", "return"] },
      note: { type: "string", description: `What the player should change, for a return; at most ${RULING_NOTE_MAX} characters.` },
    },
  },
};

export function parseRulingInput(input: Record<string, unknown>): Parsed<{ inventionId: string; decision: "approve" | "return"; note: string | null }> {
  const id = input.invention_id;
  if (typeof id !== "string" || id.trim() === "") return refuse("invention_id must be the id of an invention, exactly as listed.");
  const decision = input.decision;
  if (decision !== "approve" && decision !== "return") return refuse("decision must be \"approve\" or \"return\".");
  const note = input.note;
  if (note !== undefined && typeof note !== "string") return refuse("note must be text.");
  const trimmed = note === undefined ? "" : note.trim();
  if (trimmed.length > RULING_NOTE_MAX) return refuse(`The note is ${trimmed.length} characters; at most ${RULING_NOTE_MAX}. Shorten it.`);
  if (decision === "return" && trimmed === "") return refuse("A return needs a note: the player has to know what to change.");
  return { ok: true, value: { inventionId: id.trim(), decision, note: decision === "return" ? trimmed : null } };
}

export type PlannedRuling = { ok: true; ruling: InventionRuling; says: string } | { ok: false; error: string };

export function planRuling(pending: readonly PendingInvention[], ruled: readonly InventionRuling[], toolInput: Record<string, unknown>): PlannedRuling {
  const parsed = parseRulingInput(toolInput);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { inventionId, decision, note } = parsed.value;
  const shown = [...pending].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).slice(0, INVENTIONS_SHOWN);
  const invention = shown.find((p) => p.id === inventionId);
  if (!invention) {
    return { ok: false, error: `That is not one of the inventions waiting on your ruling${shown.length === 0 ? "; none is" : `; only these are: ${shown.map((p) => `${p.id} (${p.name})`).join("; ")}`}.` };
  }
  if (ruled.some((r) => r.inventionId === inventionId)) return { ok: false, error: `${invention.name} has already been ruled on this turn.` };
  return {
    ok: true,
    ruling: { inventionId, decision, note, name: invention.name },
    says: decision === "approve" ? `When the turn is kept, ${invention.name} is approved.` : `When the turn is kept, ${invention.name} is returned with your note.`,
  };
}
