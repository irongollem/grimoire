// A natural hazard brought into the story with real rules (#1021 row 20). Pure: no I/O.
//
// The maintainer, 18 Nov 2026: a story in a jungle may want quicksand, a monsoon or a plague of mosquitoes, and if
// the campaign's hazards hold none of them "he should be able to introduce and create new such hazards". Dungeon
// Craft keeps hazards as traps of the Environmental kind (`traps`, `library_traps`). So the narrator names the
// hazard it wants; the campaign and the library are looked through first and what exists is handed back with its
// rules; only when nothing of that name exists is one made, a real record of the campaign marked as made by the AI
// table, used at once ("during play continuity is most important") and left for the DM to keep, edit or remove.
//
// Three rules, as for a person the narrator makes up (`introduce.ts`):
//   1. What exists is used: the name is checked before anything is made.
//   2. The record is made when the turn is kept, like every other write of a turn.
//   3. One a turn, and small: a name, what it does, a save and its harm.

import type { AgentTool } from "./types.ts";

export const HAZARD_TOOL_NAME = "hazard";
export const HAZARDS_PER_TURN = 1;
export const HAZARD_NAME_MAX = 80;
export const HAZARD_EFFECT_MAX = 600;
export const HAZARD_DC_MIN = 5;
export const HAZARD_DC_MAX = 25;
export const SAVE_ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
export type SaveAbility = (typeof SAVE_ABILITIES)[number];

export const HAZARD_TOOL: AgentTool = {
  name: HAZARD_TOOL_NAME,
  description:
    "Brings a natural hazard into the story with rules of its own: quicksand, thin ice, a rockslide, a flash flood, " +
    "a swarm of biting flies. Only where the place and the weather make it natural, and when the story has room for " +
    "it. Call it with the name alone first: the campaign and the library are looked through, and when a hazard of " +
    "that name exists you are given its rules; use those as written. When none exists you are told so, and may call " +
    "again with the whole of it, and it becomes a record of the campaign that the Dungeon Master can keep, change or " +
    "remove: effect (one to three sentences: what it does to someone caught in it and how they get out), save (the " +
    "ability of the saving throw) and dc (10 easy, 13 moderate, 15 hard, 18 or more deadly; fit it to the party), " +
    "and damage_dice with damage_type when it harms. Reach for what exists before making anything new. Then tell it " +
    "and rule it like anything else: ask for the roll, and roll its harm with the roll tool. One hazard a turn.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string", maxLength: HAZARD_NAME_MAX, description: "The hazard's plain name: \"Quicksand\", \"Thin Ice\"." },
      effect: { type: "string", maxLength: HAZARD_EFFECT_MAX, description: "Only when making one: what it does and how one gets out, in one to three sentences." },
      save: { type: "string", enum: [...SAVE_ABILITIES], description: "Only when making one: the ability of the saving throw against it." },
      dc: { type: "integer", minimum: HAZARD_DC_MIN, maximum: HAZARD_DC_MAX, description: "Only when making one: the saving throw's DC." },
      damage_dice: { type: "string", description: "Only when making one that harms: the dice, like \"2d6\"." },
      damage_type: { type: "string", description: "With damage_dice: the kind of damage, like \"cold\" or \"bludgeoning\"." },
    },
    required: ["name"],
  },
};

/** A hazard's rules, whether the campaign or the library keeps it or the narrator is making it. */
export interface HazardRules {
  name: string;
  effect: string | null;
  save: string | null;
  dc: number | null;
  damage: Array<{ dice: string; type: string }>;
}

/** A hazard the campaign or the library already keeps. */
export interface KeptHazard extends HazardRules {
  where: "campaign" | "library";
}

export type HazardAsk = { kind: "look"; name: string } | { kind: "make"; hazard: HazardRules };

type Parsed = { ok: true; value: HazardAsk } | { ok: false; error: string };

const DICE = /^\d{1,2}d\d{1,3}(?:\s*[+-]\s*\d{1,3})?$/i;

