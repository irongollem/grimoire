import { afterEach, describe, expect, it, vi } from "vitest";
import { effectsForCast } from "@/rules/spellEffects";
import { fetchOpen5eDocuments, fetchOpen5eSpells, mapOpen5eV2Spell, planLibrarySpellImport } from "@/lib/library/open5eSpellImport";
import type { ExistingLibrarySpellIdentity, ImportedLibrarySpell } from "@/lib/library/open5eSpellImport";

afterEach(() => vi.unstubAllGlobals());

const document = {
  name: "System Reference Document 5.2",
  key: "srd-2024",
  display_name: "5e 2024 Rules",
  permalink: "https://example.test/srd",
  publisher: { name: "Wizards of the Coast", key: "wizards-of-the-coast" },
  gamesystem: { name: "5th Edition 2024", key: "5e-2024" },
};

function record(overrides: Record<string, unknown> = {}) {
  return {
    key: "srd-2024_acid-splash",
    document,
    casting_options: [{ type: "player_level_5", damage_roll: "2d6" }],
    school: { name: "Evocation", key: "evocation" },
    classes: [{ name: "Sorcerer", key: "srd-2024_sorcerer" }],
    name: "Acid Splash",
    desc: "Each creature must succeed on a Dexterity saving throw or take 1d6 Acid damage.",
    level: 0,
    higher_level: "",
    target_type: "creature",
    range_text: "60 feet",
    range: 60,
    ritual: false,
    casting_time: "action",
    reaction_condition: null,
    verbal: true,
    somatic: true,
    material: false,
    material_specified: "",
    target_count: 1,
    saving_throw_ability: "dexterity",
    attack_roll: false,
    damage_roll: "1d6",
    damage_types: ["acid"],
    duration: "instantaneous",
    shape_type: "sphere",
    shape_size: 5,
    shape_size_unit: "feet",
    concentration: false,
    ...overrides,
  };
}

