import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOpen5eDocuments, fetchOpen5eMonsters, mapOpen5eV2Monster } from "@/lib/library/open5eMonsterImport";

afterEach(() => vi.unstubAllGlobals());

type Raw = Parameters<typeof mapOpen5eV2Monster>[0];
const map = (overrides: Record<string, unknown> = {}) => mapOpen5eV2Monster(record(overrides) as Raw);

const document2024 = {
  key: "srd-2024",
  name: "System Reference Document 5.2",
  display_name: "5e 2024 Rules",
  permalink: "https://example.test/srd-2024",
  publisher: { name: "Wizards of the Coast", key: "wizards-of-the-coast" },
  gamesystem: { name: "5th Edition 2024", key: "5e-2024" },
};

const document2014 = {
  key: "srd-2014",
  name: "System Reference Document 5.1",
  display_name: "5e 2014 Rules",
  permalink: "https://example.test/srd-2014",
  publisher: { name: "Wizards of the Coast", key: "wizards-of-the-coast" },
  gamesystem: { name: "5th Edition 2014", key: "5e-2014" },
};

function record(overrides: Record<string, unknown> = {}) {
  return {
    key: "srd-2024_ancient-red-dragon",
    name: "Ancient Red Dragon",
    document: document2024,
    type: { name: "Dragon", key: "dragon" },
    size: { name: "Gargantuan", key: "gargantuan" },
    alignment: "chaotic evil",
    armor_class: 22,
    hit_points: 546,
    hit_dice: "28d20+252",
    ability_scores: { strength: 30, dexterity: 10, constitution: 29, intelligence: 18, wisdom: 15, charisma: 23 },
    challenge_rating: 24,
    actions: [],
    traits: [],
    ...overrides,
  };
}

describe("mapOpen5eV2Monster — initiative_bonus", () => {
  it("maps initiative_bonus into stat_block for a srd-2024 record", () => {
    const monster = mapOpen5eV2Monster(
      record({ initiative_bonus: 14 }) as Parameters<typeof mapOpen5eV2Monster>[0],
    );
    expect(monster.ruleset).toBe("2024");
    expect(monster.stat_block.initiative_bonus).toBe(14);
  });

  it("ignores initiative_bonus for a srd-2014 record even when the API returns a value", () => {
    // Verified API fact: srd-2014 creatures carry initiative_bonus: 0 regardless of
    // DEX, which is indistinguishable from "unset" — so 2014 records never trust it,
    // even in the (hypothetical) case the API returns a nonzero value.
    const monster = mapOpen5eV2Monster(
      record({ document: document2014, key: "srd_ancient-red-dragon", initiative_bonus: 5 }) as Parameters<
        typeof mapOpen5eV2Monster
      >[0],
    );
    expect(monster.ruleset).toBe("2014");
    expect(monster.stat_block.initiative_bonus).toBeUndefined();
  });

  it("leaves initiative_bonus undefined for a 2024 record that omits the field", () => {
    const monster = mapOpen5eV2Monster(record() as Parameters<typeof mapOpen5eV2Monster>[0]);
    expect(monster.stat_block.initiative_bonus).toBeUndefined();
  });
});

describe("mapOpen5eV2Monster — source_license", () => {
  it("derives source_license from the document-metadata map (formatting and absence are owned by licenseForDocumentKey)", () => {
    const documentMetadata = new Map([
      ["srd-2024", { ...document2024, licenses: [{ name: "CC-BY 4.0", key: "cc-by-40" }] }],
    ]);
    const monster = mapOpen5eV2Monster(record() as Parameters<typeof mapOpen5eV2Monster>[0], documentMetadata);
    expect(monster.source_license).toBe("cc-by-40");
  });
});

describe("mapOpen5eV2Monster — speed", () => {
  it("prefers native `speed` over `speed_all` (derived half-speeds would break wild shape)", () => {
    // Open5e v2's speed_all bakes in derived swim/crawl at walk/2 for every
    // walker; isEligibleWildshapeForm excludes swim/fly forms below druid
    // level 8, so mapping speed_all made every beast ineligible (#553 fallout).
    const monster = mapOpen5eV2Monster(
      record({
        speed: { walk: 40, unit: "feet", climb: 30 },
        speed_all: { walk: 40, unit: "feet", climb: 30, swim: 20, crawl: 20, fly: 0, hover: false },
      }) as Parameters<typeof mapOpen5eV2Monster>[0],
    );
    expect(monster.stat_block.speed).toBe("40 ft., climb 30 ft.");
  });

  it("falls back to speed_all when native speed is absent", () => {
    const monster = mapOpen5eV2Monster(
      record({
        speed: undefined,
        speed_all: { walk: 30, unit: "feet", swim: 15 },
      }) as Parameters<typeof mapOpen5eV2Monster>[0],
    );
    expect(monster.stat_block.speed).toBe("30 ft., swim 15 ft.");
  });
});

