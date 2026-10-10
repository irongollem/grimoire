import { describe, expect, it } from "vitest";
import { type EntryContext, parseActionProse } from "./parseAction.ts";

const ctx = (list: EntryContext["list"] = "actions", siblings: string[] = []): EntryContext => ({ list, siblings });
const parse = (name: string, description: string, c: EntryContext = ctx()) =>
  parseActionProse({ name, description }, c);

describe("attacks", () => {
  it("reads a 2014 melee weapon attack", () => {
    expect(
      parse("Scimitar", "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage."),
    ).toEqual({
      kind: "attack",
      attack: { delivery: "melee", bonus: 4, reach: 5, hit: [{ dice: "1d6+2", type: "slashing" }] },
      source: "parsed",
    });
  });

  it("reads a ranged attack with a long range, and riders", () => {
    const s = parse(
      "Longbow",
      "Ranged Weapon Attack: +4 to hit, range 150/600 ft., one target. Hit: 10 (2d6 + 3) piercing damage plus 7 (2d6) poison damage.",
    );
    expect(s.attack).toEqual({
      delivery: "ranged",
      bonus: 4,
      range: { normal: 150, long: 600 },
      hit: [
        { dice: "2d6+3", type: "piercing" },
        { dice: "2d6", type: "poison" },
      ],
    });
  });

  it("reads melee-or-ranged with both reach and range", () => {
    const s = parse(
      "Spear",
      "Melee or Ranged Weapon Attack: +4 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 5 (1d6 + 2) piercing damage.",
    );
    expect(s.attack).toMatchObject({ delivery: "melee_or_ranged", reach: 5, range: { normal: 20, long: 60 } });
  });

  it("reads a flat hit", () => {
    const s = parse("Bite", "Melee Weapon Attack: +0 to hit, reach 5 ft., one target. Hit: 1 piercing damage.");
    expect(s.attack?.hit).toEqual([{ dice: "1", type: "piercing" }]);
    expect(s.attack?.bonus).toBe(0);
  });

  it("takes the first damage of a versatile hit, not the two-handed alternative", () => {
    const s = parse(
      "Longsword",
      "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d8 + 1) slashing damage, or 6 (1d10 + 1) slashing damage if used with two hands.",
    );
    expect(s.attack?.hit).toEqual([{ dice: "1d8+1", type: "slashing" }]);
  });

  it("reads the terse Tome of Beasts 3 line", () => {
    const s = parse("Slam", "Melee Weapon Attack: +7 to hit, 5 ft., one target, 11 (2d6+4) slashing damage.");
    expect(s.attack).toMatchObject({ delivery: "melee", bonus: 7, reach: 5, hit: [{ dice: "2d6+4", type: "slashing" }] });
  });

  it("reads a terse ranged line with no 'damage' word", () => {
    const s = parse("Hurl Flame", "Ranged Spell Attack: +9 to hit, 120 ft., one target, 19 (4d6+5) fire.");
    expect(s.attack).toMatchObject({ delivery: "ranged", range: { normal: 120 }, hit: [{ dice: "4d6+5", type: "fire" }] });
  });

  it("reads 2024 attack rolls without 'Hit:'", () => {
    const s = parse(
      "Bite",
      "Melee Attack Roll: +5, reach 5 ft. 10 (2d6 + 3) Piercing damage plus 7 (2d6) Poison damage.",
    );
    expect(s.attack).toMatchObject({
      bonus: 5,
      reach: 5,
      hit: [
        { dice: "2d6+3", type: "piercing" },
        { dice: "2d6", type: "poison" },
      ],
    });
  });

  it("strips Markdown emphasis from imported text", () => {
    const s = parse("Claw", "_Melee Weapon Attack:_ +6 to hit, reach 5 ft., one target. _Hit:_ 10 (2d6+3) piercing damage.");
    expect(s.kind).toBe("attack");
  });

  it("reads a Tiptap JSON description", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage." }],
        },
      ],
    });
    expect(parse("Scimitar", doc).kind).toBe("attack");
  });

  it("attaches the save an attack's hit forces", () => {
    const s = parse(
      "Sting",
      "Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) piercing damage. The target must make a DC 13 Constitution saving throw, taking 22 (4d10) poison damage on a failed save, or half as much damage on a successful one.",
    );
    expect(s.kind).toBe("attack");
    expect(s.save).toEqual({
      ability: "con",
      dc: 13,
      fail: [{ dice: "4d10", type: "poison" }],
      success: "half",
      conditions: [],
    });
  });

  it("keeps an attack's own damage out of its shorthand save", () => {
    const s = parse(
      "Bite",
      "Melee Weapon Attack: +6 to hit, 5 ft., one creature. 14 (2d10+3) slashing damage and knocked prone (DC 14 Str negates prone).",
    );
    expect(s.attack?.hit).toEqual([{ dice: "2d10+3", type: "slashing" }]);
    expect(s.save).toMatchObject({ ability: "str", dc: 14, fail: [] });
  });

  it("does not mistake an escape DC for a save", () => {
    const s = parse(
      "Grab",
      "Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 8 (1d8 + 4) bludgeoning damage. The target is grappled (escape DC 14).",
    );
    expect(s.save).toBeUndefined();
  });

  it("refuses a damage type that is a choice", () => {
    const s = parse(
      "Blade",
      "Melee Weapon Attack: +9 to hit, reach 5 ft., one target. Hit: 12 (2d6 + 5) slashing damage plus 3 (1d6) lightning or thunder damage (djinni's choice).",
    );
    expect(s).toEqual({ kind: "other", source: "parsed", review: "unparsed: damage type is a choice" });
  });

  it("keeps an attack that deals no damage, with an empty hit", () => {
    const s = parse(
      "Grasp",
      "Melee Weapon Attack: +7 to hit, reach 50 ft., one creature. Hit: The target is grappled (escape DC 15).",
    );
    expect(s).toEqual({
      kind: "attack",
      attack: { delivery: "melee", bonus: 7, reach: 50, hit: [] },
      source: "parsed",
    });
  });

  it("gives an attack whose hit is a save an empty hit and the save's damage", () => {
    const s = parse(
      "Spit",
      "Ranged Weapon Attack: +8 to hit, range 15/30 ft., one creature. Hit: The target must make a DC 15 Constitution saving throw, taking 45 (10d8) poison damage on a failed save, or half as much damage on a successful one.",
    );
    expect(s.kind).toBe("attack");
    expect(s.attack?.hit).toEqual([]);
    expect(s.save).toEqual({ ability: "con", dc: 15, fail: [{ dice: "10d8", type: "poison" }], success: "half", conditions: [] });
  });
});

