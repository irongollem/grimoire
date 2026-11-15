import type { DamageType } from "../../types/damage.types.ts";
import type { EncounterEvent, RunCombatant } from "../../types/encounter.types.ts";
import type { SaveAbility, SrdConditionName } from "../../types/statBlock.types.ts";
import type { DefenseApplied } from "../combat/typedDamage.ts";
import type { DyingOutcome } from "../dying.ts";
import type { EncounterTurnEvent, EncounterTurnState } from "../encounterTurn.ts";
import type { TurnOptionKind } from "./terrain/turnOptions.ts";

/**
 * Everything a fight holds that a server must also hold to advance it: the
 * turn reducer's own state, plus the scripted events and which of them have
 * fired. Plain JSON-serialisable data, like `EncounterTurnState`.
 *
 * What stays out on purpose: the monsters and NPCs a spawn is built from
 * (they are a source the caller supplies through `FightDeps`, not part of the
 * fight), and everything that is the browser's own (pending broadcasts, the
 * concentration-check queue, move history, the runner's roster of stat blocks).
 */
export interface FightState extends EncounterTurnState {
  events: EncounterEvent[];
  /** Ids of the events that have fired. Fire-once events are skipped while listed. */
  eventsFired: string[];
}

/**
 * What applying something to a fight asks the outside world to do, as data.
 * The reducer's own events pass through unchanged (a player change to persist,
 * a concentration save owed, a condition ended ...); the two below are what an
 * event's actions add.
 */
export type FightEffect =
  | EncounterTurnEvent
  /** A line for the table: the server posts it to the chat; the browser never does. */
  | { type: "broadcast"; message: string }
  /** Combatants an event brought into the fight. They are already in the returned state; this says it happened. */
  | { type: "spawned"; combatants: RunCombatant[] }
  /** What a resolving command (`resolve_attack` ...) rolled and did, for a caller to show or narrate. Only the server raises it. */
  | { type: "resolved"; resolved: ResolvedAction }
  /** What a creature the server played did with its turn and why, raised before the effects of the steps themselves (#1203). Only the server raises it. */
  | { type: "turn_taken"; turn: TurnTaken };

/** One creature's turn as the server played it: the option, in the words a narrator or the log can quote, and who chose it. */
export interface TurnTaken {
  instanceId: string;
  optionId: string;
  kind: TurnOptionKind;
  summary: string;
  /** Why this option: the picker's sentence, or a plain note that the caller chose. */
  reason: string;
  /**
   * "rules": the rules-only picker chose. "rules_with_note": the creature's note ruled out at least one turn first and
   * the rules-only picker chose among the rest. "caller": a DM (or a model) named the option.
   */
  picked: "rules" | "rules_with_note" | "caller";
  /** Only with "rules_with_note": the turns the note ruled out, so a DM can see why a creature held still. */
  ruledOutByNote?: { optionId: string; summary: string }[];
}

/** The reducer's events, told apart from the effects a fight adds. */
export function isTurnEvent(effect: FightEffect): effect is EncounterTurnEvent {
  return effect.type !== "broadcast" && effect.type !== "spawned" && effect.type !== "resolved" && effect.type !== "turn_taken";
}

/** One damage part after the target's defenses: what was rolled, what was taken, and which defense changed it. */
export interface ResolvedDamage {
  type: DamageType | null;
  rolled: number;
  applied: number;
  defense: DefenseApplied;
}

/** One target's save in an action: its roll (null when no die was thrown), what it took and gained. */
export interface ResolvedSave {
  targetId: string;
  natural: number | null;
  total: number | null;
  autoFail: boolean;
  /** What cover added to the save (+2 or +5 on a Dexterity save), already in `total`; 0 when none was known. */
  coverBonus: 0 | 2 | 5;
  success: boolean;
  share: "full" | "half" | "none" | null;
  damage: ResolvedDamage[];
  damageTotal: number;
  dying: DyingOutcome;
  conditionsApplied: SrdConditionName[];
  conditionsImmune: SrdConditionName[];
}

/** The plain outcome of a resolving command: plain JSON, the numbers a narrator may quote and nothing it may invent. */
export type ResolvedAction =
  | {
      kind: "attack";
      attackerId: string;
      targetId: string;
      action: string;
      natural: number;
      total: number;
      /** The AC the roll was compared against: the target's own plus `coverAc`. */
      targetAc: number;
      /** The cover the target had against the attacker; null when none was known (no map, or a creature with no place). */
      cover: "none" | "half" | "three_quarters" | "total" | null;
      /** The part of `targetAc` that is cover: 2 for half, 5 for three-quarters, else 0. */
      coverAc: 0 | 2 | 5;
      mode: "normal" | "advantage" | "disadvantage";
      hit: boolean;
      critical: boolean;
      fumble: boolean;
      damage: ResolvedDamage[];
      damageTotal: number;
      dying: DyingOutcome;
      /** The save the hit forced on the creature that was hit, when the action has one. */
      save: ResolvedSave | null;
    }
  | { kind: "save"; attackerId: string; action: string; ability: SaveAbility; dc: number; targets: ResolvedSave[] }
  | { kind: "concentration"; instanceId: string; dc: number; natural: number; total: number; maintained: boolean }
  | { kind: "condition_save"; instanceId: string; name: string; dc: number; total: number | null; success: boolean }
  | { kind: "ongoing_damage"; instanceId: string; name: string; damage: ResolvedDamage[]; damageTotal: number; dying: DyingOutcome };

/** A fight is under way once its round counter has left the lobby's 0 (the live row stores no separate flag). */
export function startedFromRound(currentRound: number): boolean {
  return currentRound > 0;
}
