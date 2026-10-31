import { describe, expect, it } from "vitest";
import {
  classifyTextDice, damageClauses, isDurationOnlyUpcast, matchAttackDamage, matchChoiceAttackDamage, matchChoiceSaveDamage, matchHealing,
  matchInstances, matchRider, matchSaveDamage, rollIsNotDamageOrHealing, upcastNamedTypes, withoutZoneTrigger,
} from "@/lib/library/spellTextMechanics";

// Wording below is the SRD text as Open5e serves it.
const thunderwave2014 = "A wave of thunderous force sweeps out from you. Each creature in a 15-foot cube originating from you must make a constitution saving throw. On a failed save, a creature takes 2d8 thunder damage and is pushed 10 feet away from you. On a successful save, the creature takes half as much damage and isn't pushed.";
const moonbeam2024 = "When the Cylinder appears, each creature in it makes a Constitution saving throw. On a failed save, a creature takes 2d10 Radiant damage, and if the creature is shape-shifted, it reverts. On a successful save, a creature takes half as much damage only.";
const harm2014 = "The target must make a constitution saving throw. On a failed save, it takes 14d6 necrotic damage, or half as much damage on a successful save.";
const iceStorm2014 = "Each creature in the cylinder must make a dexterity saving throw. A creature takes 2d8 bludgeoning damage and 4d6 cold damage on a failed save, or half as much damage on a successful one.";
const spiritGuardians2014 = "When the creature enters the area, it must make a wisdom saving throw. On a failed save, the creature takes 3d8 radiant damage (if you are good or neutral) or 3d8 necrotic damage (if you are evil). On a successful save, the creature takes half as much damage.";
const wallOfThorns2014 = "Each creature within its area must make a dexterity saving throw. On a failed save, a creature takes 7d8 piercing damage, or half as much damage on a successful save. The creature must make a dexterity saving throw. It takes 7d8 slashing damage on a failed save, or half as much damage on a successful one.";

describe("matchSaveDamage", () => {
  // Bug: the half rule in its own sentence was not recognised, so Thunderwave stayed manual.
  it("reads a half rule that sits in the next sentence", () => {
    expect(matchSaveDamage(thunderwave2014)).toEqual({ parts: [{ dice: "2d8", type: "thunder" }], half: true, ability: null });
    expect(matchSaveDamage(moonbeam2024)).toEqual({ parts: [{ dice: "2d10", type: "radiant" }], half: true, ability: null });
  });

  it("reads a half clause on the damage sentence itself", () => {
    expect(matchSaveDamage(harm2014)).toEqual({ parts: [{ dice: "14d6", type: "necrotic" }], half: true, ability: null });
  });

  it("says no half when the success sentence does not halve", () => {
    const sacred = "The target must succeed on a dexterity saving throw or take 1d8 radiant damage. The target gains no benefit from cover.";
    expect(matchSaveDamage(sacred)).toEqual({ parts: [{ dice: "1d8", type: "radiant" }], half: false, ability: "dexterity" });
  });

  // Ice Storm: two parts in one sentence, one half clause for both.
  it("reads two damage parts in one sentence", () => {
    expect(matchSaveDamage(iceStorm2014)).toEqual({
      parts: [{ dice: "2d8", type: "bludgeoning" }, { dice: "4d6", type: "cold" }],
      half: true, ability: null,
    });
  });

  it("refuses two parts of one type and two parts beside a third", () => {
    expect(matchSaveDamage("A creature takes 2d8 cold damage and 4d6 cold damage on a failed save, or half as much damage on a successful one.")).toBeNull();
    expect(matchSaveDamage(`${iceStorm2014} A creature in the center also takes 1d6 fire damage.`)).toBeNull();
  });

  it("refuses two different two-part sentences", () => {
    const other = iceStorm2014.replace("2d8 bludgeoning damage and 4d6 cold", "3d8 piercing damage and 5d6 fire");
    expect(matchSaveDamage(`${iceStorm2014} ${other}`)).toBeNull();
  });

  // Bug: Spirit Guardians' alignment choice (radiant or necrotic) was taken as radiant only.
  it("refuses a text that offers the same dice in a second type", () => {
    expect(matchSaveDamage(spiritGuardians2014)).toBeNull();
  });

  // Wall of Thorns: two damage sentences with different types.
  it("refuses two separate damage sentences", () => {
    expect(matchSaveDamage(wallOfThorns2014)).toBeNull();
  });

  it("refuses damage with no save sentence (Feeblemind)", () => {
    expect(matchSaveDamage("The target takes 4d6 psychic damage and must make an intelligence saving throw. On a failed save, its intelligence drops.")).toBeNull();
  });
});

