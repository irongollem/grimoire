import { describe, expect, it } from "vitest";
import { hiddenFromPlayers } from "./stances.ts";
import { reduceEncounterTurn, type EncounterTurnState } from "../encounterTurn.ts";
import { attackRollMode } from "../combat/attackRoll.ts";
import { saveRollMode } from "../combat/savingThrow.ts";
import type { RunCombatant } from "../../types/encounter.types.ts";
import { disengagedCondition, dodgingCondition, hiddenCondition, isDisengaged, isDodging, isHidden, isIncapacitated } from "./stances.ts";

const base = { delivery: "melee" as const, withinFiveFeet: true, ruleset: "2014" as const, attackerConditions: [] };
const dodging = [dodgingCondition()];

describe("Dodge against attacks", () => {
  // PHB 2014 "Dodge": attack rolls against the creature have disadvantage if it can see the attacker.
  it("fails if an attack on a Dodging target is not at disadvantage", () => {
    expect(attackRollMode({ ...base, targetConditions: dodging }).mode).toBe("disadvantage");
    expect(attackRollMode({ ...base, targetConditions: [] }).mode).toBe("normal");
  });

  // PHB 2014 "Dodge": no benefit if incapacitated (Stunned, Paralyzed, Petrified, Unconscious include it); Blinded cannot see.
  it.each(["Incapacitated", "Stunned", "Paralyzed", "Petrified", "Unconscious", "Blinded"])(
    "fails if a Dodging but %s target still imposes disadvantage",
    (name) => {
      const r = attackRollMode({ ...base, targetConditions: [...dodging, { name }] });
      expect(r.reasons).not.toContain("target is Dodging");
    },
  );

  // PHB 2014 "Dodge" says "if you can see the attacker": an Invisible attacker is not seen.
  it("fails if an Invisible attacker is still at disadvantage against a Dodging target", () => {
    const r = attackRollMode({ ...base, attackerConditions: [{ name: "Invisible" }], targetConditions: dodging });
    expect(r.mode).toBe("advantage"); // Invisible's own advantage stands, Dodge adds nothing
    expect(r.reasons).not.toContain("target is Dodging");
  });

  // PHB 2014 "Advantage and Disadvantage": any advantage with any disadvantage is a straight roll.
  it("fails if Dodge's disadvantage beats another source's advantage", () => {
    // Prone within 5 ft gives the attacker advantage, and the dodger can still move, so Dodge's disadvantage stands.
    expect(attackRollMode({ ...base, targetConditions: [...dodging, { name: "Prone" }] }).mode).toBe("normal");
  });

  // PHB 2014 "Dodge": no benefit if the speed drops to 0. Restrained does that, so only its own advantage for attackers is left.
  it("fails if a Restrained dodger keeps Dodge's disadvantage against attackers", () => {
    expect(attackRollMode({ ...base, targetConditions: [...dodging, { name: "Restrained" }] }).mode).toBe("advantage");
  });
});

describe("Dodge on saving throws", () => {
  // PHB 2014 "Dodge": advantage on Dexterity saving throws.
  it("fails if a Dex save has no advantage while Dodging, or a Con save gets one", () => {
    expect(saveRollMode({ conditions: dodging, ability: "dex", ruleset: "2014" }).mode).toBe("advantage");
    expect(saveRollMode({ conditions: dodging, ability: "con", ruleset: "2014" }).mode).toBe("normal");
  });

  // PHB 2014 "Dodge": lost when incapacitated.
  it("fails if an incapacitated dodger keeps the Dex advantage", () => {
    expect(saveRollMode({ conditions: [...dodging, { name: "Stunned" }], ability: "dex", ruleset: "2014" }).mode).toBe("normal");
  });

  // PHB 2014 "Advantage and Disadvantage": Dodge's advantage cancels another source's disadvantage (2014 Exhaustion 3).
  it("fails if Dodge advantage and a disadvantage on the same save do not cancel", () => {
    expect(saveRollMode({ conditions: [...dodging, { name: "Exhaustion", level: 3 }], ability: "dex", ruleset: "2014" }).mode).toBe("normal");
  });

  // PHB 2014 "Dodge": lost at Speed 0. Restrained does that, so its own Dex-save disadvantage stands alone.
  it("fails if a Restrained dodger keeps the Dex advantage", () => {
    expect(saveRollMode({ conditions: [...dodging, { name: "Restrained" }], ability: "dex", ruleset: "2014" }).mode).toBe("disadvantage");
  });
});