describe("mapOpen5eV2Monster — library_monsters row shape", () => {
  it("emits no campaign_id: the seed script spreads this row into library_monsters, which has no such column", () => {
    // #597 gave the DM's own `monsters` table a campaign_id. These rows are
    // shared reference material bound for `library_monsters`, so carrying one
    // here fails the whole seed batch with PGRST204 — invisibly, until someone
    // runs `npm run seed-library-monsters`. The Omit on the return type is the
    // primary guard; this pins the runtime shape the bare spread depends on.
    expect(Object.prototype.hasOwnProperty.call(mapOpen5eV2Monster(record()), "campaign_id")).toBe(false);
  });
});

describe("mapOpen5eV2Monster — size", () => {
  it("maps A5E's Titanic to gargantuan, the largest 5e size", () => {
    const monster = mapOpen5eV2Monster(
      record({ size: { name: "Titanic", key: "titanic" } }) as Parameters<typeof mapOpen5eV2Monster>[0],
    );
    expect(monster.size).toBe("gargantuan");
  });

  it("refuses a size it does not know rather than calling it medium", () => {
    expect(() =>
      mapOpen5eV2Monster(record({ size: { name: "Colossal", key: "colossal" } }) as Parameters<typeof mapOpen5eV2Monster>[0]),
    ).toThrow(/Colossal/);
  });
});

describe("mapOpen5eV2Monster — structured actions (#1017)", () => {
  const SCIMITAR =
    "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.";

  it("structures an attack action from its prose, ignoring Open5e's own attack data", () => {
    const monster = mapOpen5eV2Monster(
      record({
        document: document2014,
        key: "srd_goblin",
        // Open5e's structured attack data for this creature is wrong (thunder, no
        // damage bonus); the mapper must not read it.
        attacks: [{ name: "Scimitar", damage_type: "thunder", damage_bonus: 0 }],
        actions: [{ name: "Scimitar", desc: SCIMITAR, action_type: "ACTION" }],
      }) as Parameters<typeof mapOpen5eV2Monster>[0],
    );
    const scimitar = monster.stat_block.actions?.[0]?.structured;
    expect(scimitar?.kind).toBe("attack");
    expect(scimitar?.attack?.bonus).toBe(4);
    expect(scimitar?.attack?.hit[0]).toEqual({ dice: "1d6+2", type: "slashing" });
    expect(scimitar?.source).toBe("parsed");
  });

  it("turns Open5e's display modifier strings into defenses", () => {
    const monster = mapOpen5eV2Monster(
      record({
        resistances_and_immunities: { damage_immunities_display: "fire, poison", condition_immunities_display: "charmed" },
      }) as Parameters<typeof mapOpen5eV2Monster>[0],
    );
    expect(monster.stat_block.defenses.immunities[0]?.types).toEqual(["fire", "poison"]);
    expect(monster.stat_block.defenses.condition_immunities).toEqual(["Charmed"]);
    expect("damage_immunities" in monster.stat_block).toBe(false);
  });
});

describe("mapOpen5eV2Monster — legendary action cost", () => {
  it("puts back the printed '(Costs N Actions)' Open5e strips from SRD names, so the cost is in the prose", () => {
    const wing = "The dragon beats its wings. Each creature within 10 ft. of the dragon must succeed on a DC 22 Dexterity saving throw or take 15 (2d6 + 8) bludgeoning damage and be knocked prone.";
    const monster = mapOpen5eV2Monster({
      ...record(),
      actions: [
        { name: "Detect", desc: "The dragon makes a Wisdom (Perception) check.", action_type: "LEGENDARY_ACTION", legendary_action_cost: 1 },
        { name: "Wing Attack", desc: wing, action_type: "LEGENDARY_ACTION", legendary_action_cost: 2 },
        { name: "Bite", desc: "Melee Weapon Attack: +14 to hit, reach 10 ft., one target. Hit: 19 (2d10 + 8) piercing damage.", action_type: "ACTION", legendary_action_cost: 1 },
      ],
    } as Parameters<typeof mapOpen5eV2Monster>[0]);
    const legendary = monster.stat_block.legendary_actions ?? [];
    expect(legendary.map((e) => e.name)).toEqual(["Detect", "Wing Attack (Costs 2 Actions)"]);
    expect(legendary[1].structured.legendary_cost).toBe(2);
    expect(legendary[0].structured.legendary_cost).toBe(1);
  });
});

