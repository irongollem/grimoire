// The Reaction a creature's turn offers the person at the AI table (#1021, the maintainer's decision of 21 Nov 2026: "Ask with a
// React card"). The server pauses the turn at the moment and sends one of these; the page asks, and answers with a `ReactionAnswer`
// (`answer_reaction`). Shared by `encounter-command` and the browser, so the two can never disagree about the shape.
// Pure and edge-importable (no imports).

/**
 * The played character was hit, and Shield would turn the hit into a miss (`reactionTurnsHit`): only then is it offered, as the
 * rules' own creatures cast it only then. The totals are said because the person at a table hears them ("seventeen: does that
 * hit?"); the attacker's bonus and the target's armour class are the played character's own business.
 */
export interface ShieldOffer {
  kind: "shield";
  /** The played character's instance id. */
  reactorId: string;
  attackerId: string;
  /** The attack's name as its block gives it ("Scimitar"). */
  attack: string;
  roll: { natural: number; total: number };
  /** The played character's armour class the roll hit, and what it would be with the spell up. */
  armorClass: number;
  shieldedArmorClass: number;
  /** The spell's name as the record has it, and the slot level it would spend (the lowest the sheet has, for a slot). */
  spell: string;
  castLevel: number;
  spends: ReactionSpend;
}

/**
 * A creature hostile to the played character is casting a leveled spell within reach of their Counterspell. Offered before any
 * creature the rules play is asked, so the person's choice comes first. The check or save is described as the edition makes it.
 */
export interface CounterspellOffer {
  kind: "counterspell";
  reactorId: string;
  casterId: string;
  /** The spell being cast, by name, and the level it is cast at. */
  spell: string;
  spellLevel: number;
  /** Counterspell as the record names it, and the slot level the counter would spend. */
  counterSpell: string;
  castLevel: number;
  spends: ReactionSpend;
  /** 2014, cast below the spell's level: the played character's spellcasting check against this DC (10 + the spell's level). */
  check?: { dc: number };
  /** 2024: the caster's Constitution save against the played character's spell save DC. */
  save?: { dc: number };
}

export type ReactionOffer = ShieldOffer | CounterspellOffer;

/** What the cast spends, from how the sheet lists the spell: a spell slot, a daily use of an innate spell, or nothing (at will). */
export type ReactionSpend = "slot" | "use" | "free";

/** The spend of a cast as `reactionCastPlan` describes it (`how`). */
export function reactionSpendOf(how: "slots" | "per_day" | "at_will" | "cantrips"): ReactionSpend {
  if (how === "slots") return "slot";
  return how === "per_day" ? "use" : "free";
}

/** What the person chose. */
export type ReactionAnswer = "cast" | "pass";

export function isReactionAnswer(value: unknown): value is ReactionAnswer {
  return value === "cast" || value === "pass";
}