describe("saves", () => {
  it("reads a 2014 breath weapon", () => {
    const s = parse(
      "Fire Breath (Recharge 5–6)",
      "The dragon exhales fire in a 30-foot cone. Each creature in that area must make a DC 17 Dexterity saving throw, taking 56 (16d6) fire damage on a failed save, or half as much damage on a successful one.",
    );
    expect(s).toEqual({
      kind: "save",
      save: { ability: "dex", dc: 17, fail: [{ dice: "16d6", type: "fire" }], success: "half", conditions: [] },
      recharge: { min: 5, max: 6 },
      source: "parsed",
    });
  });

  it("reads a condition-only save", () => {
    const s = parse(
      "Frightful Presence",
      "Each creature of the dragon's choice must succeed on a DC 18 Wisdom saving throw or become frightened for 1 minute.",
    );
    expect(s.save).toEqual({ ability: "wis", dc: 18, fail: [], success: "none", conditions: ["Frightened"] });
  });

  it("reads a 2024 save with Failure and Success", () => {
    const s = parse(
      "Fire Breath",
      "Dexterity Saving Throw: DC 25, each creature in a 60-foot Cone. Failure: 18 (4d8) Bludgeoning damage, and the target has the Prone condition. Success: Half damage only.",
    );
    expect(s.save).toEqual({
      ability: "dex",
      dc: 25,
      fail: [{ dice: "4d8", type: "bludgeoning" }],
      success: "half",
      conditions: ["Prone"],
    });
  });

  it("reads terse shorthand", () => {
    const s = parse("Slam", "Each creature within 5 ft. must make DC 11 Str save or take 5 (2d4) bludgeoning damage.");
    expect(s.save).toMatchObject({ ability: "str", dc: 11, fail: [{ dice: "2d4", type: "bludgeoning" }] });
  });

  it("reads a Tome of Beasts 3 parenthesis save", () => {
    const s = parse("Doubt", "Target: 14 (4d6) psychic (DC 13 Wis half). A creature frightened by it has disadvantage on the save.");
    expect(s.save).toEqual({
      ability: "wis",
      dc: 13,
      fail: [{ dice: "4d6", type: "psychic" }],
      success: "half",
      conditions: [],
    });
  });

  it("does not count dice that are durations as damage", () => {
    const s = parse("Ash Cloud", "A creature must succeed on a DC 14 Constitution saving throw or become blinded for 1d6 rounds.");
    expect(s.save).toMatchObject({ fail: [], conditions: ["Blinded"] });
  });

  it("does not take a condition from the success branch", () => {
    const s = parse(
      "Bray",
      "Each creature must make a DC 13 Constitution saving throw. On a failure, a creature takes 14 (4d6) thunder damage and is incapacitated. On a success, a creature takes half the damage and isn't incapacitated.",
    );
    expect(s.save).toMatchObject({ fail: [{ dice: "4d6", type: "thunder" }], success: "half", conditions: ["Incapacitated"] });
  });

  it("reads damage that comes before the save, with half on success", () => {
    const s = parse(
      "Consume Self",
      "All creatures within 20 feet take 7 (2d6) fire damage, or half damage with a successful DC 13 Dexterity saving throw.",
    );
    expect(s.save).toMatchObject({ dc: 13, fail: [{ dice: "2d6", type: "fire" }], success: "half" });
  });

  it("does not treat repeating damage as the damage of one failed save", () => {
    const s = parse(
      "Engulf",
      "The target must succeed on a DC 14 Constitution saving throw at the start of each of the mound's turns or take 4 (1d8) bludgeoning damage.",
    );
    expect(s.save?.fail).toEqual([]);
  });

  it("sends a damage type that is not named to review", () => {
    const s = parse(
      "Breath Weapon",
      "Each creature must make a DC 14 Dexterity saving throw, taking 40 (9d8) damage of the corresponding type on a failed save.",
    );
    expect(s.review).toBe("unparsed: damage type not named");
  });

  it("sends several different saves to review", () => {
    const s = parse(
      "Breath",
      "Each creature must make a DC 19 Dexterity saving throw, taking 10 (3d6) fire damage on a failure. A creature must also succeed on a DC 15 Wisdom saving throw or be frightened.",
    );
    expect(s.review).toBe("unparsed: several saves in one entry");
  });

  it("sends a menu of options to review", () => {
    const s = parse(
      "Breath Weapons",
      "The dragon uses one of the following breath weapons. Cold: each creature must make a DC 17 Constitution saving throw, taking 54 (12d8) cold damage.",
    );
    expect(s.review).toBe("unparsed: several options in one entry");
  });
});

