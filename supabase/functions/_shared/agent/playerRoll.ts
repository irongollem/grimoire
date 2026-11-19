// When the roll is the player's (#1021, Solo Table canvas, frame "Your roll").
//
// "Players love rolling physical dice. Don't exclude them." The narrator never rolls for the player's own character:
// it asks (`ask_roll`), the story stops, and the player rolls on screen or at the table and types the face. The
// answer comes back with the player's next message and is scored here against a number the player never sees.
//
// Three rules:
//   1. The target stays on the server. What the page is told is what to roll, never the number to beat, and the
//      echo of a roll carries no success or failure: the story says how it went.
//   2. The bonus is the page's. The character sheet's rules live in the client (expertise, Jack of All Trades, a
//      condition's disadvantage, the 2024 Exhaustion penalty), and the number on the card must be the number on the
//      sheet. A player who may type the face they rolled at the table cannot be policed on the bonus either; the
//      server only bounds both and does the arithmetic.
//   3. A request to roll is made when the turn is kept, like every other write of a turn, and lasts one turn: the
//      next message answers it or drops it.
//
// Pure: no I/O.

import type { AgentTool, PlayerRolled } from "./types.ts";
import type { Parsed } from "./parse.ts";
import { isRecord } from "./parse.ts";

export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
export type RollKind = "check" | "save";
export type RollMode = "normal" | "advantage" | "disadvantage";

const ABILITY_NAMES: Record<Ability, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

// SRD 5.1 "Using Each Ability": each skill and the ability it usually goes with. The keys are the ones
// `party_members.skill_proficiencies` uses.
const SKILLS: Record<string, { name: string; ability: Ability }> = {
  athletics: { name: "Athletics", ability: "str" },
  acrobatics: { name: "Acrobatics", ability: "dex" },
  sleight_of_hand: { name: "Sleight of Hand", ability: "dex" },
  stealth: { name: "Stealth", ability: "dex" },
  arcana: { name: "Arcana", ability: "int" },
  history: { name: "History", ability: "int" },
  investigation: { name: "Investigation", ability: "int" },
  nature: { name: "Nature", ability: "int" },
  religion: { name: "Religion", ability: "int" },
  animal_handling: { name: "Animal Handling", ability: "wis" },
  insight: { name: "Insight", ability: "wis" },
  medicine: { name: "Medicine", ability: "wis" },
  perception: { name: "Perception", ability: "wis" },
  survival: { name: "Survival", ability: "wis" },
  deception: { name: "Deception", ability: "cha" },
  intimidation: { name: "Intimidation", ability: "cha" },
  performance: { name: "Performance", ability: "cha" },
  persuasion: { name: "Persuasion", ability: "cha" },
};

/** SRD 5.1 "Typical Difficulty Classes" runs from 5 to 30; 1 to 4 are left in for a roll that is nearly a formality. */
export const DC_MIN = 1;
export const DC_MAX = 30;
/** No sheet reaches these; they keep a typed or tampered bonus from deciding the roll by itself. */
export const BONUS_MIN = -20;
export const BONUS_MAX = 40;

/** What the player is asked to roll. `dc` never leaves the server. */
export interface PendingRoll {
  label: string;
  kind: RollKind;
  ability: Ability;
  skill: string | null;
  dc: number;
}

/** A pending roll as the page is told of it. */
export type RollAsk = Omit<PendingRoll, "dc">;

export function askOf(pending: PendingRoll): RollAsk {
  return { label: pending.label, kind: pending.kind, ability: pending.ability, skill: pending.skill };
}

/** The player's answer, as the page sends it. */
export interface RollAnswer {
  faces: number[];
  mode: RollMode;
  bonus: number;
  atTable: boolean;
}

/** A roll as it is shown and stored: the arithmetic, and nothing of how it went. */
export type Rolled = PlayerRolled;

const isAbility = (x: unknown): x is Ability => typeof x === "string" && Object.hasOwn(ABILITY_NAMES, x);
const isWhole = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;

// --- the tool ---------------------------------------------------------------------------------------------------

