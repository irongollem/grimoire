// The shapes of a creature's turn options (#1202 story 3b) and of what is asked to produce them. The options
// themselves are composed in `compose.ts`; see the header there for what they are and are not.

import type { Cell } from "../../../../lib/battlemap/movement.ts";
import type { MapExit } from "../../../../lib/battlemap/mapExits.ts";
import type { AppliedCondition } from "../../../../types/condition.types.ts";
import type { RunCombatant } from "../../../../types/encounter.types.ts";
import type { RulesetKey } from "../../../../types/ruleset.types.ts";
import type { MultiattackStep, SaveAbility, StatBlockEntry } from "../../../../types/statBlock.types.ts";
import type { StatBlockListKey } from "../../../statBlock/parseAction.ts";
import type { FactionSides } from "../../sides.ts";
import type { CastNow, HealNow } from "../../spells/castNow.ts";
import type { WayOut } from "../../tactics/wayOut.ts";
import type { FightMap } from "../battleMap.ts";
import type { Cover, ProvokedAttack } from "../sight.ts";

/** The most options a creature is offered. Dodge, Disengage, Hide and Flee always keep their place; the rest is attacks and approaches against the nearest targets first (rule 9). */
export const MAX_TURN_OPTIONS = 12;

/**
 * Rule 11, the cap on spell options (#1021): they are kept out of `MAX_TURN_OPTIONS` so a caster's attacks, approaches and
 * its Dodge, Disengage, Hide and Flee are never pushed out by its spells, and have a ceiling of their own instead, so the
 * whole list stays bounded (at most `MAX_TURN_OPTIONS + MAX_SPELL_OPTIONS`). The best are kept by what can be told before
 * any numbers exist: a cast that catches no friend before one that does, then the most enemies, then the nearest centre.
 */
export const MAX_SPELL_OPTIONS = 12;

/**
 * `flee` (rule 10) is a Dash away. `surrender` and `escape` are never produced here: the tactics gate (`gateOptions`,
 * #1203) puts surrender in place of the whole list when a creature that yields has broken, and puts escape (a way out
 * such as Etherealness) first when a broken creature has one.
 */
export type TurnOptionKind = "attack" | "spell" | "heal" | "break_free" | "dash" | "move" | "disengage" | "dodge" | "hide" | "flee" | "surrender" | "escape";

/** What an attack option does, with the facts of the square it is made from. Null facts mean there is no map to measure on. */
export interface TurnOptionAttack {
  list: StatBlockListKey;
  /** The entry's printed name: what a resolving command names the action by. */
  action: string;
  /** The steps of a Multiattack, in printed order; null for a single attack. */
  steps: MultiattackStep[] | null;
  /** Feet from the square it is made from to the target. */
  distanceFeet: number | null;
  /** The cover the target has against the attacker. */
  cover: Cover | null;
  longRange: boolean | null;
  closeCombat: boolean | null;
  /** Chance one attack hits, 0 to 1 (a Multiattack: the mean over its attacks). Null until `withNumbers` fills it. */
  hitChance: number | null;
  /** Expected damage of the whole option against the target's armor. Null until `withNumbers` fills it. */
  expectedDamage: number | null;
}

/** What a spell option casts, at whom, and what it costs (#1021). Null numbers until `withNumbers` fills them. */
export interface TurnOptionSpell {
  /** As the stat block prints it: what `cast_spell` names the spell by. */
  name: string;
  castLevel: number;
  kind: "attack" | "save";
  /** Every living enemy the cast hits: the one target of a single-target spell, everyone an area catches. */
  targetIds: string[];
  /** The mover's own side caught in the area, the mover itself included when it stands inside. Empty for a single-target spell. */
  friendsCaught: string[];
  /** A cast that spends a slot or a use (a cantrip and an at-will spell do not). */
  spends: boolean;
  /** Feet from the mover to the target or the centre; null for an area on the mover and when nothing was measured. */
  distanceFeet: number | null;
  /** An attack spell: the chance it hits. A save spell: the mean chance of failing the save over the targets. */
  hitChance: number | null;
  /** The sum over `targetIds` of what the cast is expected to deal. */
  expectedDamage: number | null;
  /**
   * What the conditions this cast imposes are worth, in hit points, summed over `targetIds` (`withNumbers`, from what the
   * fight has shown of each target): 0 when it imposes none. Absent until `withNumbers` fills it in, and read as 0.
   */
  expectedWorth?: number | null;
  /** The conditions a failed save of this cast imposes, by name; absent when there are none. */
  imposes?: readonly string[];
  /**
   * Only on a cast an Action Surge carries on (`tactics/surgeCast.ts`, #1021): the turn is this cast and then `second`, the extra action, from where the mover
   * stands. Its numbers are both turns' together. Absent on every cast the options assembly makes.
   */
  surge?: { second: TurnOption };
}

/** Rule 13, the cap on heal options (#1021): a caster with a healing spell is offered it at the few who need it most, never at every scratch. */
export const MAX_HEAL_OPTIONS = 6;