describe("matchAttackDamage / matchHealing", () => {
  it("reads the damage of a spell attack", () => {
    expect(matchAttackDamage("Make a ranged spell attack. On a hit, the target takes 1d10 fire damage.")).toEqual([{ dice: "1d10", type: "fire" }]);
  });

  it.each([
    ["A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier.", "1d8"],
    ["up to six creatures of your choice each regain hit points equal to 2d8 + your spellcasting ability modifier.", "2d8"],
    ["Up to five creatures gain the benefits of a Short Rest and also regain 2d8 Hit Points.", "2d8"],
  ])("reads the healing in '%s'", (text, dice) => {
    expect(matchHealing(text)).toBe(dice);
  });

  it("refuses a text with two different healing rolls", () => {
    expect(matchHealing("A creature regains hit points equal to 1d8. Another regains hit points equal to 2d8.")).toBeNull();
  });
});

describe("damageClauses", () => {
  it("lists each distinct dice and type once", () => {
    expect(damageClauses("takes 5d8 fire damage. It takes 5d8 fire damage again, and 2d6 cold damage.")).toEqual([
      { dice: "5d8", type: "fire" }, { dice: "2d6", type: "cold" },
    ]);
  });
});

describe("what a die is for", () => {
  const roleOf = (text: string) => classifyTextDice(text).map((die) => `${die.dice}:${die.role}`);

  it.each([
    ["Bless 2014", "the target can roll a d4 and add the number rolled to the attack roll or saving throw.", ["d4:modifier_to_roll"]],
    ["Bless 2024", "the target adds 1d4 to the attack roll or save.", ["1d4:modifier_to_roll"]],
    ["Resistance 2024", "the creature reduces the total damage taken by 1d4.", ["1d4:modifier_to_roll"]],
    ["Hunter's Mark", "you deal an extra 1d6 damage to the target.", ["1d6:damage_or_hit_points"]],
    ["Teleport", "The GM rolls 1d100 and consults the Teleportation Outcome table.", ["1d100:decides_outcome"]],
    ["Confusion", "must roll a d10 at the start of each of its turns to determine its behavior.", ["d10:decides_outcome"]],
    ["Time Stop", "while you take 1d4 + 1 turns in a row, you can act.", ["1d4+1:other"]],
    ["Shillelagh", "The weapon's damage die becomes a d8.", ["d8:damage_or_hit_points"]],
    ["Foresight", "the target has advantage on D20 Tests.", []],
  ])("%s", (_name, text, expected) => {
    expect(roleOf(text)).toEqual(expected);
  });
});

describe("rollIsNotDamageOrHealing", () => {
  it("calls Open5e's 1d4 for Bless junk, because the text uses it to modify a roll", () => {
    expect(rollIsNotDamageOrHealing("the target adds 1d4 to the attack roll or save.", "1d4")).toBe(true);
  });

  it("keeps Magic Missile's roll: the text deals it as damage", () => {
    expect(rollIsNotDamageOrHealing("A dart deals 1d4 + 1 Force damage to its target.", "1d4 + 1")).toBe(false);
  });

  // Absence is not proof: a roll the text never shows is left alone.
  it("does not call a roll junk when the text never mentions it", () => {
    expect(rollIsNotDamageOrHealing("Darts of force strike.", "3d4+3")).toBe(false);
  });
});

describe("upcastNamedTypes", () => {
  it("names the one part that grows", () => {
    expect(upcastNamedTypes("the bludgeoning damage increases by 1d8 for each slot level above 4th.")).toEqual(["bludgeoning"]);
  });

  it("names both when the text says both (Flame Strike)", () => {
    expect(upcastNamedTypes("The Fire damage and the Radiant damage increase by 1d6 for each spell slot level above 5.")).toEqual(["fire", "radiant"]);
  });
});

