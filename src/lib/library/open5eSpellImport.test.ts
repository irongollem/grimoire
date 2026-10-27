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

  it("keeps a damage type only when the spell deals exactly one", () => {
    expect(map({ damage_types: ["Fire"] })?.damage_rolls).toEqual([{ dice: "1d6", type: "fire" }]);
    expect(map({ damage_types: ["Fire"] })?.healing_dice).toBeNull();
    expect(map({ damage_types: ["fire", "radiant"] })?.damage_rolls).toEqual([{ dice: "1d6", type: "" }]);
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
