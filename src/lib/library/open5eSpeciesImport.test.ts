import { describe, expect, it } from "vitest";
import {
  parseSize,
  parseSpeed,
  parseSpeciesSpeed,
  parseLanguages,
  parseAsi,
  parseTags,
  buildImportedFields,
  buildSubrace,
  groupSubspecies,
  languagesNeedTrait,
} from "@/lib/library/open5eSpeciesImport";
import type { Open5eRace } from "@/lib/library/open5eSpeciesImport";

const document = {
  name: "System Reference Document 5.2",
  key: "srd-2024",
  display_name: "5e 2024 Rules",
  permalink: "https://example.test/srd",
  publisher: { name: "Wizards of the Coast", key: "wizards-of-the-coast" },
  gamesystem: { name: "5th Edition 2024", key: "5e-2024" },
};

function race(overrides: Partial<Open5eRace> = {}): Open5eRace {
  return {
    key: "srd-2024_elf",
    name: "Elf",
    desc: "Elves are a magical people of otherworldly grace.",
    is_subspecies: false,
    subspecies_of: null,
    traits: [
      { name: "Size", desc: "Elves are slender. Your size is Medium.", type: null },
      { name: "Speed", desc: "30 ft., fly 30 ft.", type: null },
      {
        name: "Languages",
        desc: "You can speak, read, and write Common and Elvish.",
        type: null,
      },
      {
        name: "Ability Score Increase",
        desc: "Your Dexterity score increases by 2 and your Intelligence score increases by 1.",
        type: null,
      },
      { name: "Darkvision", desc: "You can see in the dark within *60 feet*.", type: null },
    ],
    document,
    ...overrides,
  };
}

describe("parseSize", () => {
  it("accepts a known size", () => {
    expect(parseSize("medium")).toBe("medium");
    expect(parseSize("Small")).toBe("small");
  });

  it("returns null for an unrecognized size", () => {
    expect(parseSize("huge")).toBeNull();
    expect(parseSize("")).toBeNull();
  });
});

describe("parseSpeed", () => {
  it("parses walk speed alone", () => {
    expect(parseSpeed("30 ft.")).toEqual({ walk: 30 });
  });

  it("parses walk plus fly/swim/climb speeds", () => {
    expect(parseSpeed("30 ft., fly 30 ft.")).toEqual({ walk: 30, fly: 30 });
    expect(parseSpeed("25 ft., swim 25 ft., climb 25 ft.")).toEqual({
      walk: 25,
      swim: 25,
      climb: 25,
    });
  });

  it("parses the prose the 2014 SRD and Kobold Press books write", () => {
    expect(parseSpeed("Your base walking speed is 25 feet. Your speed is not reduced by wearing heavy armor.")).toEqual({
      walk: 25,
    });
    expect(parseSpeed("Alseid are fast for their size, with a base walking speed of 40 feet.")).toEqual({ walk: 40 });
    expect(parseSpeed("Your base walking speed is 30 feet, and you have a climbing speed of 30 feet.")).toEqual({
      walk: 30,
      climb: 30,
    });
  });

  it("parses the 2024 SRD's bare distance", () => {
    expect(parseSpeed("35 feet")).toEqual({ walk: 35 });
  });

  it("returns null when the speed is deferred to a subrace", () => {
    expect(parseSpeed("Your base walking speed is determined by your Heritage Subrace.")).toBeNull();
  });

  it("returns null for missing/empty input", () => {
    expect(parseSpeed(undefined)).toBeNull();
    expect(parseSpeed("")).toBeNull();
  });
});

describe("parseSpeciesSpeed", () => {
  it("adds a speed another trait grants in so many words", () => {
    expect(
      parseSpeciesSpeed([
        { name: "Speed", desc: "Your base walking speed is 25 feet.", type: null },
        { name: "Digger", desc: "You have a burrowing speed of 20 feet, but only through earth and sand.", type: null },
      ]),
    ).toEqual({ walk: 25, burrow: 20 });
  });

  it("ignores a number in an unrelated rule", () => {
    expect(
      parseSpeciesSpeed([
        { name: "Speed", desc: "30 feet", type: null },
        { name: "Draconic Flight", desc: "You have a Fly Speed equal to your Speed, and can fly 30 feet once.", type: null },
      ]),
    ).toEqual({ walk: 30 });
  });
});