describe("mapOpen5eV2Spell", () => {
  const srd2014 = { ...document, name: "System Reference Document 5.1", key: "srd-2014", gamesystem: { name: "5th Edition 2014", key: "5e-2014" } };

  const map2014 = (name: string, tagged: string[]) =>
    mapOpen5eV2Spell(
      record({
        key: `srd_${name.toLowerCase().replaceAll(" ", "-")}`,
        document: srd2014,
        name,
        level: 1,
        classes: tagged.map((cls) => ({ name: cls, key: `srd_${cls.toLowerCase()}` })),
      }) as Parameters<typeof mapOpen5eV2Spell>[0],
    )?.classes;

  it("takes a 2014 SRD spell's classes from the SRD lists, not from Open5e's subclass-wide tags", () => {
    // Open5e tags Paladin on nothing and Druid on every Land circle spell.
    expect(map2014("Bless", ["Cleric"])).toEqual(["Cleric", "Paladin"]);
    expect(map2014("Spider Climb", ["Druid", "Sorcerer", "Wizard"])).not.toContain("Druid");
    expect(map2014("Burning Hands", ["Cleric", "Sorcerer", "Wizard"])).not.toContain("Cleric");
    expect(map2014("Plane Shift", ["Cleric", "Sorcerer", "Wizard"])).toContain("Druid");
    expect(map2014("Faerie Fire", ["Bard", "Cleric", "Druid"])).toEqual(["Bard", "Druid", "Artificer"]);
  });

  it("drops a Warlock tag that comes from a patron: the subclass's expanded list carries it", () => {
    expect(map2014("Command", ["Cleric", "Warlock"])).toEqual(["Cleric", "Paladin"]);
    expect(map2014("Eldritch Blast", ["Warlock"])).toEqual(["Warlock"]);
  });

  it("leaves other documents to Open5e's tags", () => {
    const bless2024 = mapOpen5eV2Spell(
      record({ key: "srd-2024_bless", name: "Bless", level: 1, classes: [{ name: "Cleric", key: "x" }] }) as Parameters<typeof mapOpen5eV2Spell>[0],
    );
    expect(bless2024?.classes).toEqual(["Cleric"]);
  });

  it("preserves edition/source identity and structured mechanics", () => {
    const spell = mapOpen5eV2Spell(record() as Parameters<typeof mapOpen5eV2Spell>[0]);

    expect(spell).toMatchObject({
      id: "srd_srd_2024_acid_splash",
      conceptual_key: "acid_splash",
      ruleset: "2024",
      source_document_key: "srd-2024",
      source_record_key: "srd-2024_acid-splash",
      attack_type: "save",
      save_attribute: "DEX",
      damage_rolls: [{ dice: "1d6", type: "acid" }],
      aoe_shape: "sphere",
      aoe_size: "5 feet",
      mechanics_reviewed: false,
      effect_schema_version: 1,
    });
    expect(spell?.effects?.[0]).toMatchObject({
      phase: "impact",
      outcome: "failed_save",
      kind: "damage",
      dice: "1d6",
    });
    expect(spell?.casting_options).toEqual([
      { type: "player_level_5", damage_roll: "2d6" },
    ]);
  });

  it("keeps same-named 2014 and 2024 records distinct", () => {
    const revised = mapOpen5eV2Spell(record() as Parameters<typeof mapOpen5eV2Spell>[0]);
    const legacy = mapOpen5eV2Spell(
      record({
        key: "wotc-srd_acid-splash",
        document: {
          ...document,
          key: "wotc-srd",
          name: "System Reference Document 5.1",
          gamesystem: { name: "5th Edition", key: "5e-2014" },
        },
      }) as Parameters<typeof mapOpen5eV2Spell>[0],
    );

    expect(legacy?.conceptual_key).toBe(revised?.conceptual_key);
    expect(legacy?.id).not.toBe(revised?.id);
    expect(legacy?.ruleset).toBe("2014");
  });

  it("maps healing separately from damage automation", () => {
    const spell = mapOpen5eV2Spell(
      record({
        key: "srd-2024_cure-wounds",
        name: "Cure Wounds",
        desc: "A creature you touch regains Hit Points equal to 2d8 plus your spellcasting ability modifier.",
        damage_roll: "2d8",
        damage_types: [],
        saving_throw_ability: "",
        shape_type: null,
        shape_size: null,
      }) as Parameters<typeof mapOpen5eV2Spell>[0],
    );

    expect(spell?.healing_dice).toBe("2d8");
    expect(spell?.damage_rolls).toBeNull();
    expect(spell?.attack_type).toBeNull();
  });

  it("applies higher-slot damage to failed and successful save branches", () => {
    const spell = mapOpen5eV2Spell(
      record({
        key: "srd-2024_fireball",
        name: "Fireball",
        level: 3,
        desc: "A target takes 8d6 Fire damage on a failed save, or half damage on a successful save.",
        damage_roll: "8d6",
        damage_types: ["fire"],
        higher_level: "The damage increases by 1d6 for each slot level above 3.",
        casting_options: [],
      }) as Parameters<typeof mapOpen5eV2Spell>[0],
    );

    const castEffects = effectsForCast(spell?.effects ?? [], 3, 5, 9);
    expect(castEffects.map((effect) => [effect.outcome, effect.dice, effect.multiplier])).toEqual([
      ["failed_save", "10d6", 1],
      ["successful_save", "10d6", 0.5],
    ]);
  });

  it("rejects non-D&D rulesets instead of mislabelling them as 2014", () => {
    const spell = mapOpen5eV2Spell(
      record({ document: { ...document, gamesystem: { name: "Advanced 5e", key: "a5e" } } }) as Parameters<typeof mapOpen5eV2Spell>[0],
    );
    expect(spell).toBeNull();
  });
});

