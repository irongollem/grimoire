// The Bonus Action of an ally's turn (#1021): which class feature it spends it on, and the steps that carry that out. One
// `take_turn` plays one turn option, and a Bonus Action is no turn of its own to pick, so the rule is a modifier on the option
// the picker chose: the feature goes before it (Rage, Second Wind) or after it (Flurry of Blows, Martial Arts), and `carryOut`
// runs the steps with the rest. Nothing here knows how a feature is paid or rolled: the caller says which are ready, and
// `take_turn` carries a `feature` step out.
//
// APP CONVENTION throughout: the books say what each feature does and when it may be used, not when a creature the app plays
// chooses to. Each rule below is a small named block so a maintainer can find and change it. A creature that has none of these
// features, or the picker's choice of a caller-named turn, never reaches this file.
//
// Pure and edge-importable (relative `.ts` imports only).

import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { TurnStep } from "./carryOut.ts";
import type { TurnOption } from "../terrain/options/types.ts";

export type BonusFeature = "second_wind" | "rage" | "rage_extend" | "flurry" | "martial_arts";

/** What the caller knows of the mover and of the turn the picker chose. */
export interface BonusFacts {
  mover: RunCombatant;
  chosen: TurnOption;
  /** Which features the mover can use right now: the class level is there, a use is left, and the Bonus Action is free. */
  ready: Readonly<Record<Exclude<BonusFeature, "rage_extend">, boolean>>;
  /** The mover is already raging. */
  raging: boolean;
  /** The mover is raging under the 2024 rules and it is the turn that would end the Rage (`rage.ts`): an attack roll this turn would extend it, a Bonus Action can too. */
  rageEndsThisTurn: boolean;
  /** The chosen attack is a Strength melee weapon attack, the kind Rage adds its damage to. */
  rageRides: boolean;
  /** The chosen turn is the Attack action (an attack from the Actions list, any weapon or none): what Flurry of Blows follows. */
  attackAction: boolean;
  /** The entry the chosen attack swings, for the Bonus Action's own swings at the same target. */
  unarmedAction: string;
}

export interface BonusChoice {
  feature: BonusFeature;
  when: "before" | "after";
  reason: string;
}

/**
 * RULE bonus-action, in this order (a creature has one Bonus Action a turn, PHB 2014 ch. 9 "Bonus Actions"):
 * 1 Second Wind when hurt below half its hit points (a Fighter keeps it for when it matters, not on a scratch, and it is a
 *   short-rest use), before the turn;
 * 2 Rage at the first turn it is about to fight in melee with a Strength weapon (the damage and resistance are worth the use
 *   only when there is a blow to land; once raging it does not start again), before the turn;
 * 2b (2024 "Rage") the Bonus Action that extends a Rage that would end this turn, when the turn chosen makes no attack roll to extend it with;
 * 3 Flurry of Blows after the Attack action, while Ki or Focus Points are left (PHB 2014 "Flurry of Blows": "immediately after you take the Attack
 *   action on your turn", with any attack, and PHB 2024 the same: it asks no monk weapon);
 * 4 the Martial Arts Bonus Action, an unarmed strike after the Attack action made with an unarmed strike or a monk weapon, when there is no point to spend
 *   on a Flurry (PHB 2014 "Martial Arts": "when you use the Attack action with an unarmed strike or a monk weapon"; PHB 2024: only Unarmed Strikes or Monk weapons).
 *   `ready.martial_arts` is `monkTraining`: no armor or shield and every weapon held a monk weapon, so every attack such a Monk makes is one of those.
 * Null when none applies. Only an attack turn takes Rage, Flurry or Martial Arts; Second Wind comes with any turn.
 */
export function chooseBonusAction(f: BonusFacts): BonusChoice | null {
  if (f.mover.bonus_used === true || f.mover.hp <= 0) return null;
  const attacking = f.chosen.kind === "attack" && f.chosen.attack !== null;
  if (f.ready.second_wind && f.mover.max_hp > 0 && f.mover.hp * 2 < f.mover.max_hp) {
    return { feature: "second_wind", when: "before", reason: `Second Wind: at ${f.mover.hp} of ${f.mover.max_hp} hit points it is below half.` };
  }
  if (attacking && f.ready.rage && !f.raging && f.rageRides) {
    return { feature: "rage", when: "before", reason: "Rage: a melee attack is in reach and it is not raging yet." };
  }
  if (!attacking && f.raging && f.rageEndsThisTurn) return { feature: "rage_extend", when: "after", reason: "Rage: it would end this turn, and this turn makes no attack to carry it on, so the Bonus Action extends it." };
  if (attacking && f.attackAction && f.ready.flurry) return { feature: "flurry", when: "after", reason: "Flurry of Blows: it has Ki to spend on two more unarmed strikes." };
  if (attacking && f.attackAction && f.ready.martial_arts) return { feature: "martial_arts", when: "after", reason: "Martial Arts: one more unarmed strike as a Bonus Action." };
  return null;
}

/** The steps of a chosen Bonus Action, to run before or after the turn's own steps (`when`). A swing is at the target of the chosen attack. */
export function bonusSteps(choice: BonusChoice, targetId: string | null, unarmedAction: string): TurnStep[] {
  switch (choice.feature) {
    case "second_wind":
    case "rage":
    case "rage_extend":
      return [{ type: "feature", feature: choice.feature, targetId: null }, { type: "use", slot: "bonus" }];
    case "flurry":
      return targetId === null
        ? []
        : [
            { type: "feature", feature: "flurry", targetId },
            { type: "swing", list: "actions", action: unarmedAction, targetId },
            { type: "swing", list: "actions", action: unarmedAction, targetId },
            { type: "use", slot: "bonus" },
          ];
    case "martial_arts":
      return targetId === null ? [] : [{ type: "swing", list: "actions", action: unarmedAction, targetId }, { type: "use", slot: "bonus" }];
  }
}