/** What a healing option casts, at whom, and how it weighs (#1021). */
export interface TurnOptionHeal {
  /** As the stat block prints it: what `cast_spell` names the spell by. */
  name: string;
  castLevel: number;
  /** The Action, or the Bonus Action (Healing Word): a Bonus Action heal is no turn of its own, it rides the turn the picker chose (`bonusHeal.ts`). */
  slot: "action" | "bonus_action";
  /** The creatures it restores, the neediest first: a creature of the caster's own side (the caster itself included) that is hurt, or down and not dead. */
  targetIds: string[];
  /** Those of `targetIds` at 0 hit points and still alive: getting them up is what a heal is for. */
  downIds: string[];
  /** Those of `targetIds` above 0 and below half their hit points. */
  lowIds: string[];
  /** A cast that spends a slot or a use (a cantrip and an at-will spell do not). */
  spends: boolean;
  /** The mean hit points one creature regains. For a pool spell (Mass Heal) the whole pool: it is shared out, never given to each. */
  expectedEach: number;
  /** Hit points shared among `targetIds` (Mass Heal), null or absent for a spell that rolls once for every target. */
  pool?: number | null;
  /** Every target regains all its hit points (Power Word Heal); `expectedEach` is 0 then, and what each misses is what it restores. */
  full?: boolean;
  /** Feet from the caster to the nearest target; null when nothing was measured or the target is the caster. */
  distanceFeet: number | null;
}

export interface TurnOptionExposure {
  enemyId: string;
  /** The cover THE MOVER has against this enemy at the destination; "total" means the enemy has no line at all. */
  cover: Cover;
}

export interface TurnOption {
  /** Stable: the same input always yields the same ids. `attack:<list>:<action>:<targetId>`, `dash:<targetId>`, `move:<targetId>`, `disengage`, `dodge`, `hide`, `flee`, `surrender`. */
  id: string;
  kind: TurnOptionKind;
  targetId: string | null;
  /** Anchor cell the creature ends on; null when the option has no movement or there is no map. */
  destination: Cell | null;
  /** Anchor cells from where it stands (included) to the destination (included); null like `destination`. */
  path: Cell[] | null;
  /** Feet spent moving; null like `destination`. */
  feet: number | null;
  attack: TurnOptionAttack | null;
  /** Only a `spell` option sets this (#1021); absent on every other kind. */
  spell?: TurnOptionSpell | null;
  /** Only a `heal` option sets this (#1021); absent on every other kind. */
  heal?: TurnOptionHeal | null;
  /** Dash and move: feet left to the target from the destination. */
  distanceFeet: number | null;
  /** The opportunity attacks the path provokes (empty for Disengage, and when there is no movement). */
  provokes: ProvokedAttack[];
  /** For each living hostile on the map, the mover's cover against it at the destination. Empty when there is no map. */
  exposure: TurnOptionExposure[];
  /** One plain-English line built from the facts above. */
  summary: string;
  /**
   * Only a `flee` sets these (#1203; absent means the option does not leave). `leavesMap`: the destination is a way
   * off the map, so the creature is gone from the fight once it gets there. `exitLabel` is the Entrance zone's name,
   * null for an unnamed zone and for the edge of open country; `exitKind` says which kind of way off it is.
   */
  leavesMap?: boolean;
  exitLabel?: string | null;
  exitKind?: MapExit["kind"] | null;
  /** Only a `break_free` option sets this (#1021): the condition it tries to end, and the ability it would check with. */
  breakFree?: { name: string; ability: SaveAbility };
  /** Only the synthetic `escape` option sets this (#1203): the way out the creature uses, so the server can spend it and apply its effect. */
  escape?: WayOut;
}


/** One attack the creature may make this turn: an entry of its Actions or Bonus Actions that the caller found available. */
export interface UsableAttack {
  list: StatBlockListKey;
  entry: StatBlockEntry;
}

export interface TurnOptionsInput {
  combatants: readonly RunCombatant[];
  moverId: string;
  /** The fight's map, or null when it has none the rules can use. */
  map: FightMap | null;
  /** Feet of movement left this turn (`movementBudgetFeet`), or null when nothing says what the speed is. */
  budgetFeet: number | null;
  /** The mover's usable Actions and Bonus Actions entries; Multiattack steps are looked up among them by name. */
  attacks: readonly UsableAttack[];
  /** A creature's melee reach in feet, for the opportunity attacks it could take. */
  reachOf: (c: RunCombatant) => number;
  ruleset: RulesetKey;
  /** The damage spells the mover can cast now (`castableNow`); left out for a creature that casts none. */
  spells?: readonly CastNow[];
  /** The healing spells the mover can cast now (`healableNow`); left out for a creature that heals nobody. */
  heals?: readonly HealNow[];
  /** The creature kind of a combatant (`creatureKindOf`); a spell limited to a kind is offered only when it is given. */
  kindOf?: (c: RunCombatant) => string | null;
  /** The ability the mover would check with to break free of a condition (`strongestBreakFreeAbility`); left out, the first the condition allows. */
  breakFreeAbility?: (way: NonNullable<AppliedCondition["breakFree"]>) => SaveAbility;
  /**
   * The fight's factions, which say who fights whom (`sides.ts`): an Ally is no foe of the Players. Left out, a
   * fight declares no faction and a different faction is an opponent.
   */
  factions?: FactionSides;
  /**
   * The fight's current round. Left out, a creature is never held back by surprise, which only the first round can
   * cost it (`losesFirstTurnToSurprise`).
   */
  round?: number;
}
