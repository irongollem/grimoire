import type { DamageType } from "./damage.types.ts";
import type { SaveAbility } from "./statBlock.types.ts";

/**
 * A 5e game condition (Blinded, Charmed, Poisoned, …). Baked per-edition into
 * `src/data/srdConditions2014.ts` (SRD 5.1) and `src/data/srdConditions2024.ts`
 * (SRD 5.2, patched via `src/data/conditionPatches.ts` — see that file for why)
 * at build time; callers should import the `CONDITIONS` / `getCondition`
 * helpers from `@/rules/conditions` rather than reading the static modules
 * directly.
 */
export interface Condition {
  /** Stable id derived from the slug (e.g. "blinded"). */
  id: string;
  /** Open5e slug (url-safe). */
  slug: string;
  /** Display name (Title Case, e.g. "Blinded"). */
  name: string;
  /** Full rules text, newline-preserved for tooltip rendering. */
  description: string;
  /** Parsed bullet / paragraph list for structured rendering. */
  effects: string[];
}

/**
 * A condition on a creature (#1018): a party member, a companion or a combatant
 * in a running encounter. One record per name; `name` is the key, so applying a
 * condition the creature already has replaces that record.
 *
 * `name` is usually one of `CONDITIONS` (`src/rules/conditions.ts`), but it is a
 * free string: "Cursed" rides here, and a DM can name an ongoing effect
 * ("Burning") that is not an SRD condition. Exhaustion is the record named
 * "Exhaustion" with a `level` from 1 to 6.
 *
 * The same shape is stored in `party_members.conditions`,
 * `companions.conditions` and every combatant in `encounter_state.combatants_live`.
 * It carries no display label for its source on purpose: the player projection
 * passes conditions through, and a stored name would tell players who a hidden
 * creature is. The label is derived from `source.id` at render time, against
 * whatever list of combatants the viewer is allowed to see.
 */
export interface AppliedCondition {
  name: string;
  /** Exhaustion only: 1 to 6. */
  level?: number;
  source?: ConditionSource;
  /** What ends it. Absent: it lasts until someone removes it. */
  ends?: ConditionEnds;
  /** Damage it deals at the start or end of each of the bearer's turns. */
  ongoing?: OngoingDamage;
  /**
   * Set by the turn hooks when the DM owes this condition a roll: a repeat
   * save (`ends.kind === "save"`) or ongoing damage. Cleared when resolved, and
   * set again at the next edge it fires on.
   */
  due?: { save?: boolean; damage?: boolean };
}

/** The start or the end of a turn. */
export type TurnEdge = "start" | "end";

export interface ConditionSource {
  /** `instance_id` of the combatant that applied it. Only meaningful inside the encounter it was applied in. */
  id: string;
  /** The spell or ability that applied it, when known ("Hold Person", "Trip Attack"). */
  spell?: string;
  /** True when the source is concentrating on it: it ends when that concentration ends or the source drops to 0 HP. */
  concentration?: boolean;
}

export type ConditionEnds =
  /**
   * Until the start or the end of a creature's next turn: the bearer's
   * (`self`) or the source's. "Next" means the first turn of that creature that
   * begins after the condition was applied, so the turn hooks set `armed` when
   * that turn starts, and an `at: "end"` condition expires only at the end of an
   * armed turn. A condition applied during its anchor's own turn therefore
   * survives that turn's end.
   */
  | { kind: "turn"; at: TurnEdge; of: "self" | "source"; armed?: boolean }
  /** For N rounds, counted down at the start of each of the source's turns (the bearer's, once the source is gone or down and takes no turns). Ends when it reaches 0. */
  | { kind: "rounds"; remaining: number }
  /** Save ends: the bearer repeats the save at the start or the end of each of its turns, ending the condition on a success. */
  | { kind: "save"; ability: SaveAbility; dc: number; at: TurnEdge };

export interface OngoingDamage {
  /** A dice expression, "2d6" or "1d4+2". */
  dice: string;
  type: DamageType | null;
  at: TurnEdge;
}