describe("mapOpen5eV2Spell — normalised fields", () => {
  type Raw = Parameters<typeof mapOpen5eV2Spell>[0];
  const map = (overrides: Record<string, unknown> = {}, metadata?: Parameters<typeof mapOpen5eV2Spell>[1]) =>
    mapOpen5eV2Spell(record(overrides) as Raw, metadata);

  it("falls back to evocation only for a school the game does not have", () => {
    expect(map({ school: { name: "Necromancy", key: "necromancy" } })?.school).toBe("necromancy");
    expect(map({ school: " Abjuration " })?.school).toBe("abjuration");
    expect(map({ school: { name: "Psionics", key: "psionics" } })?.school).toBe("evocation");
  });

  it.each([
    ["action", "Action"], ["1 action", "Action"], ["1 bonus action", "Bonus Action"], ["reaction", "Reaction"],
    // A ritual-length cast keeps its "1": it is part of the listed casting time, not a count of actions.
    ["1 minute", "1 Minute"], ["1 hour", "1 Hour"],
    ["10 minutes", "10 Minutes"], ["8 hours", "8 Hours"], ["24 hours", "24 Hours"],
  ])("reads the casting time %s as %s", (casting_time, expected) => {
    expect(map({ casting_time })).toMatchObject({ casting_time: expected, casting_time_custom: null });
  });

  it("keeps a reaction's trigger, and writes an unlisted casting time as Special with its own words", () => {
    expect(map({ casting_time: "reaction", reaction_condition: "which you take when you are hit" })?.casting_time_custom)
      .toBe("which you take when you are hit");
    expect(map({ casting_time: "1 round" })).toMatchObject({ casting_time: "Special", casting_time_custom: "1 round" });
  });

  it.each([
    ["instantaneous", "Instantaneous"], ["until dispelled", "Until Dispelled"], ["1 round", "1 Round"],
    ["1 hour", "1 Hour"], ["7 days", "7 Days"], ["30 days", "30 Days"],
  ])("reads the duration %s as %s", (duration, expected) => {
    expect(map({ duration })).toMatchObject({ duration: expected, duration_custom: null });
  });

  it("writes an unlisted or empty duration as Special with its own words", () => {
    expect(map({ duration: "3 rounds" })).toMatchObject({ duration: "Special", duration_custom: "3 rounds" });
    expect(map({ duration: "  " })).toMatchObject({ duration: "Special", duration_custom: "Special" });
  });

  it("writes a concentration duration as 'Concentration, up to ...' however Open5e spells it", () => {
    expect(map({ concentration: true, duration: "concentration, up to 1 minute" })?.duration).toBe("Concentration, up to 1 minute");
    expect(map({ concentration: true, duration: "1 hour" })?.duration).toBe("Concentration, up to 1 hour");
    expect(map({ concentration: true, duration: "Concentration up to 10 minutes" })?.duration).toBe("Concentration, up to 10 minutes");
    // An unlisted length is written once, not "Concentration, up to concentration, up to ...".
    expect(map({ concentration: true, duration: "Concentration, up to 2 hours" })?.duration).toBe("Concentration, up to 2 hours");
    // A spell that is not concentration keeps its plain duration even when the words appear.
    expect(map({ concentration: false, duration: "1 minute" })?.duration).toBe("1 Minute");
  });

  it.each([
    ["Self", "Self"], ["touch", "Touch"], ["SIGHT", "Sight"], ["Unlimited", "Unlimited"],
    ["120 feet", "120 ft."], ["30 ft", "30 ft."], ["5 foot", "5 ft."], ["1 mile", "1 mile"], ["5 miles", "5 miles"],
  ])("reads the range %s as %s", (range_text, expected) => {
    expect(map({ range_text })).toMatchObject({ range: expected, range_custom: null });
  });

  it("writes an unlisted range as Special with its own words", () => {
    expect(map({ range_text: "Self (60-foot cone)" })).toMatchObject({ range: "Special", range_custom: "Self (60-foot cone)" });
  });

  it("lists the components the spell has, and trims the material", () => {
    expect(map({ verbal: false, somatic: false, material: true, material_specified: "  a pinch of sulfur " })).toMatchObject({
      components: ["M"], material: "a pinch of sulfur",
    });
    expect(map({ verbal: true, somatic: true, material: false, material_specified: "" })).toMatchObject({ components: ["V", "S"], material: null });
  });

  it("describes the target and area from what Open5e gives", () => {
    expect(map({ target_count: 3, target_type: "creatures" })?.target_description).toBe("3 creatures");
    expect(map({ target_count: null, target_type: "creature" })?.target_description).toBe("creature");
    expect(map({ target_count: null, target_type: "" })?.target_description).toBeNull();
    expect(map({ shape_size: 20, shape_size_unit: null })?.aoe_size).toBe("20 feet");
    expect(map({ shape_size: null })?.aoe_size).toBeNull();
  });

  it("types an attack as a melee or ranged spell attack, a save, an automatic hit, or none", () => {
    expect(map({ attack_roll: true, saving_throw_ability: "", desc: "Make a melee spell attack against a creature." })?.attack_type).toBe("melee_spell");
    expect(map({ attack_roll: true, saving_throw_ability: "", desc: "Make a ranged spell attack." })?.attack_type).toBe("ranged_spell");
    expect(map({ attack_roll: false, saving_throw_ability: "", desc: "Darts of force strike.", damage_roll: "3d4+3" })?.attack_type).toBe("automatic");
    expect(map({ attack_roll: false, saving_throw_ability: "", damage_roll: "", desc: "You feel safe." })?.attack_type).toBeNull();
  });

  it.each([
    ["A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.", "half"],
    ["On a successful save, the creature takes no damage.", "negates"],
    ["The creature is frightened on a failed save.", "special"],
  ])("reads the save effect of '%s' as %s", (desc, expected) => {
    expect(map({ desc })?.save_effect).toBe(expected);
  });

  it("reads healing from either 'regains' or 'restores', and splits upcast healing from upcast damage", () => {
    const restore = map({ desc: "A creature you touch restores 70 hit points.", damage_roll: "70", damage_types: [], saving_throw_ability: "" });
    expect(restore).toMatchObject({ healing_dice: "70", damage_rolls: null });
    const heal = map({
      desc: "A creature regains hit points equal to 1d8.", damage_roll: "1d8", damage_types: [], saving_throw_ability: "",
      higher_level: "The healing increases by 1d8 for each slot level above 1st.",
    });
    expect(heal).toMatchObject({ higher_level_healing: "1d8", higher_level_damage: null });
    // The base healing effect scales with the same dice, not the damage ones.
    expect(heal?.effects?.find((effect) => effect.kind === "healing")?.scaling).toEqual({ mode: "slot", dice: "1d8" });
    const damage = map({ higher_level: "The damage increases by 1d6 for each slot level above 3rd." });
    expect(damage).toMatchObject({ higher_level_damage: { dice_per_level: "1d6", type: null }, higher_level_healing: null });
  });

  // Chill Touch: "can't regain hit points" read as healing and dropped the damage roll.
  it("keeps damage for a spell that only forbids regaining hit points", () => {
    const chill = map({
      desc: "Make a ranged spell attack. On a hit, the target takes 1d10 Necrotic damage and it can't regain hit points until the start of your next turn.",
      attack_roll: true, saving_throw_ability: "", damage_roll: "1d10", damage_types: ["necrotic"],
    });
    expect(chill).toMatchObject({ healing_dice: null, damage_rolls: [{ dice: "1d10", type: "necrotic" }], attack_type: "ranged_spell" });
  });

  // Production Fireball: the per-level table must not add effects next to the slot scaling.
  it("leaves a slot-level table out of the effects, so an upcast scales the base once", () => {
    const fireball = map({
      level: 3,
      desc: "Each creature makes a Dexterity saving throw, taking 8d6 fire damage on a failed save, or half as much damage on a successful one.",
      damage_roll: "8d6", damage_types: ["fire"],
      higher_level: "The damage increases by 1d6 for each slot level above 3rd.",
      casting_options: [{ type: "slot_level_4", damage_roll: "9d6" }, { type: "slot_level_5", damage_roll: "10d6" }],
    });
    expect(fireball?.effects?.map((effect) => effect.id)).toEqual(["base", "base-save-half"]);
    expect(effectsForCast(fireball?.effects ?? [], 3, 5, 9).map((effect) => effect.dice)).toEqual(["10d6", "10d6"]);
    expect(fireball?.casting_options).toHaveLength(2);
  });

  it("keeps a damage type only when the spell deals exactly one", () => {
    expect(map({ damage_types: ["Fire"] })?.damage_rolls).toEqual([{ dice: "1d6", type: "fire" }]);
    expect(map({ damage_types: ["Fire"] })?.healing_dice).toBeNull();
    // Open5e lists two types and the text names none: no type is invented.
    const twoTypes = { damage_types: ["fire", "radiant"], desc: "Each creature must succeed on a Dexterity saving throw or take 1d6 damage of a type you choose." };
    expect(map(twoTypes)?.damage_rolls).toEqual([{ dice: "1d6", type: "" }]);
  });

  it("names its source, revision, licence and link from the document", () => {
    const meta = { slug: "srd-2024", title: "5e 2024 Rules", ruleset: "2024" as const, source_revision: "Rev 5.2.1", license: "cc-by-40" };
    expect(map({}, meta)).toMatchObject({
      source: "srd-2024", source_title: "5e 2024 Rules", source_revision: "Rev 5.2.1", source_license: "cc-by-40",
      source_url: "https://example.test/srd",
    });
    const bare = map({ document: { ...document, display_name: undefined, permalink: undefined } });
    expect(bare).toMatchObject({
      source_title: "System Reference Document 5.2", source_revision: "System Reference Document 5.2", source_license: null, source_url: null,
    });
  });

  it("trims the higher-level text and turns a blank one into null", () => {
    expect(map({ higher_level: "  More dice.  " })?.higher_levels).toBe("More dice.");
    expect(map({ higher_level: "  " })?.higher_levels).toBeNull();
  });

  it("adds Artificer to a spell on the delta list once, not again when it is already tagged", () => {
    const wizard = [{ name: "Wizard", key: "x" }];
    expect(map({ name: "Acid Splash", classes: wizard })?.classes).toEqual(["Wizard", "Artificer"]);
    expect(map({ name: "Acid Splash", classes: [...wizard, { name: "Artificer", key: "y" }] })?.classes).toEqual(["Wizard", "Artificer"]);
  });
});

