import type { DamageType } from "../../types/damage.types.ts";
import type { EncounterEvent, RunCombatant } from "../../types/encounter.types.ts";
import type { SaveAbility, SrdConditionName } from "../../types/statBlock.types.ts";
import type { DefenseApplied } from "../combat/typedDamage.ts";
import type { DyingOutcome } from "../dying.ts";
import type { EncounterTurnEvent, EncounterTurnState } from "../encounterTurn.ts";
import type { TurnOptionKind } from "./terrain/options/types.ts";

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
  | { type: "turn_taken"; turn: TurnTaken }
  /**
   * A creature the server plays struck a mover who left its reach (PHB 2014 ch. 9 "Opportunity Attacks"). Raised right
   * before that attack's `resolved` effect. `step` is the index in the mover's path of the square it was leaving.
   * Not persistent: a browser reads it to tell the story. Only the server raises it.
   */
  | { type: "opportunity"; attackerId: string; targetId: string; step: number }
  /**
   * A player character may strike a mover the server plays as it leaves their reach. The server never rolls a player's
   * dice and does not spend their Reaction: the browser offers the attack and spends the Reaction if it is taken. Only the server raises it.
   */
  | { type: "provoked_player"; moverId: string; playerId: string; step: number };

/** One creature's turn as the server played it: the option, in the words a narrator or the log can quote, and who chose it. */
export interface TurnTaken {
  instanceId: string;
  optionId: string;
  /** What the turn was: one of the options, or a downed party member's death save (`deathSave`). */
  kind: TurnOptionKind | "death_save";
  summary: string;
  /** Why this option: the picker's sentence, or a plain note that the caller chose. */
  reason: string;
  /**
   * "rules": the rules-only picker chose. "rules_with_note": the creature's note ruled out at least one turn first and
   * the rules-only picker chose among the rest. "caller": a DM (or a model) named the option.
   */
  picked: "rules" | "rules_with_note" | "caller";
  /** Only when true: the creature has a mind and a tongue (`speaksInAFight`), so the table may let it say a line. */
  speaks?: true;
  /** Only with "rules_with_note": the turns the note ruled out, so a DM can see why a creature held still. */
  ruledOutByNote?: { optionId: string; summary: string }[];
  /**
   * Only when true (#1203): the creature fled off the map by a way off it (an Entrance zone, or the edge of open
   * country) and was removed from the fight after its move. It is not slain: no defeat or loot is recorded, it is simply gone.
   */
  leftTheMap?: true;
  /** Only for an escape (#1203): the name of the way out the broken creature used (Etherealness, Invisible Passage). */
  escapedWith?: string;
  /**
   * Only for a party member the rules play who is down (#1021, allies in a fight): their turn was a death save, rolled
   * by the server (SRD 5.1 "Death Saving Throws", `deathSaveRollOutcome`). `status` is where it left them: still
   * dying, stable, dead, or back up at 1 hit point after a natural 20. The turn's `kind` is "death_save" then.
   */
  deathSave?: { d20: number; label: string; status: "dying" | "stable" | "dead" | "up" };
  /** With `escapedWith`: "leaves" means the creature was removed from the fight, "unseen" that it is now Invisible and still on the map. */
  escapeEffect?: "leaves" | "unseen";
  /**
   * Only when true: the creature moved and the map has nothing drawn on it that the rules can read (no wall, no door,
   * no solid rock, no difficult ground), so it crossed it as open ground. A picture of a room full of tables is, to
   * the rules, an empty floor until the DM traces its walls or paints a difficult-terrain zone; the DM is told, so a
   * walk through a painted table is not taken for a judgement.
   */
  bareMap?: true;
}

/** The reducer's events, told apart from the effects a fight adds. */
export function isTurnEvent(effect: FightEffect): effect is EncounterTurnEvent {
  return effect.type !== "broadcast" && effect.type !== "spawned" && effect.type !== "resolved" && effect.type !== "turn_taken" && effect.type !== "opportunity" && effect.type !== "provoked_player";
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
  /**
   * A spell the rules cast but did not resolve (#1021): the slot and the Action are spent, and `why` says what the data
   * could not do, so what the cast came to is the table's to rule. Not raised for a spell that was rolled: that one is
   * a `save` or an `attack` named for the spell.
   */
  | { kind: "cast"; casterId: string; spell: string; castLevel: number; targetIds: string[]; why: string }
  | { kind: "concentration"; instanceId: string; dc: number; natural: number; total: number; maintained: boolean }
  | { kind: "condition_save"; instanceId: string; name: string; dc: number; total: number | null; success: boolean }
  /** A creature spent its Action on an ability check to get free of a condition a spell holds it in (Black Tentacles). */
  | { kind: "break_free"; instanceId: string; name: string; ability: SaveAbility; natural: number; total: number; dc: number; success: boolean }
  | { kind: "ongoing_damage"; instanceId: string; name: string; damage: ResolvedDamage[]; damageTotal: number; dying: DyingOutcome };

/** A fight is under way once its round counter has left the lobby's 0 (the live row stores no separate flag). */
export function startedFromRound(currentRound: number): boolean {
  return currentRound > 0;
}
