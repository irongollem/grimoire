import { SKILLS } from "@/types/party.types";
import type { SaveKey } from "@/types/party.types";
import { combineModes } from "@/systems/dnd5e/dice/rollMode";
import type { RollAnswer, RollAsk, RollMode, Rolled } from "./soloTypes";

const ABILITIES: readonly SaveKey[] = ["str", "dex", "con", "int", "wis", "cha"];
const MODES: readonly RollMode[] = ["normal", "advantage", "disadvantage"];
const MAX_LABEL = 80;
/** A flat bonus the page will send or believe: generous for magic and expertise, never an absurd number. */
export const MIN_BONUS = -20;
export const MAX_BONUS = 40;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A d20 face: a whole number from 1 to 20. */
export function isFace(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 20;
}

function isBonus(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_BONUS && value <= MAX_BONUS;
}

function parseLabel(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" && value.length <= MAX_LABEL ? value : null;
}

/**
 * A request to roll, as the stream and the stored sitting both carry it, or null when it is not one. Only what the
 * card needs is kept: a stored sitting also holds the number to beat, and that must never reach the page.
 */
export function parseRollAsk(raw: unknown): RollAsk | null {
  if (!isRecord(raw)) return null;
  const label = parseLabel(raw.label);
  if (label === null) return null;
  if (raw.kind !== "check" && raw.kind !== "save") return null;
  const ability = ABILITIES.find((a) => a === raw.ability);
  if (ability === undefined) return null;
  if (raw.skill === null) return { label, kind: raw.kind, ability, skill: null };
  const skill = SKILLS.find((s) => s.key === raw.skill);
  // A save is never made with a skill; a skill the character sheet does not know cannot be scored.
  if (skill === undefined || raw.kind === "save") return null;
  return { label, kind: raw.kind, ability, skill: skill.key };
}

/** A roll as the server worked it out, or null when its arithmetic does not hold. */
export function parseRolled(raw: unknown): Rolled | null {
  if (!isRecord(raw)) return null;
  const label = parseLabel(raw.label);
  const { faces, kept, bonus, total, mode, atTable } = raw;
  if (label === null || !Array.isArray(faces) || faces.length < 1 || faces.length > 2 || !faces.every(isFace)) return null;
  const knownMode = MODES.find((m) => m === mode);
  if (knownMode === undefined || typeof atTable !== "boolean") return null;
  if (knownMode === "normal" && faces.length !== 1) return null;
  if (!isFace(kept) || !faces.includes(kept) || !isBonus(bonus) || total !== kept + bonus) return null;
  return { label, faces: [...faces], kept, bonus, total, mode: knownMode, atTable };
}

/** Advantage the player chose and disadvantage a condition imposes cancel to a normal roll (PHB 2014 "Advantage and Disadvantage"). */
export function effectiveMode(chosen: RollMode, forcedDisadvantage: boolean): RollMode {
  return combineModes(chosen, forcedDisadvantage ? "disadvantage" : "normal");
}

/** How many faces rolled on screen make this mode: two dice for advantage or disadvantage, otherwise one. */
export function facesToRoll(mode: RollMode): 1 | 2 {
  return mode === "normal" ? 1 : 2;
}

export type RollChoice = { source: "screen"; faces: readonly number[] } | { source: "table"; face: number };

/**
 * The `roll` a turn carries. On screen the faces are the ones rolled (two for advantage or disadvantage); at the
 * table the player types the one face they keep. Null when it is not a roll the server would accept.
 */
export function rollBody(choice: RollChoice, mode: RollMode, bonus: number): RollAnswer | null {
  if (!isBonus(bonus)) return null;
  if (choice.source === "table") {
    return isFace(choice.face) ? { faces: [choice.face], mode, bonus, atTable: true } : null;
  }
  if (choice.faces.length !== facesToRoll(mode) || !choice.faces.every(isFace)) return null;
  return { faces: [...choice.faces], mode, bonus, atTable: false };
}

export interface RollLine {
  total: string;
  title: string;
  detail: string;
}

/** The three texts of a roll in the story: the total, who rolled what, and the dice behind it. */
export function rollLine(rolled: Rolled, who: string): RollLine {
  const dice = `d20 (${rolled.faces.join(", ")})`;
  const bonus = rolled.bonus > 0 ? ` + ${rolled.bonus}` : rolled.bonus < 0 ? ` - ${-rolled.bonus}` : "";
  const keep = rolled.faces.length === 2 ? (rolled.mode === "advantage" ? ", the higher" : rolled.mode === "disadvantage" ? ", the lower" : "") : "";
  return {
    total: String(rolled.total),
    title: `${who} rolled ${rolled.label}`,
    detail: `${dice}${bonus}${keep}${rolled.atTable ? " · rolled at the table" : ""}`,
  };
}