describe("mapOpen5eV2Spell: the roll the text proves", () => {
  const map = (overrides: Record<string, unknown>) => mapOpen5eV2Spell(record(overrides) as Parameters<typeof mapOpen5eV2Spell>[0]);
  const noRoll = { damage_roll: "", damage_types: [], casting_options: [], saving_throw_ability: "", attack_roll: false, shape_type: null, shape_size: null };

  // SRD 5.1 Cure Wounds: Open5e leaves damage_roll empty.
  it("reads the healing roll from the text when Open5e gave none", () => {
    const cure = map({
      ...noRoll, level: 1, name: "Cure Wounds",
      desc: "A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier. This spell has no effect on undead or constructs.",
      higher_level: "When you cast this spell using a spell slot of 2nd level or higher, the healing increases by 1d8 for each slot level above 1st.",
    });
    expect(cure).toMatchObject({ healing_dice: "1d8", damage_rolls: null, higher_level_healing: "1d8", attack_type: null });
    expect(cure?.effects?.find((effect) => effect.id === "base")).toMatchObject({ kind: "healing", dice: "1d8", modifier: "spellcasting_ability", scaling: { mode: "slot", dice: "1d8" } });
  });

  // SRD 5.1 Sacred Flame: no top-level roll, but the per-level options exist.
  it("reads a cantrip's damage from the text and keeps the options it was given", () => {
    const flame = map({
      ...noRoll, name: "Sacred Flame", saving_throw_ability: "dexterity",
      desc: "The target must succeed on a dexterity saving throw or take 1d8 radiant damage. The target gains no benefit from cover for this saving throw.",
      casting_options: [{ type: "default" }, { type: "player_level_5", damage_roll: "2d8" }],
    });
    expect(flame).toMatchObject({ damage_rolls: [{ dice: "1d8", type: "radiant" }], healing_dice: null });
    expect(flame?.effects?.map((effect) => [effect.id, effect.dice, effect.damageType])).toEqual([
      ["base", "1d8", "radiant"], ["option-1", "2d8", "radiant"],
    ]);
  });

  // Deep Magic Glacial Cascade: Open5e flags a Constitution save but gives no damage roll.
  it("derives a save-for-half roll from the book's plain sentence and keeps the half effect", () => {
    const cascade = map({
      ...noRoll, level: 8, name: "Glacial Cascade", saving_throw_ability: "constitution",
      desc: "Creatures other than you in the sphere take 10d8 cold damage, or half as much damage with a successful Constitution saving throw.",
    });
    expect(cascade).toMatchObject({ attack_type: "save", save_attribute: "CON", save_effect: "half", damage_rolls: [{ dice: "10d8", type: "cold" }] });
    expect(cascade?.effects?.map((effect) => effect.id)).toEqual(["base", "base-save-half"]);
  });

  // Bug: the sentence's save and Open5e's flag disagree; the roll is then not proven for this spell.
  it("derives no roll when the damage sentence names a different save than Open5e's", () => {
    const mismatch = map({
      ...noRoll, level: 8, saving_throw_ability: "dexterity",
      desc: "Creatures in the sphere take 10d8 cold damage, or half as much damage with a successful Constitution saving throw.",
    });
    expect(mismatch?.damage_rolls).toBeNull();
  });

  // Deep Magic Cloying Darkness: "If it hits" with an attack flag.
  it("derives an attack roll from 'If it hits, the target takes ...'", () => {
    const darkness = map({
      ...noRoll, level: 1, attack_roll: true, name: "Cloying Darkness",
      desc: "Make a ranged spell attack. If it hits, the target takes 2d8 necrotic damage and must make a Constitution saving throw.",
    });
    expect(darkness).toMatchObject({ attack_type: "ranged_spell", damage_rolls: [{ dice: "2d8", type: "necrotic" }] });
  });

  // Deep Magic Ectoplasm: damage when a turn ends is not a cast-time roll.
  it("derives no roll for damage dealt when a creature ends its turn", () => {
    const ecto = map({
      ...noRoll, level: 2, saving_throw_ability: "wisdom",
      desc: "Any creature that ends its turn within 5 feet of the manifestation takes 2d6 psychic damage, or half the damage with a successful Wisdom saving throw.",
    });
    expect(ecto?.damage_rolls).toBeNull();
  });

  it("does not derive a roll when two sentences could be the damage", () => {
    const two = map({
      ...noRoll, saving_throw_ability: "wisdom",
      desc: "On a failed save, the creature takes 3d8 radiant damage (if you are good) or 4d8 necrotic damage (if you are evil).",
    });
    expect(two?.damage_rolls).toBeNull();
  });

  // Open5e lists several types for a spell whose sentence names one.
  it("takes the damage type from the sentence when Open5e's list is empty or several", () => {
    const desc = "Each creature makes a Constitution saving throw. On a failed save, a creature takes 2d8 thunder damage. On a successful save, the creature takes half as much damage.";
    expect(map({ desc, damage_roll: "2d8", damage_types: [], saving_throw_ability: "constitution" })?.damage_rolls).toEqual([{ dice: "2d8", type: "thunder" }]);
    expect(map({ desc, damage_roll: "2d8", damage_types: ["thunder", "force"], saving_throw_ability: "constitution" })?.damage_rolls).toEqual([{ dice: "2d8", type: "thunder" }]);
  });

  // SRD 5.2 Bless: Open5e fills 1d4, an attack roll and a target, but the d4 is added to a later roll.
  it("stores no roll and no attack for a die the text only adds to a later roll", () => {
    const bless = map({
      ...noRoll, name: "Bless", level: 1, attack_roll: true, damage_roll: "1d4",
      desc: "Whenever a target makes an attack roll or a saving throw before the spell ends, the target adds 1d4 to the attack roll or save.",
      casting_options: [{ type: "slot_level_2", target_count: 2 }],
    });
    expect(bless).toMatchObject({ damage_rolls: null, healing_dice: null, effects: [], attack_type: null });
  });

  it("keeps a real spell attack that has a damage roll", () => {
    const bolt = map({
      ...noRoll, attack_roll: true, damage_roll: "1d10", damage_types: ["fire"],
      desc: "Make a ranged spell attack against the target. On a hit, the target takes 1d10 fire damage.",
    });
    expect(bolt).toMatchObject({ attack_type: "ranged_spell", damage_rolls: [{ dice: "1d10", type: "fire" }] });
  });

  // SRD 5.1 Ice Storm: Open5e keeps only the first part.
  describe("two parts in one sentence (Ice Storm)", () => {
    const ice = map({
      key: "srd_ice-storm", name: "Ice Storm", level: 4, saving_throw_ability: "dexterity", damage_roll: "2d8", damage_types: ["bludgeoning"],
      desc: "Each creature in the cylinder must make a dexterity saving throw. A creature takes 2d8 bludgeoning damage and 4d6 cold damage on a failed save, or half as much damage on a successful one.",
      higher_level: "When you cast this spell using a spell slot of 5th level or higher, the bludgeoning damage increases by 1d8 for each slot level above 4th.",
      casting_options: [{ type: "slot_level_5", damage_roll: "3d8" }],
    });

    it("stores one roll and one effect pair per part", () => {
      expect(ice?.damage_rolls).toEqual([{ dice: "2d8", type: "bludgeoning" }, { dice: "4d6", type: "cold" }]);
      expect(ice?.effects?.map((effect) => [effect.id, effect.dice, effect.damageType, effect.multiplier])).toEqual([
        ["base", "2d8", "bludgeoning", 1], ["base-save-half", "2d8", "bludgeoning", 0.5],
        ["base-2", "4d6", "cold", 1], ["base-2-save-half", "4d6", "cold", 0.5],
      ]);
    });

    // Bug: slot scaling went to every part, so a 6th level cast rolled 6d6 cold.
    it("scales only the part the upcast names", () => {
      expect(ice?.higher_level_damage).toEqual({ dice_per_level: "1d8", type: "bludgeoning" });
      expect(effectsForCast(ice?.effects ?? [], 4, 6, 9).map((effect) => [effect.id, effect.dice])).toEqual([
        ["base", "4d8"], ["base-save-half", "4d8"], ["base-2", "4d6"], ["base-2-save-half", "4d6"],
      ]);
    });

    it("scales no part when the upcast names both", () => {
      const choice = map({
        key: "srd_ice-storm", name: "Ice Storm", level: 4, saving_throw_ability: "dexterity", damage_roll: "2d8", damage_types: ["bludgeoning"],
        desc: "A creature takes 2d8 bludgeoning damage and 4d6 cold damage on a failed save, or half as much damage on a successful one.",
        higher_level: "the bludgeoning damage or the cold damage (your choice) increases by 1d8 for each slot level above 4th.",
        casting_options: [],
      });
      expect(choice?.higher_level_damage?.type).toBeNull();
      expect(choice?.effects?.every((effect) => effect.scaling === null)).toBe(true);
    });
  });

  describe("several rays, darts or beams", () => {
    const rays = {
      key: "srd-2024_scorching-ray", name: "Scorching Ray", level: 2, attack_roll: true, damage_roll: "2d6", damage_types: ["fire"], saving_throw_ability: "",
      desc: "You hurl three fiery rays. You can hurl them at one target within range or at several. Make a ranged spell attack for each ray. On a hit, the target takes 2d6 Fire damage.",
      higher_level: "You create one additional ray for each spell slot level above 2.",
      casting_options: [{ type: "slot_level_3", damage_roll: null, target_count: 4 }],
    };

    it("stores the count on the base effect and no dice scaling", () => {
      const ray = map(rays);
      expect(ray?.effects).toHaveLength(1);
      expect(ray?.effects?.[0]).toMatchObject({ id: "base", outcome: "hit", scaling: null, instances: { noun: "ray", count: 3, perSlotAbove: 1 } });
      expect(ray?.higher_level_damage).toBeNull();
    });

    // SRD 5.1 Magic Missile: Open5e carries no roll, no attack and no save, so the dart sentence gives the damage.
    it("derives a dart's damage from its own sentence when Open5e has none", () => {
      const missile = map({
        ...noRoll, key: "srd_magic-missile", name: "Magic Missile", level: 1,
        desc: "You create three glowing darts of magical force. Each dart hits a creature of your choice that you can see within range. A dart deals 1d4 + 1 force damage to its target. The darts all strike simultaneously, and you can direct them to hit one creature or several.",
        higher_level: "When you cast this spell using a spell slot of 2nd level or higher, the spell creates one more dart for each slot level above 1st.",
      });
      expect(missile).toMatchObject({ attack_type: "automatic", damage_rolls: [{ dice: "1d4+1", type: "force" }] });
      expect(missile?.effects?.[0]).toMatchObject({ outcome: "automatic", damageType: "force", instances: { noun: "dart", count: 3, perSlotAbove: 1 } });
    });

    // SRD 5.2 Eldritch Blast: the beams grow with character level, the dice do not.
    it("keeps one effect for a cantrip whose beams grow", () => {
      const blast = map({
        ...noRoll, key: "srd-2024_eldritch-blast", name: "Eldritch Blast", level: 0, attack_roll: true, damage_roll: "1d10", damage_types: ["force"],
        desc: "You hurl a beam of crackling energy. Make a ranged spell attack against one creature or object in range. On a hit, the target takes 1d10 Force damage.",
        higher_level: "The spell creates two beams at level 5, three beams at level 11, and four beams at level 17. You can direct the beams at the same target or at different ones. Make a separate attack roll for each beam.",
        casting_options: [{ type: "player_level_5", damage_roll: null, target_count: 2 }],
      });
      expect(blast?.effects).toHaveLength(1);
      expect(blast?.effects?.[0].instances?.byCharacterLevel).toEqual([{ level: 5, count: 2 }, { level: 11, count: 3 }, { level: 17, count: 4 }]);
      // Resolved for a cast, never for the stored row: character level 11 makes three beams of 1d10.
      const cast = effectsForCast(blast?.effects ?? [], 0, 0, 11);
      expect(cast[0]).toMatchObject({ dice: "1d10", instances: { noun: "beam", count: 3 } });
    });

    // Bug: a spell with a different count wording stayed in the instance path with a wrong count.
    it("stores no instances when the sentences do not match a template", () => {
      expect(map({ ...rays, desc: rays.desc.replace("Make a ranged spell attack for each ray. ", "") })?.effects?.[0].instances).toBeUndefined();
    });
  });

  describe("a damage type chosen at cast", () => {
    // SRD 5.1 Spirit Guardians: Open5e names radiant only.
    const guardians = map({
      key: "srd_spirit-guardians", name: "Spirit Guardians", level: 3, saving_throw_ability: "wisdom", damage_roll: "3d8", damage_types: ["radiant"], attack_roll: false,
      desc: "When the creature enters the area for the first time on a turn or starts its turn there, it must make a wisdom saving throw. On a failed save, the creature takes 3d8 radiant damage (if you are good or neutral) or 3d8 necrotic damage (if you are evil). On a successful save, the creature takes half as much damage.",
      higher_level: "When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d8 for each slot level above 3rd.",
      casting_options: [],
    });

    it("stores an untyped roll and the choices on both effects, still scaling by slot", () => {
      expect(guardians?.damage_rolls).toEqual([{ dice: "3d8", type: "" }]);
      expect(guardians?.effects?.map((e) => [e.id, e.damageType, e.damageTypeChoices, e.scaling?.dice])).toEqual([
        ["base", null, ["radiant", "necrotic"], "1d8"], ["base-save-half", null, ["radiant", "necrotic"], "1d8"],
      ]);
    });

    // Bug: the dice Open5e gave and the text's disagree; the text's choice is not forced on the row.
    it("leaves a spell alone when Open5e's roll is not the text's", () => {
      const other = map({ ...record({ saving_throw_ability: "wisdom", damage_roll: "4d8", damage_types: ["radiant"], desc: "On a failed save, the creature takes 3d8 radiant damage (if you are good or neutral) or 3d8 necrotic damage (if you are evil). On a successful save, the creature takes half as much damage." }) });
      expect(other?.effects?.some((e) => e.damageTypeChoices)).toBe(false);
    });
  });

  describe("extra damage on a hit (Hex)", () => {
    // SRD 5.2 Hex: Open5e marks an attack roll and a roll, but nothing is rolled at cast.
    const hexRecord = {
      key: "srd-2024_hex", name: "Hex", level: 1, attack_roll: true, damage_roll: "1d6", damage_types: ["necrotic"], saving_throw_ability: "",
      desc: "You place a curse on a creature that you can see within range. Until the spell ends, you deal an extra 1d6 Necrotic damage to the target whenever you hit it with an attack roll.",
      higher_level: "Your Concentration can last longer with a spell slot of level 2 (up to 4 hours), 3–4 (up to 8 hours), or 5+ (24 hours).",
      casting_options: [{ type: "slot_level_2" }],
    };

    it("stores the roll with no effects and no attack, so nothing rolls at cast", () => {
      const hex = map(hexRecord);
      expect(hex).toMatchObject({ attack_type: null, effects: [], damage_rolls: [{ dice: "1d6", type: "necrotic" }], higher_level_damage: null });
    });

    // Bug (guard: only a text with one hit-tied extra clause is a rider): a spell attack with a damage roll lost its attack.
    it("keeps a real spell attack as an attack", () => {
      expect(map({ ...hexRecord, desc: "Make a ranged spell attack against the target. On a hit, the target takes 1d6 necrotic damage." })?.attack_type).toBe("ranged_spell");
    });
  });
});