describe("plain entries", () => {
  it("leaves a trait alone with no review", () => {
    expect(parse("Pack Tactics", "The wolf has advantage on an attack roll against a creature if at least one of the wolf's allies is within 5 feet.", ctx("special_abilities"))).toEqual({
      kind: "other",
      source: "parsed",
    });
  });

  it("does not take Advantage on saving throws for a save", () => {
    expect(parse("Magic Resistance", "The imp has Advantage on saving throws against spells and other magical effects.").review).toBeUndefined();
  });

  it("does not mistake a Spellcasting DC for a cue", () => {
    const s = parse("Spellcasting", "The mage's spellcasting ability is Intelligence (spell save DC 14, +6 to hit with spell attacks).");
    expect(s).toEqual({ kind: "other", source: "parsed" });
  });

  it("flags an unreadable cue with a specific reason", () => {
    const s = parse("Gaze", "Each creature that can see it must make a DC 14 saving throw.");
    expect(s.review).toBe("unparsed: save ability not found");
  });

  it("does not count an ability check DC", () => {
    expect(parse("Dispel", "It makes a Wisdom ability check (DC 10 + the spell's level) for each one.").review).toBeUndefined();
  });
});

describe("name markers", () => {
  it("reads recharge, with and without a range", () => {
    expect(parse("Breath (Recharge 5–6)", "Plain.").recharge).toEqual({ min: 5, max: 6 });
    expect(parse("Breath (Recharge 6)", "Plain.").recharge).toEqual({ min: 6, max: 6 });
  });

  it("reads daily and rest uses", () => {
    expect(parse("Teleport (3/Day)", "Plain.").uses).toEqual({ count: 3, per: "day" });
    expect(parse("Mist (Recharges after a Short or Long Rest)", "Plain.").uses).toEqual({ count: 1, per: "short_rest" });
    expect(parse("Wail (1/Long Rest)", "Plain.").uses).toEqual({ count: 1, per: "long_rest" });
    expect(parse("Trill (Recharge After a Short or Long Rest)", "Plain.").uses).toEqual({ count: 1, per: "short_rest" });
  });

  it("reads legendary cost only on the legendary list", () => {
    expect(parse("Wing Attack (Costs 2 Actions)", "Plain.", ctx("legendary_actions")).legendary_cost).toBe(2);
    expect(parse("Detect", "Plain.", ctx("legendary_actions")).legendary_cost).toBe(1);
    expect(parse("Detect", "Plain.", ctx("actions")).legendary_cost).toBeUndefined();
  });

  it("reads the other ways legendary cost is written, on the legendary list only", () => {
    const leg = (name: string) => parse(name, "Plain.", ctx("legendary_actions"));
    expect(leg("Cast a Spell (2)").legendary_cost).toBe(2);
    expect(leg("Move (2 actions)").legendary_cost).toBe(2);
    expect(leg("Swallow (3 actions, Roc Form Only)").legendary_cost).toBe(3);
    expect(leg("Wing Attack (1 action)").legendary_cost).toBe(1);
    const both = leg("Breath (Costs 2 Actions, Recharge 5-6)");
    expect(both.legendary_cost).toBe(2);
    expect(both.recharge).toEqual({ min: 5, max: 6 });
    expect(leg("Teleport (1/Day)")).toMatchObject({ legendary_cost: 1, uses: { count: 1, per: "day" } });
    expect(leg("Breath (Recharge 5-6)").legendary_cost).toBe(1);
    expect(leg("Detect (7)").legendary_cost).toBe(1);
    expect(parse("Cast a Spell (2)", "Plain.", ctx("actions")).legendary_cost).toBeUndefined();
  });
});

