import type { DiceRules } from "@/lib/dice/diceRules";
import { dnd5eDiceRules } from "./dnd5e/dice/rules";

/**
 * The one place a neutral surface learns which game system's rules apply
 * (#934). Neutral code may import from `@/systems/` only through this module
 * (`systemBoundary.test.ts`), so adding a system means adding it here and
 * nowhere in the surfaces.
 */
export type GameSystemKey = "dnd5e";

const DICE_RULES: Record<GameSystemKey, DiceRules> = {
  dnd5e: dnd5eDiceRules,
};

/**
 * The active campaign's game system. Every campaign is 5e until
 * `campaigns.game_system` exists (#934 story 1), which reads it here.
 */
export function activeGameSystem(): GameSystemKey {
  return "dnd5e";
}

/** The dice rules of the active campaign's game system. */
export function activeDiceRules(): DiceRules {
  return DICE_RULES[activeGameSystem()];
}