describe("the Open5e spell fetches", () => {
  const doc = (key: string, gamesystem: string, extra: Record<string, unknown> = {}) => ({
    key, name: `Doc ${key}`, gamesystem: { key: gamesystem, name: gamesystem }, ...extra,
  });
  const docs = [
    doc("tob", "5e-2014", { display_name: "Tome of Beasts", licenses: [{ key: "ogl-10a", name: "OGL" }, { key: "cc-by-40", name: "CC" }] }),
    doc("srd-2024", "5e-2024", { display_name: "5e 2024 Rules" }),
    doc("a5e-ag", "a5e", { display_name: "Adventurer's Guide" }),
  ];
  const stub = () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      const results = url.includes("/documents/") ? docs : [record({ document: docs[1] })];
      return new Response(JSON.stringify({ count: results.length, next: null, results }));
    }));
    return urls;
  };

  it("lists only 5e documents, sorted by title, with their licences joined", async () => {
    stub();
    expect(await fetchOpen5eDocuments()).toEqual([
      { slug: "srd-2024", title: "5e 2024 Rules", ruleset: "2024", source_revision: "Doc srd-2024", license: null },
      { slug: "tob", title: "Tome of Beasts", ruleset: "2014", source_revision: "Doc tob", license: "ogl-10a, cc-by-40" },
    ]);
  });

  it("fetches the spells of the documents asked for, and none at all when none matches", async () => {
    const urls = stub();
    const rows = await fetchOpen5eSpells(["srd-2024"]);
    expect(rows).toHaveLength(1);
    const spellsUrl = decodeURIComponent(urls.find((u) => u.includes("/spells/")) ?? "");
    expect(spellsUrl).toContain("document__key__in=srd-2024");
    expect(spellsUrl).not.toContain("tob");
    const before = urls.length;
    expect(await fetchOpen5eSpells(["nope"])).toEqual([]);
    expect(urls.slice(before).some((u) => u.includes("/spells/"))).toBe(false);
  });
});