describe("multiattack", () => {
  const siblings = ["Multiattack", "Bite", "Claw", "Kick", "Longsword (Humanoid Form Only)"];
  const multi = (text: string) => parse("Multiattack", text, ctx("actions", siblings));

  it("maps 'one with its bite and two with its claws'", () => {
    const s = multi("The dragon makes three attacks: one with its bite and two with its claws.");
    expect(s.kind).toBe("multiattack");
    expect(s.multiattack).toEqual([
      { action: "Bite", count: 1 },
      { action: "Claw", count: 2 },
    ]);
  });

  it("maps counted names", () => {
    expect(multi("The wolf makes two Claw attacks.").multiattack).toEqual([{ action: "Claw", count: 2 }]);
    expect(multi("One Bite attack and one Kick attack.").multiattack).toEqual([
      { action: "Bite", count: 1 },
      { action: "Kick", count: 1 },
    ]);
  });

  it("uses the sibling's printed name, ignoring its parenthetical", () => {
    expect(multi("The knight makes two longsword attacks.").multiattack).toEqual([
      { action: "Longsword (Humanoid Form Only)", count: 2 },
    ]);
  });

  it("ignores 'can replace' alternatives and later sentences", () => {
    expect(multi("The mage makes two Claw attacks. It can replace one attack with a use of Spellcasting.").multiattack).toEqual([
      { action: "Claw", count: 2 },
    ]);
  });

  it("returns no steps when it cannot map every one", () => {
    expect(multi("The deva makes two attacks.").multiattack).toEqual([]);
    expect(multi("Two Bite or Kick attacks.").multiattack).toEqual([]);
    expect(multi("The orc makes two attacks: one with its bite and one with a weapon.").multiattack).toEqual([]);
  });

  it("carries no review when the composition is empty", () => {
    expect(multi("The deva makes two attacks.").review).toBeUndefined();
  });
});