// SRD text as Open5e serves it (api.open5e.com/v2/spells, 31 Oct 2026).
const scorchingRay2014 = {
  desc: "You create three rays of fire and hurl them at targets within range. You can hurl them at one target or several. Make a ranged spell attack for each ray. On a hit, the target takes 2d6 fire damage.",
  higher: "When you cast this spell using a spell slot of 3rd level or higher, you create one additional ray for each slot level above 2nd.",
};
const scorchingRay2024 = {
  desc: "You hurl three fiery rays. You can hurl them at one target within range or at several. Make a ranged spell attack for each ray. On a hit, the target takes 2d6 Fire damage.",
  higher: "You create one additional ray for each spell slot level above 2.",
};
const magicMissile2014 = {
  desc: "You create three glowing darts of magical force. Each dart hits a creature of your choice that you can see within range. A dart deals 1d4 + 1 force damage to its target. The darts all strike simultaneously, and you can direct them to hit one creature or several.",
  higher: "When you cast this spell using a spell slot of 2nd level or higher, the spell creates one more dart for each slot level above 1st.",
};
const magicMissile2024 = {
  desc: "You create three glowing darts of magical force. Each dart strikes a creature of your choice that you can see within range. A dart deals 1d4 + 1 Force damage to its target. The darts all strike simultaneously, and you can direct them to hit one creature or several.",
  higher: "The spell creates one more dart for each spell slot level above 1.",
};
const eldritchBlast2014 = {
  desc: "A beam of crackling energy streaks toward a creature within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 force damage. The spell creates more than one beam when you reach higher levels: two beams at 5th level, three beams at 11th level, and four beams at 17th level. You can direct the beams at the same target or at different ones. Make a separate attack roll for each beam.",
  higher: "",
};
const eldritchBlast2024 = {
  desc: "You hurl a beam of crackling energy. Make a ranged spell attack against one creature or object in range. On a hit, the target takes 1d10 Force damage.",
  higher: "The spell creates two beams at level 5, three beams at level 11, and four beams at level 17. You can direct the beams at the same target or at different ones. Make a separate attack roll for each beam.",
};

describe("matchInstances", () => {
  it.each([
    ["Scorching Ray 2014", scorchingRay2014, 2, { noun: "ray", count: 3, perSlotAbove: 1 }],
    ["Scorching Ray 2024", scorchingRay2024, 2, { noun: "ray", count: 3, perSlotAbove: 1 }],
    ["Magic Missile 2014", magicMissile2014, 1, { noun: "dart", count: 3, perSlotAbove: 1 }],
    ["Magic Missile 2024", magicMissile2024, 1, { noun: "dart", count: 3, perSlotAbove: 1 }],
    ["Eldritch Blast 2014 (steps in the description)", eldritchBlast2014, 0, { noun: "beam", count: 1, byCharacterLevel: [{ level: 5, count: 2 }, { level: 11, count: 3 }, { level: 17, count: 4 }] }],
    ["Eldritch Blast 2024 (steps in the higher levels)", eldritchBlast2024, 0, { noun: "beam", count: 1, byCharacterLevel: [{ level: 5, count: 2 }, { level: 11, count: 3 }, { level: 17, count: 4 }] }],
  ])("reads %s", (_name, spell, level, expected) => {
    expect(matchInstances(spell.desc, spell.higher, level)?.instances).toEqual(expected);
  });

  // Bug: the count sentences were left in the text, so the red-flag scan rejected every ray spell.
  it("takes the count sentences out and leaves the damage sentence", () => {
    const read = matchInstances(scorchingRay2024.desc, scorchingRay2024.higher, 2);
    expect(read?.description).toBe("on a hit, the target takes 2d6 fire damage.");
    expect(read?.higherLevels).toBe("");
  });

  it("reads a dart's own damage sentence, and no damage for a ray", () => {
    expect(matchInstances(magicMissile2014.desc, magicMissile2014.higher, 1)?.damage).toEqual({ dice: "1d4+1", type: "force" });
    expect(matchInstances(scorchingRay2014.desc, scorchingRay2014.higher, 2)?.damage).toBeNull();
  });

  // Bug (guard: "above N" is the spell's own level): a spell that grows its count from some other level.
  it("refuses an upcast that starts above a different level than the spell's own", () => {
    expect(matchInstances(scorchingRay2024.desc, scorchingRay2024.higher, 3)).toBeNull();
  });

  // Bug (guard: "a slot of Nth level or higher" is the level above the spell's own).
  it("refuses an unlock level that is not one above the spell's level", () => {
    expect(matchInstances(scorchingRay2014.desc, scorchingRay2014.higher.replace("3rd level", "4th level"), 2)).toBeNull();
  });

  // Bug (guard: steps count up one at a time): "two beams at 5th, four at 11th" read as a valid ladder.
  it("refuses beam steps that skip a count", () => {
    expect(matchInstances(eldritchBlast2024.desc, eldritchBlast2024.higher.replace("three beams", "four beams"), 0)).toBeNull();
  });

  // Bug (guard: every sentence of the set is required): an unfamiliar rule in the spell passed as a plain ray spell.
  it("refuses a set with one of its sentences missing", () => {
    expect(matchInstances(scorchingRay2024.desc.replace("Make a ranged spell attack for each ray. ", ""), scorchingRay2024.higher, 2)).toBeNull();
    expect(matchInstances(eldritchBlast2014.desc.replace("Make a separate attack roll for each beam.", ""), "", 0)).toBeNull();
  });

  it("refuses a dart set that does not state the dart's damage", () => {
    expect(matchInstances(magicMissile2014.desc.replace("A dart deals 1d4 + 1 force damage to its target. ", ""), magicMissile2014.higher, 1)).toBeNull();
  });

  it("finds nothing in a spell that has no count", () => {
    expect(matchInstances("A beam of cold shoots out. On a hit, the target takes 1d8 cold damage.", "", 0)).toBeNull();
  });
});