describe("planLibrarySpellImport", () => {
  const spell = mapOpen5eV2Spell(record() as Parameters<typeof mapOpen5eV2Spell>[0]) as ImportedLibrarySpell;

  function existingRow(overrides: Partial<ExistingLibrarySpellIdentity> = {}): ExistingLibrarySpellIdentity {
    return {
      id: spell.id,
      source_document_key: spell.source_document_key,
      source_record_key: spell.source_record_key,
      image_url: null,
      mechanics_reviewed: false,
      ...overrides,
    };
  }

  it("inserts a spell with no existing row unchanged", () => {
    const plan = planLibrarySpellImport([spell], []);
    expect(plan.rows).toEqual([spell]);
    expect(plan.skippedReviewed).toBe(0);
  });

  it("refreshes an existing unreviewed row, carrying over its id and admin-set image_url", () => {
    const existing = existingRow({ id: "existing-uuid", image_url: "https://example.test/art.webp" });
    const plan = planLibrarySpellImport([spell], [existing]);

    expect(plan.rows).toEqual([{ ...spell, id: "existing-uuid", image_url: "https://example.test/art.webp" }]);
    expect(plan.skippedReviewed).toBe(0);
  });

  it("excludes a reviewed row entirely instead of resetting mechanics_reviewed to false", () => {
    const existing = existingRow({ id: "reviewed-uuid", mechanics_reviewed: true });
    const plan = planLibrarySpellImport([spell], [existing]);

    expect(plan.rows).toEqual([]);
    expect(plan.skippedReviewed).toBe(1);
  });

  it("only skips the reviewed identity, not unrelated spells in the same batch", () => {
    const other = mapOpen5eV2Spell(
      record({ key: "srd-2024_fireball", name: "Fireball" }) as Parameters<typeof mapOpen5eV2Spell>[0],
    ) as ImportedLibrarySpell;
    const existing = existingRow({ id: "reviewed-uuid", mechanics_reviewed: true });

    const plan = planLibrarySpellImport([spell, other], [existing]);

    expect(plan.rows).toEqual([other]);
    expect(plan.skippedReviewed).toBe(1);
  });
});