describe("the stance readers", () => {
  it("fails if a reader confuses the two stances, or Incapacitated misses a condition that includes it", () => {
    expect(isDodging([disengagedCondition()])).toBe(false);
    expect(isDisengaged([dodgingCondition()])).toBe(false);
    expect(isDisengaged([disengagedCondition()])).toBe(true);
    expect(isIncapacitated([{ name: "Prone" }])).toBe(false);
    expect(isIncapacitated([{ name: "Unconscious" }])).toBe(true);
  });
});

function rc(id: string, initiative: number): RunCombatant {
  return {
    instance_id: id, type: "monster", name: id, faction_id: "f", initiative, hp: 10, max_hp: 10, ac: "12",
    conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0,
  };
}
const fight = (): EncounterTurnState => ({
  combatants: [rc("a", 20), rc("b", 10)], round: 1, activeIndex: 0, started: true, randomizeInitiativeEachRound: false,
  ruleset: "2014", lairEnabled: false, lairOwnerInstanceId: null, lairFiredRounds: [],
});
const names = (s: EncounterTurnState, id: string) => s.combatants.find((c) => c.instance_id === id)?.conditions.map((c) => c.name);

describe("stance expiry through the turn reducer", () => {
  // PHB 2014 "Dodge" / "Disengage" last until the start of the creature's next turn: kept through the others' turns, gone when its own begins.
  it.each([
    ["Dodging", dodgingCondition()],
    ["Disengaged", disengagedCondition()],
  ])("fails if %s is lost early or outlives the bearer's next turn start", (name, condition) => {
    const applied = reduceEncounterTurn(fight(), { type: "apply_condition", instanceId: "a", condition }).state;
    expect(names(applied, "a")).toEqual([name]);
    const bTurn = reduceEncounterTurn(applied, { type: "next_turn" }).state; // b's turn
    expect(names(bTurn, "a")).toEqual([name]);
    const aAgain = reduceEncounterTurn(bTurn, { type: "next_turn" }).state; // round 2, a's turn starts
    expect(names(aAgain, "a")).toEqual([]);
  });
});

describe("set_reaction_used", () => {
  // toggle_reaction flipped a spent Reaction back to ready on a retry; the setter must not.
  it("fails if setting used twice leaves the Reaction ready", () => {
    const once = reduceEncounterTurn(fight(), { type: "set_reaction_used", instanceId: "b", used: true }).state;
    const twice = reduceEncounterTurn(once, { type: "set_reaction_used", instanceId: "b", used: true }).state;
    expect(twice.combatants[1].reactionUsed).toBe(true);
    const cleared = reduceEncounterTurn(twice, { type: "set_reaction_used", instanceId: "b", used: false }).state;
    expect(cleared.combatants[1].reactionUsed).toBe(false);
  });
});

describe("Hidden", () => {
  const hidden = [hiddenCondition()];

  // PHB 2014 "Unseen Attackers and Targets": attacking a target that cannot see you gives advantage; attacking a
  // target you cannot see gives disadvantage. Bug caught: hiding that changed nothing about anyone's attack.
  it("gives a hidden attacker advantage and an attack on a hidden target disadvantage", () => {
    expect(attackRollMode({ ...base, attackerConditions: hidden, targetConditions: [] }).mode).toBe("advantage");
    expect(attackRollMode({ ...base, attackerConditions: [], targetConditions: hidden }).mode).toBe("disadvantage");
  });

  // Bug caught: two hidden fighters each getting both, where the rule has them cancel to a plain roll.
  it("cancels to a plain roll when attacker and target are both hidden", () => {
    expect(attackRollMode({ ...base, attackerConditions: hidden, targetConditions: hidden }).mode).toBe("normal");
  });

  // Bug caught: Hidden given a turn's duration like a stance, so the hider reappears by themselves next turn.
  it("does not run out with the turn: it has no end of its own", () => {
    expect(hiddenCondition().ends).toBeUndefined();
    expect(isHidden(hidden)).toBe(true);
    expect(isHidden([dodgingCondition()])).toBe(false);
  });
});

describe("hiddenFromPlayers (#1021 row 13)", () => {
  // The maintainer's decision: a creature that hid is off the players' screens until found; a party member who hides is not,
  // since the players are on its side. Bugs caught: a hiding monster still drawn, a hiding party member vanishing from its
  // own side, or a monster with some other condition hidden.
  it("fails if anyone but a hiding non-player is left out", () => {
    expect(hiddenFromPlayers({ type: "monster", conditions: [{ name: "Hidden" }] })).toBe(true);
    expect(hiddenFromPlayers({ type: "player", conditions: [{ name: "Hidden" }] })).toBe(false);
    expect(hiddenFromPlayers({ type: "monster", conditions: [{ name: "Prone" }] })).toBe(false);
  });
});