const chromaticOrb2024 = "You hurl an orb of energy at a target within range. Choose Acid, Cold, Fire, Lightning, Poison, or Thunder for the type of orb you create, and then make a ranged spell attack against the target. On a hit, the target takes 3d8 damage of the chosen type. If you roll the same number on two or more of the d8s, the orb leaps to a different target of your choice within 30 feet of the target.";
const dragonsBreath2024 = "You touch one willing creature, and choose Acid, Cold, Fire, Lightning, or Poison. Until the spell ends, the target can take a Magic action to exhale a 15-foot Cone. Each creature in that area makes a Dexterity saving throw, taking 3d6 damage of the chosen type on a failed save or half as much damage on a successful one.";
const spiritGuardians2024 = "On a failed save, the creature takes 3d8 Radiant damage (if you are good or neutral) or 3d8 Necrotic damage (if you are evil). On a successful save, the creature takes half as much damage. A creature makes this save only once per turn.";

describe("matchChoiceAttackDamage and matchChoiceSaveDamage", () => {
  it("reads Chromatic Orb 2024: dice from the hit sentence, types from the choose list", () => {
    expect(matchChoiceAttackDamage(chromaticOrb2024)).toEqual({
      dice: "3d8", choices: ["acid", "cold", "fire", "lightning", "poison", "thunder"], half: false,
    });
  });

  it("reads the wording 'of the type you chose'", () => {
    expect(matchChoiceAttackDamage(chromaticOrb2024.replace("of the chosen type", "of the type you chose"))?.dice).toBe("3d8");
  });

  it("reads Dragon's Breath 2024: a save for half, five types", () => {
    expect(matchChoiceSaveDamage(dragonsBreath2024)).toEqual({ dice: "3d6", choices: ["acid", "cold", "fire", "lightning", "poison"], half: true });
  });

  it.each([
    ["2014", spiritGuardians2014],
    ["2024", spiritGuardians2024],
  ])("reads Spirit Guardians %s: radiant for good or neutral, necrotic for evil, half on a save", (_edition, text) => {
    expect(matchChoiceSaveDamage(text)).toEqual({ dice: "3d8", choices: ["radiant", "necrotic"], half: true });
  });

  // Bug (guard: every listed word is a damage type): "choose fire, cold or banana" kept as a type list.
  it("refuses a list with a word that is not a damage type", () => {
    expect(matchChoiceAttackDamage(chromaticOrb2024.replace("Thunder", "Plasma"))).toBeNull();
  });

  // Bug (guard: a list names each type once).
  it("refuses a list that repeats a type", () => {
    expect(matchChoiceAttackDamage(chromaticOrb2024.replace("Choose Acid, Cold,", "Choose Acid, Acid,"))).toBeNull();
  });

  // Bug (guard: the alternatives roll the same dice): "3d8 radiant or 4d8 necrotic" read as one roll.
  it("refuses alternatives that roll different dice", () => {
    expect(matchChoiceSaveDamage(spiritGuardians2014.replace("or 3d8 necrotic", "or 4d8 necrotic"))).toBeNull();
  });

  // Bug (guard: the alternatives are different types).
  it("refuses alternatives of the same type", () => {
    expect(matchChoiceSaveDamage(spiritGuardians2014.replace("necrotic", "radiant"))).toBeNull();
  });

  it("finds no choice in a plain typed hit", () => {
    expect(matchChoiceAttackDamage("On a hit, the target takes 1d10 fire damage.")).toBeNull();
  });
});

