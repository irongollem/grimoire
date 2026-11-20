/** Rules 11 and 12: spell options and breaking free. */
import { describe, expect, it } from "vitest";
import type { RunCombatant } from "../../../../types/encounter.types.ts";
import { boonableNow, castableNow, healableNow } from "../../spells/castNow.ts";
import { bless, clericBlock, cureWounds, fireball, healingWord, mageBlock, shieldOfFaith } from "../../spells/spellTestKit.ts";
import { hiddenCondition } from "../../stances.ts";
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


// Rule 13: heal options (#1021). Ogre "m" is the caster; Fresco and Chicory are "p"; with the factions below "m" and "p" are foes and "n" is neither.
describe("rule 13: heal (#1021)", () => {
  const factions = [
    { id: "m", hostile_to: ["p"] },
    { id: "p", hostile_to: ["m"] },
    { id: "n", hostile_to: [] },
  ];
  const caster = (over: Partial<RunCombatant> = {}) => ogre(0, 0, over);
  const heals = (over: Partial<RunCombatant> = {}) => healableNow(clericBlock(), caster(over), [cureWounds(), healingWord()], "2014");
  const friend = (id: string, x: number, over: Partial<RunCombatant> = {}) => creature(id, id, "m", x, 0, { hp: 4, ...over });
  /** The caster (with `over`) and `others`. */
  const healOptions = (others: RunCombatant[], over: Partial<RunCombatant> = {}) =>
    run({ combatants: [caster(over), ...others], attacks: [], heals: heals(over), factions }).filter((o) => o.kind === "heal");

  // Bug caught: a heal aimed at the caster's foe (Fresco is hurt too) or at a Neutral bystander, so the cleric heals the enemy.
  it("fails if a foe or a Neutral is offered a heal", () => {
    const wounded = [creature("foe", "Foe", "p", 1, 0, { hp: 3 }), creature("bystander", "Bystander", "n", 1, 1, { hp: 3 })];
    expect(healOptions(wounded)).toEqual([]);
  });

  // Healing Word on a friend 30 feet off, Cure Wounds only on one within touch: three options for two spells at two friends where they reach.
  it("offers each heal at a hurt friend it reaches, with who is down and what it costs", () => {
    const options = healOptions([friend("near", 1), friend("far", 6)]);
    expect(options.map((o) => o.id)).toEqual(["heal:Cure Wounds:1:near", "heal:Healing Word:1:near", "heal:Healing Word:1:far"]);
    expect(options[1].heal).toMatchObject({ name: "Healing Word", castLevel: 1, slot: "bonus_action", targetIds: ["near"], spends: true });
  });

  // Cure Wounds reaches only the near scratch and Healing Word reaches the far one who is down: the list puts the one who is down first, across spells
  // (the cut to the best six is made on this order). Bug caught: options in the order the spells are listed, so a scratch comes before a dying friend.
  it("fails if a heal at someone who is down is not listed before a heal at a scratch of another spell", () => {
    const down = creature("down", "Down", "m", 6, 0, { type: "player", party_member_id: "pm-down", hp: 0 });
    const options = healOptions([friend("near", 1, { hp: 15 }), down]);
    expect(options.map((o) => o.id)).toEqual(["heal:Healing Word:1:down", "heal:Cure Wounds:1:near", "heal:Healing Word:1:near"]);
  });

  // Bug caught: a heal offered when everyone is on their feet and unhurt.
  it("fails if a heal is offered when no one on its side is hurt", () => {
    expect(healOptions([friend("well", 1, { hp: 20 })])).toEqual([]);
  });

  // Bug caught: a spent Action still offering Cure Wounds, so a creature heals twice in a turn; and the Bonus Action spent still offering Healing Word.
  it("fails if an Action heal is offered with the Action spent, or a Bonus Action one with the Bonus Action spent", () => {
    const friends = [friend("near", 1)];
    expect(healOptions(friends, { action_used: true }).map((o) => o.heal?.name)).toEqual(["Healing Word"]);
    expect(healOptions(friends, { bonus_used: true }).map((o) => o.heal?.name)).toEqual(["Cure Wounds"]);
  });

  // Bug caught: a creature down at 0 hit points (alive) skipped, which is the one a heal is for.
  it("fails if a friend at 0 hit points who is alive is not offered the heal first", () => {
    const down = creature("down", "Down", "m", 1, 0, { type: "player", party_member_id: "pm-down", hp: 0 });
    const options = healOptions([friend("scratch", 2, { hp: 15 }), down]);
    expect(options[0].heal).toMatchObject({ targetIds: ["down"], downIds: ["down"] });
  });

  // The caster itself, hurt, with nobody else: a creature may heal itself.
  it("fails if a hurt caster alone is offered no heal for itself", () => {
    expect(healOptions([], { hp: 3 }).map((o) => o.heal?.targetIds)).toEqual([["ogre"], ["ogre"]]);
  });
});

