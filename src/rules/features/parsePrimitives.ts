import type { AbilityKey } from "@/rules/characterCreation";
import { parseExpression } from "@/lib/dice/dice";
import type { ByLevel } from "./mechanics.types";

/**
 * The value checks every part of the mechanics parser shares (mechanics.ts,
 * effectParse.ts). Each returns a type guard or a parsed value and reports
 * into the caller's `errors`, never throws.
 */

export const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const satisfies readonly AbilityKey[];
export const ARMOR_KINDS = ["light", "medium", "heavy", "shield"] as const;
export const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export type Rec = Record<string, unknown>;

export function isRecord(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isMember<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

export function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isLevel(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 20;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isKey(value: unknown): value is string {
  return typeof value === "string" && KEY_PATTERN.test(value);
}

export function isDice(value: unknown): value is string {
  return typeof value === "string" && parseExpression(value) !== null;
}

/** Keys must be integer strings 1-20 exactly ("03" and "3.0" are not levels). */
export function parseByLevel<T>(
  value: unknown,
  path: string,
  errors: string[],
  valid: (v: unknown) => v is T,
  what: string,
): ByLevel<T> | null {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object keyed by level`);
    return null;
  }
  const out: ByLevel<T> = {};
  for (const [key, v] of Object.entries(value)) {
    if (!/^(?:[1-9]|1\d|20)$/.test(key)) {
      errors.push(`${path}: '${key}' is not a level from 1 to 20`);
      continue;
    }
    if (!valid(v)) {
      errors.push(`${path}.${key}: expected ${what}`);
      continue;
    }
    out[key] = v;
  }
  if (Object.keys(out).length === 0) {
    errors.push(`${path}: no valid levels`);
    return null;
  }
  return out;
}