const hex2024 = "You place a curse on a creature that you can see within range. Until the spell ends, you deal an extra 1d6 Necrotic damage to the target whenever you hit it with an attack roll. Also, choose one ability when you cast the spell. The target has Disadvantage on ability checks made with the chosen ability.";
const divineFavor2014 = "Your prayer empowers you with divine radiance. Until the spell ends, your weapon attacks deal an extra 1d4 radiant damage on a hit.";
const brandingSmite2014 = "The next time you hit a creature with a weapon attack before this spell ends, the weapon gleams with astral radiance as you strike. The attack deals an extra 2d6 radiant damage to the target, which becomes visible if it's invisible, and the target sheds dim light in a 5-foot radius and can't become invisible until the spell ends.";
const searingSmite2024 = "As you hit the target, it takes an extra 1d6 Fire damage from the attack. At the start of each of its turns until the spell ends, the target takes 1d6 Fire damage and then makes a Constitution saving throw. On a failed save, the spell continues. On a successful save, the spell ends.";
const divineSmite2024 = "The target takes an extra 2d8 Radiant damage from the attack. The damage increases by 1d8 if the target is a Fiend or an Undead.";
const huntersMark2014 = "Until the spell ends, you deal an extra 1d6 damage to the target whenever you hit it with a weapon attack, and you have advantage on any Wisdom (Perception) or Wisdom (Survival) check you make to find it.";

describe("matchRider", () => {
  it.each([
    ["Hex 2024", hex2024, { dice: "1d6", type: "necrotic" }],
    ["Divine Favor 2014", divineFavor2014, { dice: "1d4", type: "radiant" }],
    ["Branding Smite 2014", brandingSmite2014, { dice: "2d6", type: "radiant" }],
  ])("reads %s as extra damage on a hit", (_name, text, expected) => {
    expect(matchRider(text)).toEqual(expected);
  });

  // Bug (guard: no turn-start wording): Searing Smite's burning each turn taken as a one-off rider.
  it("refuses damage that comes again at the start of each turn", () => {
    expect(matchRider(searingSmite2024)).toBeNull();
  });

  // Bug (guard: no turn-start wording): a rider with a later-turn rule but no second damage clause.
  it("refuses a rider text that goes on at the start of each of the caster's turns", () => {
    expect(matchRider(`${hex2024} At the start of each of your turns, the curse spreads to a creature within 5 feet.`)).toBeNull();
  });

  // Bug (guard: exactly one damage clause): Divine Smite's Fiend bonus dropped silently.
  it("refuses a rider with a second dice expression", () => {
    expect(matchRider(divineSmite2024)).toBeNull();
  });

  // Bug (guard: the extra damage has a type): Hunter's Mark 2014 rolled with no type to put on the result.
  it("refuses extra damage with no damage type in the text", () => {
    expect(matchRider(huntersMark2014)).toBeNull();
  });

  // Bug (guard: tied to a hit): extra damage in a spell that deals it at cast treated as a rider.
  it("refuses extra damage that is not tied to a hit", () => {
    expect(matchRider("Each creature takes an extra 1d6 fire damage.")).toBeNull();
  });

  // Bug (guard: no saving throw in the text).
  it("refuses a rider text that also has a saving throw", () => {
    expect(matchRider(`${hex2024} The target makes a Wisdom saving throw.`)).toBeNull();
  });
});

describe("isDurationOnlyUpcast", () => {
  it("accepts Hex 2024's longer concentration", () => {
    expect(isDurationOnlyUpcast("Your Concentration can last longer with a spell slot of level 2 (up to 4 hours), 3–4 (up to 8 hours), or 5+ (24 hours).")).toBe(true);
  });

  // Bug: a rider's upcast that adds damage or targets waved through as "only a duration".
  it("refuses an upcast that also changes damage", () => {
    expect(isDurationOnlyUpcast("Your Concentration can last up to 8 hours, and the extra damage increases by 1d6.")).toBe(false);
  });

  it("refuses an upcast that is not about concentration", () => {
    expect(isDurationOnlyUpcast("The spell lasts up to 8 hours.")).toBe(false);
  });
});