describe("parseLanguages", () => {
  it("strips the markdown header and 'you speak' preamble", () => {
    expect(parseLanguages("You can speak, read, and write Common and Elvish.")).toEqual([
      "Common",
      "Elvish",
    ]);
  });

  it("handles a bold-italic header prefix", () => {
    expect(
      parseLanguages("***Languages.*** You can speak, read, and write Common and Dwarvish."),
    ).toEqual(["Common", "Dwarvish"]);
  });

  it("drops descriptive 'your choice of' phrasing", () => {
    expect(
      parseLanguages("You can speak, read, and write Common and your choice of one other language."),
    ).toEqual(["Common"]);
  });

  it("leaves out every kind of choice, which is no language the character knows yet", () => {
    expect(parseLanguages("You can speak, read, and write Common, Elvish, and one extra language of your choice.")).toEqual([
      "Common",
      "Elvish",
    ]);
    expect(parseLanguages("You can speak, read, and write Dwarvish and your choice of Common or Undercommon.")).toEqual([
      "Dwarvish",
    ]);
    expect(parseLanguages("You can speak Erina and either Common or Sylvan.")).toEqual(["Erina"]);
    expect(
      parseLanguages("You can speak, read, and write Common and one of the following: Abyssal, Infernal, or Void Speech."),
    ).toEqual(["Common"]);
    expect(
      parseLanguages(
        "You can speak, read, and write Common, Darakhul, and a language associated with your Heritage Subrace.",
      ),
    ).toEqual(["Common", "Darakhul"]);
  });

  it("does not split a language on the commas inside its parenthetical", () => {
    expect(
      parseLanguages(
        "You can speak, read, and write Common, Machine Speech (a whistling, clicking language that's incomprehensible to non-gearforged), and a language associated with your Race Chassis.",
      ),
    ).toEqual(["Common", "Machine Speech"]);
  });

  it("returns an empty array for missing input", () => {
    expect(parseLanguages(undefined)).toEqual([]);
  });
});

describe("parseAsi", () => {
  it("parses a single ability increase", () => {
    expect(parseAsi("Your Charisma score increases by 2.")).toEqual({ cha: 2 });
  });

  it("parses multiple ability increases", () => {
    expect(
      parseAsi("Your Dexterity score increases by 2 and your Intelligence score increases by 1."),
    ).toEqual({ dex: 2, int: 1 });
  });

  it("returns null for missing/no-match input", () => {
    expect(parseAsi(undefined)).toBeNull();
    expect(parseAsi("No ability score changes here.")).toBeNull();
  });
});

describe("parseTags", () => {
  it("includes humanoid, size, and the race's own name", () => {
    expect(parseTags(race(), "medium")).toEqual(["humanoid", "medium", "elf"]);
  });

  it("does not repeat a tag when the race is named after one", () => {
    expect(parseTags(race({ name: "Humanoid" }), null)).toEqual(["humanoid"]);
    expect(parseTags(race({ name: "Small" }), "small")).toEqual(["humanoid", "small"]);
  });

  it("hyphenates multi-word race names and skips a null size", () => {
    expect(parseTags(race({ name: "Half-Elf" }), null)).toEqual(["humanoid", "half-elf"]);
  });
});

