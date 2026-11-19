/** Rules 11 and 12: spell options and breaking free. */
import { describe, expect, it } from "vitest";
import type { RunCombatant } from "../../../../types/encounter.types.ts";
import { castableNow } from "../../spells/castNow.ts";
import { fireball, mageBlock } from "../../spells/spellTestKit.ts";
import { creature, ogre, fresco, run, find } from "./turnOptionsTestKit.ts";

// SRD 5.1 Black Tentacles: "A creature restrained by the tentacles can use its action to make a Strength or Dexterity check
// (its choice) against your spell save DC."
describe("rule 12: break free (#1021)", () => {
  const held = (over: Partial<RunCombatant> = {}) =>
    ogre(0, 0, { conditions: [{ name: "Restrained", source: { id: "mage", spell: "Black Tentacles" }, breakFree: { abilities: ["str", "dex"], dc: 14 } }], ...over });

  // Bug caught: a held creature is never offered the check, so it stands in the tentacles all fight.
  it("offers one option per condition with a way out, naming the ability and the DC, and the first ability when none is chosen for it", () => {
    const options = run({ combatants: [held(), fresco(5, 0)] });
    const free = find(options, "break_free:Restrained");
    expect(free).toMatchObject({ kind: "break_free", targetId: null, breakFree: { name: "Restrained", ability: "str" } });
    expect(free?.summary).toBe("Break free of Restrained: a STR check against DC 14, using its Action");
    expect(options.filter((o) => o.kind === "break_free")).toHaveLength(1);
  });

  // Bug caught: the ability the creature would use is not the one the caller picked (Dexterity here), so the step checks with the wrong one.
  it("carries the ability the caller says the creature would use", () => {
    const options = run({ combatants: [held(), fresco(5, 0)], breakFreeAbility: () => "dex" });
    expect(find(options, "break_free:Restrained")?.breakFree?.ability).toBe("dex");
  });

  // Bug caught: the check is offered when the Action is already spent, so trying again and again in one turn is free.
  it("is not offered when the Action is spent", () => {
    expect(find(run({ combatants: [held({ action_used: true }), fresco(5, 0)] }), "break_free:Restrained")).toBeUndefined();
  });

  // Bug caught: the rule changes the list of a creature with no such condition.
  it("adds nothing for a creature with no such condition, and not when the creature cannot act", () => {
    expect(run({ combatants: [ogre(), fresco(5, 0)] }).some((o) => o.kind === "break_free")).toBe(false);
    expect(run({ combatants: [held({ conditions: [{ name: "Paralyzed", breakFree: { abilities: ["str"], dc: 14 } }] }), fresco(5, 0)] })).toEqual([]);
  });

  // Not on the map at all (rule 6): the check needs no square, so it is still offered.
  it("is offered where nothing can be measured", () => {
    expect(find(run({ combatants: [held(), fresco(5, 0)], map: null }), "break_free:Restrained")).toBeDefined();
  });
});

describe("allies in a spell's area", () => {
  const factions = [
    { id: "m", hostile_to: ["p"] },
    { id: "p", hostile_to: ["m"] },
    { id: "n", hostile_to: [] },
  ];
  const caster = ogre(0, 0);
  const spells = castableNow(mageBlock(), caster, [fireball()], "2014");
  const friends = (extra: RunCombatant[]) => {
    const options = run({ combatants: [caster, fresco(4, 0), ...extra], attacks: [], spells, factions });
    const cast = options.find((o) => o.kind === "spell");
    return cast?.spell === undefined || cast.spell === null ? undefined : [...cast.spell.friendsCaught].sort();
  };

  // Bug: "everyone not hostile" made a Neutral bystander an ally, so the cast counted it as a friend caught in the blast
  // (and a heal or a buff would have been aimed at it).
  it("does not count a Neutral bystander in the area as a friend", () => {
    // Fireball centred on Fresco (4,0) has a 20 ft radius; the Neutral at (4,1) is inside it, the caster is 20 ft away.
    expect(friends([creature("bystander", "Bystander", "n", 4, 1)])).toEqual(["ogre"]);
  });
  it("counts a creature of the caster's own faction in the area as a friend", () => {
    expect(friends([creature("brother", "Brother", "m", 4, 1)])).toEqual(["brother", "ogre"]);
  });
});