describe("withoutZoneTrigger", () => {
  const trigger = "whenever the Emanation enters a creature's space and whenever a creature enters the Emanation or ends its turn there".toLowerCase();

  it("removes only the exact Spirit Guardians trigger", () => {
    expect(withoutZoneTrigger(`${trigger}, the creature must save.`)).not.toContain("whenever");
  });

  // Bug: any "whenever" excused as a zone trigger.
  it("keeps every other whenever", () => {
    expect(withoutZoneTrigger("whenever you hit a creature, it takes 1d6 damage again.")).toContain("whenever");
  });
});

// Third-party wording (Deep Magic, Tome of Heroes, Kobold Press) as Open5e serves it.
const glacialCascade = "By harnessing the power of ice and frost, you emanate pure cold, filling a 30-foot-radius sphere. Creatures other than you in the sphere take 10d8 cold damage, or half as much damage with a successful Constitution saving throw. A creature killed by this spell is transformed into ice, leaving behind no trace of its original body.";
const causticTorrent = "A swirling jet of acid sprays from you in a direction you choose. Each creature in the line takes 14d6 acid damage, or half as much damage if it makes a successful Dexterity saving throw. A creature reduced to 0 hit points by this spell is killed, and its body is liquefied. A poisoned creature can repeat the Constitution saving throw at the end of each of its turns, ending the effect on itself on a success.";
const furiousWail = "Each target must make a Charisma saving throw. On a failed save, it takes 10d10 + 30 psychic damage and is stunned until the end of its next turn. On a success, it takes half as much damage.";
const heartache = "These feelings manifest with such intensity that the creature takes 5d6 psychic damage on a failed Charisma saving throw, or half the damage on a successful save.";
const greaterMaze = "This spell functions as maze, but the target must make a Dexterity saving throw each time it starts its turn in the maze. The target takes 4d6 psychic damage on a failed save, or half as much damage on a success.";
const ectoplasm = "Any creature that ends its turn within 5 feet of the manifestation takes 2d6 psychic damage, or half the damage with a successful Wisdom saving throw. If it enters a creature's space, that creature takes 2d6 psychic damage, or half the damage with a successful Wisdom saving throw.";
const nightwing = "You gain a new attack action: Nightwing Breath (Recharge 4-6). Each creature in the area takes 5d6 necrotic damage, or half the damage with a successful Dexterity saving throw.";
const blizzard = "When the storm appears, each creature in the area takes 8d8 cold damage, or half as much damage with a successful Constitution saving throw. A creature also makes this saving throw and takes damage when it enters the area for the first time on a turn or ends its turn there.";
const cloyingDarkness = "Make a ranged spell attack. If it hits, the target takes 2d8 necrotic damage and must make a Constitution saving throw. If it fails, its visual organs are enveloped in shadow until the start of your next turn.";
const bloodshot = "You launch a jet of boiling blood from your eyes at a creature within range. You take 1d6 necrotic damage and make a ranged spell attack against the target. If the attack hits, the target takes 2d10 fire damage plus 2d8 psychic damage.";
const boilingBlood = "The target must make a Constitution saving throw. On a successful save, it takes 2d6 fire damage and the spell ends. On a failed save, the creature takes 4d6 fire damage and is blinded.";