describe("buildImportedFields", () => {
  it("maps a realistic Open5e species into importable fields", () => {
    const fields = buildImportedFields(race());

    expect(fields).toMatchObject({
      name: "Elf",
      size: "medium",
      speed: { walk: 30, fly: 30 },
      ability_score_increases: { dex: 2, int: 1 },
      languages: ["Common", "Elvish"],
      tags: ["humanoid", "medium", "elf"],
      source: "5e 2024 Rules",
      ruleset: "2024",
      conceptual_key: "elf",
      source_document_key: "srd-2024",
      source_record_key: "srd-2024_elf",
      source_revision: "System Reference Document 5.2",
      // No documentMetadata map passed above (no source_license data available) —
      // the populated case is covered by the "source_license" describe block below.
      source_license: null,
    });
    expect(fields.description).toBe(
      JSON.stringify({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Elves are a magical people of otherworldly grace." }],
          },
        ],
      }),
    );
    // "Size", "Speed", "Languages", "Ability Score Increase" traits are consumed
    // into their own fields above and must not also appear in `traits`.
    expect(fields.traits).toHaveLength(1);
    expect(fields.traits[0]).toMatchObject({ name: "Darkvision" });
    expect(fields.provenance).toMatchObject({
      provider: "open5e-v2",
      document: {
        key: "srd-2024",
        publisher: { name: "Wizards of the Coast", key: "wizards-of-the-coast" },
        gamesystem: { name: "5th Edition 2024", key: "5e-2024" },
        permalink: "https://example.test/srd",
      },
    });
  });

  it("keeps a consumed trait when its field cannot hold all of it", () => {
    const fields = buildImportedFields(
      race({
        traits: [
          { name: "Size", desc: "Your size is determined by your Heritage Subrace.", type: null },
          { name: "Speed", desc: "Your base walking speed is 25 feet. Your speed is not reduced by wearing heavy armor.", type: null },
          { name: "Languages", desc: "You can speak, read, and write Elvish and your choice of Common or Undercommon.", type: null },
        ],
      }),
    );
    expect(fields.size).toBeNull();
    expect(fields.speed).toEqual({ walk: 25 });
    expect(fields.languages).toEqual(["Elvish"]);
    expect(fields.traits.map((trait) => trait.name)).toEqual(["Size", "Speed", "Languages"]);
  });

  it("keeps the Size trait when the species offers two sizes", () => {
    const fields = buildImportedFields(
      race({ traits: [{ name: "Size", desc: "Medium (about 4–7 feet tall) or Small (about 2–4 feet tall), chosen when you select this species", type: null }] }),
    );
    expect(fields.traits.map((trait) => trait.name)).toEqual(["Size"]);
  });

  it("leaves the description null when Open5e has none", () => {
    expect(buildImportedFields(race({ desc: "" })).description).toBeNull();
  });

  it("resolves ruleset null for a non-5e document", () => {
    const fields = buildImportedFields(
      race({ document: { ...document, gamesystem: { name: "Advanced 5e", key: "a5e" } } }),
    );
    expect(fields.ruleset).toBeNull();
  });
});

describe("buildImportedFields — source_license", () => {
  it("derives source_license from a document-metadata map keyed by document key", () => {
    const documentMetadata = new Map([
      ["srd-2024", { ...document, licenses: [{ name: "CC-BY 4.0", key: "cc-by-40" }] }],
    ]);
    const fields = buildImportedFields(race(), documentMetadata);
    expect(fields.source_license).toBe("cc-by-40");
  });
});

function highElf(overrides: Partial<Open5eRace> = {}): Open5eRace {
  return race({
    key: "srd-2024_high-elf",
    name: "High Elf",
    desc: "You have a keen mind.",
    is_subspecies: true,
    subspecies_of: "srd-2024_elf",
    traits: [
      { name: "Ability Score Increase", desc: "Your Intelligence score increases by 1.", type: null },
      { name: "Cantrip", desc: "You know one cantrip of your choice.", type: null },
    ],
    ...overrides,
  });
}

describe("buildSubrace", () => {
  it("keeps the subrace's own ability score increase out of its traits", () => {
    const subrace = buildSubrace(highElf());
    expect(subrace.name).toBe("High Elf");
    expect(subrace.ability_score_increases).toEqual({ int: 1 });
    expect(subrace.traits.map((trait) => trait.name)).toEqual(["Cantrip"]);
    expect(JSON.parse(subrace.description).type).toBe("doc");
  });

  it("leaves the description empty when Open5e has none", () => {
    expect(buildSubrace(highElf({ desc: "" })).description).toBe("");
  });
});

