import { describe, expect, it } from "vitest";
import {
  parseSize,
  parseSpeed,
  parseLanguages,
  parseAsi,
  parseTags,
  buildImportedFields,
} from "./open5eSpeciesImport";
import type { Open5eRace } from "./open5eSpeciesImport";

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
      { name: "Size", desc: "Elves are Medium or Small.", type: null },
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

  it("returns null for missing/empty input", () => {
    expect(parseSpeed(undefined)).toBeNull();
    expect(parseSpeed("")).toBeNull();
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

  it("resolves ruleset null for a non-5e document", () => {
    const fields = buildImportedFields(
      race({ document: { ...document, gamesystem: { name: "Advanced 5e", key: "a5e" } } }),
    );
    expect(fields.ruleset).toBeNull();
  });
});