// Rule 14, boons (#1021): Bless and Shield of Faith as options.
describe("rule 14: boon options", () => {
  const factions = [{ id: "m", hostile_to: ["p"] }, { id: "p", hostile_to: ["m"] }, { id: "n", hostile_to: [] }];
  const block = clericBlock({
    special_abilities: [{ name: "Spellcasting", structured: { kind: "other", source: "parsed" }, description: "The cleric is a 5th-level spellcaster. Its spellcasting ability is Wisdom (spell save DC 13, +5 to hit with spell attacks). The cleric has the following cleric spells prepared:\n\n* 1st level (4 slots): bless, shield of faith" }],
  });
  const boonsFor = (over: Partial<RunCombatant> = {}) => boonableNow(block, ogre(0, 0, over), [bless(), shieldOfFaith()], "2014");
  const friend = (id: string, x: number) => creature(id, id, "m", x, 0);
  const boonOptions = (others: RunCombatant[], over: Partial<RunCombatant> = {}) =>
    run({ combatants: [ogre(0, 0, over), ...others], attacks: [], boons: boonsFor(over), factions }).filter((o) => o.kind === "boon");

  // Bug caught: a boon aimed at the foe or a Neutral bystander, or one option per friend instead of one per spell and level.
  it("fails if a boon reaches a foe or a Neutral, or is offered once per friend", () => {
    const options = boonOptions([friend("a", 1), friend("b", 2), creature("foe", "Foe", "p", 1, 1), creature("bystander", "Bystander", "n", 2, 1)]);
    expect(options.map((o) => o.id)).toEqual(["boon:Bless:1", "boon:Shield of Faith:1"]);
    for (const o of options) expect(o.boon?.targetIds).not.toEqual(expect.arrayContaining(["foe"]));
    expect(options[0].boon).toMatchObject({ slot: "action", targetCount: 3, concentration: true });
    expect(options[1].boon).toMatchObject({ slot: "bonus_action", targetCount: 1 });
  });

  // Bug caught: an Action boon offered with the Action spent, or a Bonus Action boon with the Bonus Action spent.
  it("fails if a boon is offered when the slot it uses is spent", () => {
    expect(boonOptions([friend("a", 1)], { action_used: true }).map((o) => o.boon?.name)).toEqual(["Shield of Faith"]);
    expect(boonOptions([friend("a", 1)], { bonus_used: true }).map((o) => o.boon?.name)).toEqual(["Bless"]);
  });
});

// PHB 2014 ch. 9 "Unseen Attackers and Targets": a caster cannot aim at a creature whose place it does not know.
describe("spells against a hidden hostile (#1021 row 13)", () => {
  const caster = (): RunCombatant => ogre(0, 0, { monster_id: undefined });
  const options = (foe: RunCombatant) => run({ combatants: [caster(), foe], attacks: [], spells: castableNow(mageBlock(), caster(), [fireball()], "2014") });

  // Bug: the cast is offered at the hidden creature (it is the only foe, so a spell option at all means it was targeted).
  it("offers no cast at a hidden hostile, and does at the same one in view", () => {
    expect(options(fresco(4, 0)).some((o) => o.kind === "spell")).toBe(true);
    expect(options(fresco(4, 0, { conditions: [hiddenCondition(12)] })).some((o) => o.kind === "spell")).toBe(false);
  });
});