export const ASK_ROLL_TOOL: AgentTool = {
  name: "ask_roll",
  description:
    "Asks the player to roll for their own character: an ability check or a saving throw whose outcome chance decides. " +
    "You never roll for the player's character. Give the ability, the skill when one applies, and the DC (the player " +
    "is never shown it). The story then stops: end your reply with one sentence that says what to roll and why, and " +
    "do not narrate the outcome. The player's result arrives with their next message, already scored. One request a " +
    "turn. For anyone else's roll, use the roll tool.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      kind: { type: "string", enum: ["check", "save"], description: "An ability check or a saving throw." },
      ability: { type: "string", enum: Object.keys(ABILITY_NAMES), description: "The ability rolled." },
      skill: {
        type: "string",
        enum: Object.keys(SKILLS),
        description: "For a check: the skill that applies, if one does. Leave out for a plain ability check or a save.",
      },
      dc: { type: "integer", minimum: DC_MIN, maximum: DC_MAX, description: "The number to meet or beat. Never told to the player." },
    },
    required: ["kind", "dc"],
  },
};


/**
 * What the narrator asked for, with the name the page shows. The name is built here, never taken from the model, so
 * it cannot carry the DC or a hint of what is behind the door. A skill brings its usual ability when none is given
 * (SRD 5.1: a skill may be rolled with another ability, so one that is given is kept).
 */
export function parseAskRollInput(input: Record<string, unknown>): Parsed<PendingRoll> {
  const { kind, ability, skill, dc } = input;
  if (kind !== "check" && kind !== "save") return { ok: false, error: "kind must be \"check\" or \"save\"." };
  if (!isWhole(dc, DC_MIN, DC_MAX)) return { ok: false, error: `dc must be a whole number from ${DC_MIN} to ${DC_MAX}.` };
  if (ability !== undefined && !isAbility(ability)) return { ok: false, error: "ability must be one of str, dex, con, int, wis, cha." };
  if (skill !== undefined && (typeof skill !== "string" || !Object.hasOwn(SKILLS, skill))) {
    return { ok: false, error: `skill must be one of: ${Object.keys(SKILLS).join(", ")}.` };
  }
  if (kind === "save") {
    if (skill !== undefined) return { ok: false, error: "A saving throw has no skill." };
    if (ability === undefined) return { ok: false, error: "A saving throw needs its ability." };
    return { ok: true, value: { label: `${ABILITY_NAMES[ability]} saving throw`, kind, ability, skill: null, dc } };
  }
  if (skill !== undefined) {
    const s = SKILLS[skill];
    const used = ability === undefined ? s.ability : ability;
    return { ok: true, value: { label: `${ABILITY_NAMES[used]} (${s.name})`, kind, ability: used, skill, dc } };
  }
  if (ability === undefined) return { ok: false, error: "A check needs an ability, a skill, or both." };
  return { ok: true, value: { label: ABILITY_NAMES[ability], kind, ability, skill: null, dc } };
}

// --- what is stored and what is sent ----------------------------------------------------------------------------

/** The session's `pending_roll` column, or null when it holds nothing this code wrote. */
export function parsePendingRoll(raw: unknown): PendingRoll | null {
  if (!isRecord(raw)) return null;
  const { label, kind, ability, skill, dc } = raw;
  if (typeof label !== "string" || label === "") return null;
  if (kind !== "check" && kind !== "save") return null;
  if (!isAbility(ability) || !isWhole(dc, DC_MIN, DC_MAX)) return null;
  if (skill !== null && (typeof skill !== "string" || !Object.hasOwn(SKILLS, skill))) return null;
  return { label, kind, ability, skill, dc };
}

/**
 * The `roll` of a request, or null when it is not one. One face for a normal roll. With advantage or disadvantage,
 * two when the page rolled them; one only when the player rolled at the table and typed the face they kept.
 */
export function parseRollAnswer(raw: unknown): RollAnswer | null {
  if (!isRecord(raw)) return null;
  const { faces, mode, bonus, atTable } = raw;
  if (mode !== "normal" && mode !== "advantage" && mode !== "disadvantage") return null;
  if (typeof atTable !== "boolean" || !isWhole(bonus, BONUS_MIN, BONUS_MAX)) return null;
  if (!Array.isArray(faces) || !faces.every((f) => isWhole(f, 1, 20))) return null;
  const wanted = mode === "normal" || atTable ? 1 : 2;
  if (faces.length !== wanted) return null;
  return { faces: [...faces], mode, bonus, atTable };
}