export function parseHazard(input: Record<string, unknown>): Parsed {
  const { name, effect, save, dc, damage_dice: dice, damage_type: type } = input;
  if (typeof name !== "string" || name.trim() === "") return { ok: false, error: "name is required: the hazard's plain name." };
  if (name.trim().length > HAZARD_NAME_MAX) return { ok: false, error: `name is at most ${HAZARD_NAME_MAX} characters.` };
  if (effect === undefined && save === undefined && dc === undefined && dice === undefined && type === undefined) return { ok: true, value: { kind: "look", name: name.trim() } };
  if (typeof effect !== "string" || effect.trim() === "") return { ok: false, error: "To make a hazard, effect is required: what it does and how one gets out." };
  if (effect.trim().length > HAZARD_EFFECT_MAX) return { ok: false, error: `effect is at most ${HAZARD_EFFECT_MAX} characters.` };
  if (typeof save !== "string" || !(SAVE_ABILITIES as readonly string[]).includes(save)) return { ok: false, error: `save must be one of ${SAVE_ABILITIES.join(", ")}.` };
  if (typeof dc !== "number" || !Number.isInteger(dc) || dc < HAZARD_DC_MIN || dc > HAZARD_DC_MAX) return { ok: false, error: `dc must be a whole number from ${HAZARD_DC_MIN} to ${HAZARD_DC_MAX}.` };
  const damage: HazardRules["damage"] = [];
  if (dice !== undefined || type !== undefined) {
    if (typeof dice !== "string" || !DICE.test(dice.trim())) return { ok: false, error: "damage_dice must be dice like \"2d6\" or \"1d10+2\"." };
    if (typeof type !== "string" || type.trim() === "" || type.trim().length > 30) return { ok: false, error: "damage_type is required with damage_dice: the kind of damage." };
    damage.push({ dice: dice.trim().replace(/\s+/g, ""), type: type.trim().toLowerCase() });
  }
  return { ok: true, value: { kind: "make", hazard: { name: name.trim(), effect: effect.trim(), save, dc, damage } } };
}

/** A hazard's rules in a line or two, as the narrator is given them. */
export function hazardRulesText(h: HazardRules): string {
  const save = h.save !== null && h.dc !== null ? `${h.save} saving throw, DC ${h.dc}` : h.dc !== null ? `DC ${h.dc}` : "no saving throw written";
  const harm = h.damage.length === 0 ? "no damage written" : h.damage.map((d) => `${d.dice} ${d.type}`).join(" + ");
  return `${h.name}: ${h.effect ?? "no effect written"} (${save}; ${harm}).`;
}

export function keptHazardText(h: KeptHazard): string {
  return `The ${h.where} already keeps this hazard. Use it as written, and make nothing new: ${hazardRulesText(h)}`;
}

export function noSuchHazardText(name: string): string {
  return `Neither the campaign nor the library keeps a hazard called "${name}". If the story needs it, call this again with name, effect, save and dc (and damage_dice with damage_type when it harms), and it is made.`;
}

export function madeHazardText(h: HazardRules): string {
  return `Made, once this turn is kept; the Dungeon Master will find it among the campaign's hazards. Use it now as written: ${hazardRulesText(h)}`;
}

/** A stored trap row as the rules a narrator uses. */
export function hazardFromRow(row: Record<string, unknown>, where: KeptHazard["where"]): KeptHazard {
  const entries = Array.isArray(row.damage_entries) ? row.damage_entries : [];
  const damage = entries.flatMap((e): HazardRules["damage"] => {
    if (typeof e !== "object" || e === null) return [];
    const { dice, type } = e as Record<string, unknown>;
    return typeof dice === "string" && dice.trim() !== "" ? [{ dice, type: typeof type === "string" ? type : "" }] : [];
  });
  return {
    where,
    name: String(row.name),
    effect: typeof row.effect_description === "string" && row.effect_description.trim() !== "" ? row.effect_description : null,
    save: typeof row.save_type === "string" && row.save_type.trim() !== "" ? row.save_type : null,
    dc: typeof row.save_dc === "number" ? row.save_dc : null,
    damage,
  };
}
