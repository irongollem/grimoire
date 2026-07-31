/**
 * Pure helpers for player-defined custom attacks (#568) — attacks not derived
 * from equipment (companion attacks, class features, improvised setups).
 * No Vue imports; safe to unit test in isolation.
 */

import { parseExpression, type ParsedExpression } from "@/lib/dice/dice";
import type { CustomAttack } from "@/types/party.types";

/** Editable shape of a CustomAttack, before an `id` has been assigned. */
export interface CustomAttackDraft {
  name: string;
  attack_bonus: number | null;
  damage: string;
  damage_type: string | null;
}

/**
 * Validates a candidate custom attack. Returns a human-readable error string,
 * or null when the draft is valid.
 */
export function validateCustomAttack(draft: CustomAttackDraft): string | null {
  if (!draft.name.trim()) return "Name is required.";
  if (!draft.damage.trim()) return "Damage expression is required.";
  if (!parseExpression(draft.damage)) {
    return `"${draft.damage}" isn't a valid dice expression (e.g. "2d4+2" or "4").`;
  }
  return null;
}

/** Parses a CustomAttack's damage expression. Null-safe — returns null when unparseable. */
export function customAttackDamageExpression(attack: CustomAttack): ParsedExpression | null {
  return parseExpression(attack.damage);
}