describe("groupSubspecies", () => {
  it("folds each subspecies under its parent and keeps only core species as rows", () => {
    const { core, subracesByParent, orphans } = groupSubspecies([race(), highElf()]);
    expect(core.map((entry) => entry.key)).toEqual(["srd-2024_elf"]);
    expect(subracesByParent.get("srd-2024_elf")?.map((subrace) => subrace.name)).toEqual(["High Elf"]);
    expect(orphans).toEqual([]);
  });

  it("keeps every subspecies of one parent, in the order fetched", () => {
    const { subracesByParent } = groupSubspecies([race(), highElf(), highElf({ key: "srd-2024_wood-elf", name: "Wood Elf" })]);
    expect(subracesByParent.get("srd-2024_elf")?.map((subrace) => subrace.name)).toEqual(["High Elf", "Wood Elf"]);
  });

  it("reports a subspecies whose parent was not fetched instead of dropping it silently", () => {
    const stray = highElf({ subspecies_of: "srd-2024_dwarf" });
    const { subracesByParent, orphans } = groupSubspecies([race(), stray]);
    expect(subracesByParent.size).toBe(0);
    expect(orphans).toEqual([stray]);
  });
});

const SHADE_LANGUAGES = "You can speak, read, and write Common and one other language spoken by your Living Origin.";

describe("Shade languages wording", () => {
  it("keeps Common and treats the origin language as a choice", () => {
    expect(parseLanguages(SHADE_LANGUAGES)).toEqual(["Common"]);
    expect(languagesNeedTrait(SHADE_LANGUAGES)).toBe(true);
  });
});

describe("subrace size, speed and languages", () => {
  it("reads them from the subspecies' traits and consumes what the fields hold", () => {
    const subrace = buildSubrace(highElf({
      traits: [
        { name: "Size", desc: "Your size is Small.", type: null },
        { name: "Speed", desc: "Your base walking speed is 25 feet.", type: null },
        { name: "Languages", desc: "You can speak, read, and write Common and Elvish.", type: null },
        { name: "Cantrip", desc: "You know one cantrip.", type: null },
      ],
    }));
    expect(subrace).toMatchObject({ size: "small", speed: { walk: 25 }, languages: ["Common", "Elvish"] });
    expect(subrace.traits.map((trait) => trait.name)).toEqual(["Cantrip"]);
  });

  it("omits the keys when the record has no value", () => {
    const subrace = buildSubrace(highElf());
    expect(subrace).not.toHaveProperty("size");
    expect(subrace).not.toHaveProperty("speed");
    expect(subrace).not.toHaveProperty("languages");
  });

  it("reads Bhain Kwai's swimming speed from its trait sentence", () => {
    const subrace = buildSubrace(highElf({
      key: "toh_bhain-kwai",
      name: "Bhain Kwai",
      traits: [{ name: "Wetland Dweller", desc: "You have a swimming speed of 25 feet.", type: null }],
    }));
    expect(subrace.speed).toEqual({ swim: 25 });
  });

  it("fills from the gap table where the record is empty", () => {
    expect(buildSubrace(highElf({ key: "toh_malkin", traits: [] }))).toMatchObject({ size: "small" });
    expect(buildSubrace(highElf({ key: "toh_morel", traits: [] }))).toMatchObject({ size: "small", speed: { walk: 35 } });
  });

  it("fills a language from the gap table where the record states none, and keeps a parsed one", () => {
    expect(buildSubrace(highElf({ key: "toh_derro-heritage", traits: [] })).languages).toEqual(["Dwarvish"]);
    const parsed = buildSubrace(highElf({
      key: "toh_derro-heritage",
      traits: [{ name: "Languages", desc: "You can speak, read, and write Common.", type: null }],
    }));
    expect(parsed.languages).toEqual(["Common"]);
  });

  it("does not override a parsed value with the gap table", () => {
    const subrace = buildSubrace(highElf({
      key: "toh_morel",
      traits: [{ name: "Size", desc: "Your size is Medium.", type: null }, { name: "Speed", desc: "40 ft.", type: null }],
    }));
    expect(subrace).toMatchObject({ size: "medium", speed: { walk: 40 } });
  });
});

describe("core gap fill", () => {
  it("gives the empty Shade record Medium and 30 ft", () => {
    const fields = buildImportedFields(race({ key: "toh_shade", name: "Shade", traits: [] }));
    expect(fields).toMatchObject({ size: "medium", speed: { walk: 30 } });
  });

  it("keeps the deferring Size trait while filling the size", () => {
    const fields = buildImportedFields(race({
      key: "toh_shade",
      traits: [{ name: "Size", desc: "Your size is that of your Living Origin, Medium or Small.", type: null }],
    }));
    expect(fields.size).toBe("medium");
    expect(fields.traits.map((trait) => trait.name)).toContain("Size");
  });
});