describe("matchSaveDamage: third-party wording", () => {
  // Bug: "takes D T damage, or half as much damage with a successful <Ability> saving throw" left the book's spells manual.
  it("reads half damage with a named save in the damage sentence, and names the ability", () => {
    expect(matchSaveDamage(glacialCascade)).toEqual({ parts: [{ dice: "10d8", type: "cold" }], half: true, ability: "constitution" });
    expect(matchSaveDamage(causticTorrent)).toMatchObject({ parts: [{ dice: "14d6", type: "acid" }], half: true, ability: "dexterity" });
    expect(matchSaveDamage(heartache)).toMatchObject({ parts: [{ dice: "5d6", type: "psychic" }], half: true, ability: "charisma" });
  });

  // Bug: "On a failed save, it takes ..." with a "+ 30" modifier and the half in the next sentence's "On a success".
  it("reads a failed-save sentence whose half rule follows as 'On a success'", () => {
    expect(matchSaveDamage(furiousWail)).toMatchObject({ parts: [{ dice: "10d10+30", type: "psychic" }], half: true });
  });

  // Bug: "or half as much damage on a success" (not "a successful one") was not read as half.
  it("reads 'on a failed save, or half as much damage on a success' once nothing recurs", () => {
    expect(matchSaveDamage("The target takes 4d6 psychic damage on a failed save, or half as much damage on a success.")).toMatchObject({ half: true });
  });

  // Greater Maze rolls every time the target starts its turn: the previous sentence carries the timing.
  it("refuses a damage sentence whose save repeats each time a turn starts", () => {
    expect(matchSaveDamage(greaterMaze)).toBeNull();
  });

  // Ectoplasm and Blizzard deal their damage at a turn boundary or on entering, not once at cast.
  it("refuses damage tied to ending a turn or entering an area", () => {
    expect(matchSaveDamage(ectoplasm)).toBeNull();
    expect(matchSaveDamage(blizzard)).toBeNull();
  });

  // Become Nightwing: the breath is a later action, recharged, not a cast-time roll.
  it("refuses a recharging breath", () => {
    expect(matchSaveDamage(nightwing)).toBeNull();
  });

  // A condition's repeat save at the end of a turn deals no damage, so Caustic Torrent stays readable (above).
  // Boiling Blood: a different roll on a success and on a failure is two rolls.
  it("refuses different damage on a success and a failure", () => {
    expect(matchSaveDamage(boilingBlood)).toBeNull();
  });

  // Same Greater Maze idea in another wording: the save sentence names the turn, the damage sentence does not.
  it("refuses a save sentence tied to the start of each turn", () => {
    expect(matchSaveDamage("The target must make a Dexterity saving throw at the start of each of its turns. The target takes 4d6 psychic damage on a failed save, or half as much damage on a success.")).toBeNull();
  });

  // The "On a failure" wording is only read when nothing ties the damage to a turn.
  it("refuses 'On a failure' damage dealt at the start of each turn", () => {
    expect(matchSaveDamage("The target makes a Wisdom saving throw. On a failure, the target takes 2d6 fire damage at the start of each of its turns.")).toBeNull();
    expect(matchSaveDamage("The target makes a Wisdom saving throw. On a failure, the target takes 2d6 fire damage.")).toMatchObject({ parts: [{ dice: "2d6", type: "fire" }], half: false });
  });

  it("refuses damage that comes each time something happens", () => {
    expect(matchSaveDamage("A creature takes 4d6 psychic damage, or half as much damage with a successful Dexterity saving throw, each time the beam strikes it.")).toBeNull();
  });

  // The caster paying the same damage as the target must not read as one roll.
  it("refuses text where the caster takes damage too", () => {
    expect(matchSaveDamage("You take 2d8 fire damage. Each creature in the cone takes 2d8 fire damage, or half as much damage with a successful Dexterity saving throw.")).toBeNull();
  });
});

describe("matchAttackDamage: third-party wording", () => {
  // Bug: "If it hits" / "If the attack hits" were not read, only "On a hit".
  it("reads 'If it hits' and 'If the attack hits' with any subject but the caster", () => {
    expect(matchAttackDamage(cloyingDarkness)).toEqual([{ dice: "2d8", type: "necrotic" }]);
    expect(matchAttackDamage("Make a melee spell attack. If the attack hits, the struck creature takes 3d6 radiant damage.")).toEqual([{ dice: "3d6", type: "radiant" }]);
  });

  // Thunder Bolt (Deep Magic): "until the start of your next turn" ends a condition, it does not time the damage.
  it("reads damage whose sentence only mentions the start of the caster's next turn", () => {
    expect(matchAttackDamage("Make a ranged spell attack against the target. If it hits, the target takes 1d8 thunder damage and can't use reactions until the start of your next turn.")).toEqual([{ dice: "1d8", type: "thunder" }]);
  });

  // Bloodshot: the caster's own 1d6 and a second 2d8 psychic damage mean more than one roll.
  it("refuses Bloodshot's self-damage and second damage type", () => {
    expect(matchAttackDamage(bloodshot)).toBeNull();
  });

  // Bug: the caster as the subject ("you take") read as the target's damage.
  it("does not read the caster as the one who takes the damage", () => {
    expect(matchAttackDamage("Make a ranged spell attack. If it hits, you take 2d6 fire damage.")).toBeNull();
  });
});