/** A stored roll read back from a turn's block, or null when it is not one this code wrote. */
export function parseRolled(raw: unknown): Rolled | null {
  if (!isRecord(raw)) return null;
  const { label, faces, kept, bonus, total, mode, atTable } = raw;
  if (typeof label !== "string" || label === "" || typeof atTable !== "boolean") return null;
  if (mode !== "normal" && mode !== "advantage" && mode !== "disadvantage") return null;
  if (!Array.isArray(faces) || faces.length < 1 || faces.length > 2 || !faces.every((f) => isWhole(f, 1, 20))) return null;
  if (!isWhole(kept, 1, 20) || !faces.includes(kept) || !isWhole(bonus, BONUS_MIN, BONUS_MAX)) return null;
  if (total !== kept + bonus) return null;
  return { label, faces: [...faces], kept, bonus, total, mode, atTable };
}

// --- scoring ----------------------------------------------------------------------------------------------------

/**
 * The roll worked out. SRD 5.1 "Advantage and Disadvantage": the higher of two with advantage, the lower with
 * disadvantage. "Ability Checks" and "Saving Throws": the total meets or beats the DC. A natural 1 or 20 decides
 * nothing here; that rule is the attack roll's.
 */
export function scoreRoll(pending: PendingRoll, answer: RollAnswer): { rolled: Rolled; success: boolean } {
  const kept = answer.mode === "disadvantage" ? Math.min(...answer.faces) : Math.max(...answer.faces);
  const total = kept + answer.bonus;
  return {
    rolled: { label: pending.label, faces: answer.faces, kept, bonus: answer.bonus, total, mode: answer.mode, atTable: answer.atTable },
    success: total >= pending.dc,
  };
}

const signed = (n: number): string => (n < 0 ? `- ${-n}` : `+ ${n}`);

/** The roll as the narrator reads it, ahead of whatever the player typed with it. */
export function rollText(pending: PendingRoll, scored: { rolled: Rolled; success: boolean }): string {
  const r = scored.rolled;
  const how = r.mode === "normal" ? "" : `, with ${r.mode}`;
  return (
    `The player made the roll you asked for, ${pending.label}${how}: d20 (${r.faces.join(", ")}) ${signed(r.bonus)} = ` +
    `${r.total} against DC ${pending.dc}. It ${scored.success ? "succeeds" : "fails"}.${naturalText(r.kept, scored.success)} Narrate what comes of it now. ` +
    "Never tell the player the DC, and do not ask for this roll again."
  );
}

/**
 * What a natural 20 or 1 on the die asks of the telling. App convention, not a rule: by the book a natural 1 or 20
 * decides nothing on a check or a save, and it decides nothing here either (the total against the DC did). It only
 * colours how the outcome is told, as a table cheers a 20 and groans at a 1 (the maintainer, 17 Nov 2026).
 */
export function naturalText(kept: number, success: boolean): string {
  if (kept === 20) {
    return success
      ? " The die showed a natural 20: tell it as a moment of brilliance, with one detail that goes better than anyone hoped. It changes no number and grants nothing extra."
      : " The die showed a natural 20 and it still was not enough: tell a superb effort against something simply beyond them."
  }
  if (kept === 1) {
    return success
      ? " The die showed a natural 1 and skill alone carried it: tell a clumsy, lucky scrape through."
      : " The die showed a natural 1: tell the failure with a small mishap or indignity of the character's own making. It does no harm beyond failing.";
  }
  return "";
}

/** The player was asked to roll and sent something else instead: the request is over, and the narrator is told so. */
export function declinedText(pending: PendingRoll): string {
  return (
    `You asked the player for a roll (${pending.label}) and they did not make it; they sent the message below ` +
    "instead. That request is over: go by what they do now, and ask again only if it still depends on chance."
  );
}

/** What the tool answers the narrator once the request is queued. */
export function askedText(pending: PendingRoll): string {
  return (
    `The player will be asked for ${pending.label} when this turn is kept. End your reply now with one sentence that ` +
    "says what to roll and why. Do not narrate the outcome and do not name the DC: their result arrives with their next message."
  );
}