describe("mapOpen5eV2Monster — the printed stat block", () => {
  // An Aboleth-shaped record: every field Open5e serves that the mapper reads.
  const aboleth = {
    name: "Aboleth (Elder)",
    type: { name: "Aberration (shapechanger)", key: "aberration" },
    size: { name: "Large", key: "large" },
    alignment: "",
    armor_class: 17,
    hit_points: 150,
    hit_dice: "20d10+40",
    speed: { walk: 10, swim: 40, fly: 30, hover: true, unit: "feet" },
    ability_scores: { strength: 21, dexterity: 9, constitution: 15, intelligence: 18, wisdom: 15, charisma: 18 },
    modifiers: { strength: 5, dexterity: -1, constitution: 2, intelligence: 4, wisdom: 2, charisma: 4 },
    saving_throws: { strength: 5, dexterity: 3, constitution: 6, intelligence: 8, wisdom: 2, charisma: 4 },
    skill_bonuses: { history: 12, stealth: 0, arcana: -1 },
    resistances_and_immunities: { damage_resistances_display: "cold", damage_vulnerabilities_display: "", damage_immunities_display: "fire" },
    darkvision_range: 120, blindsight_range: 30, tremorsense_range: 0, truesight_range: 60,
    languages: { as_string: "Deep Speech, telepathy 120 ft." },
    challenge_rating: "10",
    traits: [
      { name: "Amphibious (2/Day)", desc: "Breathes air and water." },
      { name: "Legendary Resistance (3 / Day)", desc: "It succeeds instead." },
    ],
    actions: [
      { name: "Tail", desc: "Melee Weapon Attack: +9 to hit, reach 10 ft., one target. Hit: 12 (2d6 + 5) bludgeoning damage.", action_type: "ACTION" },
      { name: "Slime", desc: "A creature is diseased.", action_type: "BONUS_ACTION" },
      { name: "Parry", desc: "Adds 3 to its AC.", action_type: "REACTION" },
    ],
  };
  const block = (over: Record<string, unknown> = {}) => map({ ...aboleth, ...over }).stat_block;

  it("prints the header line the way the book does", () => {
    const sb = block();
    expect(sb.hit_points).toBe("150 (20d10+40)");
    expect(sb.speed).toBe("10 ft., fly 30 ft. (hover), swim 40 ft.");
    expect(sb.senses).toBe("darkvision 120 ft., blindsight 30 ft., truesight 60 ft.");
    expect(sb.languages).toBe("Deep Speech, telepathy 120 ft.");
    expect(sb.challenge_rating).toBe("10");
    expect([sb.str, sb.dex, sb.con, sb.int, sb.wis, sb.cha]).toEqual([21, 9, 15, 18, 15, 18]);
  });

  it("lists a saving throw only where it differs from the plain ability modifier, and signs skills", () => {
    // Str, Wis and Cha equal their modifiers: Open5e lists all six, the book prints the proficient ones.
    expect(block().saving_throws).toBe("Dex +3, Con +6, Int +8");
    expect(block().skills).toEqual({ history: "+12", stealth: "+0", arcana: "-1" });
    expect(block({ saving_throws: { strength: -1 }, modifiers: { strength: 0 } }).saving_throws).toBe("Str -1");
  });

  it("leaves out everything the creature does not have", () => {
    const sb = block({
      saving_throws: { strength: 5 }, skill_bonuses: {}, darkvision_range: 0, blindsight_range: null, truesight_range: undefined,
      languages: { as_string: "" }, traits: [], actions: [],
    });
    expect([sb.saving_throws, sb.skills, sb.senses, sb.languages, sb.special_abilities, sb.actions, sb.bonus_actions, sb.reactions, sb.legendary_actions])
      .toEqual(Array(9).fill(undefined));
  });

  it("splits actions by kind and reads the Legendary Resistance count from its own trait", () => {
    const sb = block();
    expect(sb.actions?.map((a) => a.name)).toEqual(["Tail"]);
    expect(sb.bonus_actions?.map((a) => a.name)).toEqual(["Slime"]);
    expect(sb.reactions?.map((a) => a.name)).toEqual(["Parry"]);
    expect(sb.special_abilities?.map((a) => a.name)).toEqual(["Amphibious (2/Day)", "Legendary Resistance (3 / Day)"]);
    expect(sb.legendary_resistance).toBe(3);
    expect(block({ traits: [{ name: "Legendary Resistance", desc: "x" }] }).legendary_resistance).toBeUndefined();
  });

  it("falls back to the 5e defaults for what Open5e leaves out", () => {
    const sb = block({ speed: undefined, speed_all: undefined, hit_dice: "", ability_scores: { strength: 8 }, challenge_rating: undefined });
    expect(sb.speed).toBe("30 ft.");
    expect(sb.hit_points).toBe("150");
    expect([sb.str, sb.dex, sb.con, sb.int, sb.wis, sb.cha]).toEqual([8, 10, 10, 10, 10, 10]);
    expect(sb.challenge_rating).toBe("0");
    expect(block({ speed: { walk: 0 } }).speed).toBe("30 ft.");
  });

  it("prints metric speeds in metres and only hovers a flyer", () => {
    expect(block({ speed: { walk: 9, climb: 4, unit: "meters" } }).speed).toBe("9 m, climb 4 m");
    expect(block({ speed: { walk: 30, hover: true } }).speed).toBe("30 ft.");
  });

  it("files the creature under its base type, size and name", () => {
    const aberration = map(aboleth);
    expect(aberration).toMatchObject({
      monster_type: "aberration", size: "large", alignment: "unaligned", conceptual_key: "aboleth_elder",
      source_title: "5e 2024 Rules", is_shared: true, open5e_import: true,
    });
    expect(map({ type: { name: "Giant of the Storm", key: "x" } }).monster_type).toBe("giant");
    expect(map({ type: { name: "Swarm of Tiny Beasts", key: "x" } }).monster_type).toBe("monstrosity");
    expect(map({ document: { ...document2024, display_name: undefined } }).source_title).toBe("System Reference Document 5.2");
    expect(map({ alignment: "lawful good" }).alignment).toBe("lawful good");
  });

  it("carries the source identity a re-import matches on", () => {
    expect(map({ document: { ...document2024, permalink: "https://example.test/srd-2024" } })).toMatchObject({
      ruleset: "2024",
      source: "srd-2024",
      source_document_key: "srd-2024",
      source_record_key: "srd-2024_ancient-red-dragon",
      source_revision: "System Reference Document 5.2",
      source_url: "https://example.test/srd-2024",
      provenance: {
        provider: "open5e-v2",
        document: { key: "srd-2024", publisher: { key: "wizards-of-the-coast" }, gamesystem: { key: "5e-2024" }, permalink: "https://example.test/srd-2024" },
      },
    });
  });

  it("does not add a cost to a name that already prints one, or to an action that is not legendary", () => {
    const sb = block({
      actions: [
        { name: "Wing Attack (Costs 2 Actions)", desc: "x", action_type: "LEGENDARY_ACTION", legendary_action_cost: 2 },
        { name: "Bite", desc: "y", action_type: "ACTION", legendary_action_cost: 2 },
      ],
    });
    expect(sb.legendary_actions?.map((a) => a.name)).toEqual(["Wing Attack (Costs 2 Actions)"]);
    expect(sb.actions?.map((a) => a.name)).toEqual(["Bite"]);
  });
});

describe("the Open5e fetches", () => {
  const body = (results: unknown[]) => new Response(JSON.stringify({ count: results.length, next: null, results }));

  it("lists documents by display name, sorted by title", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => body([
      { key: "tob", name: "Tome of Beasts" },
      { key: "srd-2024", name: "SRD 5.2", display_name: "5e 2024 Rules" },
      { key: "a5e", name: "Adventurers" },
    ])));
    expect(await fetchOpen5eDocuments()).toEqual([
      { slug: "srd-2024", title: "5e 2024 Rules" },
      { slug: "a5e", title: "Adventurers" },
      { slug: "tob", title: "Tome of Beasts" },
    ]);
  });

  it("fetches the supported documents when no source is named, including for an empty list", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/documents/")) return body([{ ...document2024, licenses: [{ name: "CC", key: "cc-by-40" }] }]);
      return body([record()]);
    }));
    const rows = await fetchOpen5eMonsters([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source_license).toBe("cc-by-40");
    expect(urls.find((u) => u.includes("/creatures/"))).toContain("document__key__in=srd-2024");
  });
});