describe("options", () => {
  const dragon = [
    "The dragon uses one of the following breath weapons.",
    "**Fire Breath.** The dragon exhales fire in a 60-foot cone. Each creature in that area must make a DC 21 Dexterity saving throw, taking 66 (12d10) fire damage on a failed save, or half as much damage on a successful one.",
    "**Sleep Breath.** The dragon exhales sleep gas in a 60-foot cone. Each creature in that area must succeed on a DC 21 Constitution saving throw or fall unconscious for 10 minutes.",
  ].join("\n");

  it("reads a two-breath dragon, keeping recharge on the parent", () => {
    const s = parse("Breath Weapons (Recharge 5–6)", dragon);
    expect(s.kind).toBe("options");
    expect(s.recharge).toEqual({ min: 5, max: 6 });
    expect(s.options).toEqual([
      {
        name: "Fire Breath",
        kind: "save",
        save: { ability: "dex", dc: 21, fail: [{ dice: "12d10", type: "fire" }], success: "half", conditions: [] },
      },
      {
        name: "Sleep Breath",
        kind: "save",
        save: { ability: "con", dc: 21, fail: [], success: "none", conditions: ["Unconscious"] },
      },
    ]);
  });

  it("reads a three-effect bulleted menu, and run-together Tome of Beasts 3 text", () => {
    const menu = [
      "The grimlock chooses one of the following objects:",
      "- **Flashing Rock.** The target must succeed on a DC 11 DEX save or be blinded until the end of its next turn.",
      "- **Illusory Dancer.** The target must succeed on a DC 11 CHA save or be incapacitated for 1 minute.",
      "- **Whirling Death.** The target must succeed on a DC 11 WIS save or be frightened for 1 minute.",
    ].join("\n");
    const s = parse("Strange Bauble", menu);
    expect(s.options?.map((o) => [o.name, o.save?.ability, o.save?.conditions])).toEqual([
      ["Flashing Rock", "dex", ["Blinded"]],
      ["Illusory Dancer", "cha", ["Incapacitated"]],
      ["Whirling Death", "wis", ["Frightened"]],
    ]);
    const run = parse(
      "Breath Weapon",
      "Uses one of the following:Sand Blast. Exhales sand in a 30' cone. Each creature in area: 22 (4d10) piercing damage (DC 17 Dex half).Blinding Sand. Each creature in area: blinded for 1 min (DC 17 Con negates).",
    );
    expect(run.options?.map((o) => o.name)).toEqual(["Sand Blast", "Blinding Sand"]);
  });

  it("reads attack options and ToB 3 'Target:' names", () => {
    const s = parse(
      "Manipulate Flesh",
      "Can choose one of these attack options:Manifold Bite: Melee Weapon Attack: +6 to hit, 5 ft., one target, 14 (4d4+4) piercing damage.Acidic Mucus: Ranged Weapon Attack: +4 to hit, 60 ft., one target, 14 (4d6) acid.",
    );
    expect(s.options?.map((o) => [o.name, o.kind])).toEqual([
      ["Manifold Bite", "attack"],
      ["Acidic Mucus", "attack"],
    ]);
    const t = parse(
      "Evil Fingers",
      "Gestures at one creature, causing one of the following effects:Beckoning Finger Target: DC 14 Str save or be pulled 30 ft.Punishing Finger Target: DC 14 Cha save or take 10 (3d6) fire damage.",
    );
    expect(t.options?.map((o) => o.name)).toEqual(["Beckoning Finger", "Punishing Finger"]);
  });

  it("makes the whole entry a review when one option is not an attack or save", () => {
    const s = parse(
      "Manipulate Stone",
      "It can create one of the following:\nRumbling Earth: One creature is knocked prone (DC 12 Dex negates).\nStone Armor: Its AC increases by 2 until the start of its next turn.",
    );
    expect(s.kind).toBe("other");
    expect(s.review).toBe('unparsed: option "Stone Armor" is not a readable attack or save');
  });

  it("reviews a roll stated once for every option, and an option with untyped damage", () => {
    const shared = parse(
      "Command",
      "The devil shouts one of the following commands. The target must succeed on a DC 15 CHA save or obey.\n**Drop.** It drops its weapon.\n**Flee.** It flees.",
    );
    expect(shared.review).toBe("unparsed: options share a roll stated once");
    const untyped = parse(
      "Breath",
      "Uses one of the following:\nBeam. Each creature in line: 45 (10d8) radiant (DC 19 Dex half).\nBlast. Each creature in area: 36 (8d8) damage (DC 19 Dex half).",
    );
    expect(untyped.review).toBe('unparsed: option "Blast" has damage of no stated type');
  });
});
