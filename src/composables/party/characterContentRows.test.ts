import { describe, expect, it } from "vitest";
import { contentName, contentRows, type ContentRow } from "./characterContentRows";

function row(rows: ContentRow[], label: string): ContentRow | undefined {
  return rows.find((r) => r.label === label);
}

function text(rows: ContentRow[], label: string): string | undefined {
  const found = row(rows, label);
  return found && (found.kind === "text" || found.kind === "rich") ? found.text : undefined;
}

describe("contentRows", () => {
  it("lists only what is there, in the order a DM reads it", () => {
    const rows = contentRows("species", {
      description: "A small light.",
      size: "Small",
      languages: ["Common"],
      notes: "DM only",
      avg_height: "",
      traits: [],
    });
    expect(rows.map((r) => r.label)).toEqual(["Description", "Size", "Languages"]);
  });

  it("skips a field of the wrong type rather than printing it", () => {
    expect(contentRows("species", { size: 3, languages: "Common", traits: "many", speed: "fast" })).toEqual([]);
  });

  it("reads a speed stored as a number or per mode, dropping modes of zero", () => {
    expect(text(contentRows("species", { speed: 30 }), "Speed")).toBe("30 ft.");
    expect(text(contentRows("species", { speed: { walk: 30, fly: 20, swim: 0 } }), "Speed")).toBe(
      "walk 30 ft., fly 20 ft.",
    );
  });

  it("reads ability bonuses stored as prose or as a score per ability", () => {
    expect(text(contentRows("species", { ability_score_increases: { description: "+2 WIS, +1 CON" } }), "Ability scores"))
      .toBe("+2 WIS, +1 CON");
    expect(text(contentRows("species", { ability_score_increases: { str: 2, dex: 0, cha: -1 } }), "Ability scores"))
      .toBe("STR +2, CHA -1");
    expect(row(contentRows("species", { ability_score_increases: {} }), "Ability scores")).toBeUndefined();
  });

  it("shows natural armor, including an AC of ten", () => {
    expect(text(contentRows("species", { natural_armor_ac: 13 }), "Natural armor AC")).toBe("13");
    expect(row(contentRows("species", { natural_armor_ac: null }), "Natural armor AC")).toBeUndefined();
  });

  it("says how often an innate spell can be cast, from which level, and for which variant", () => {
    const grants = row(
      contentRows("species", {
        granted_spells: [
          { spell_name: "Druidcraft", uses_per_day: null, min_level: 1, subrace: null },
          { spell_name: "Entangle", uses_per_day: 1, min_level: 3, subrace: "Fenborn" },
          { spell_name: "", uses_per_day: 1 },
          "not a grant",
        ],
      }),
      "Spells it grants",
    );
    expect(grants).toEqual({
      label: "Spells it grants",
      kind: "list",
      entries: ["Druidcraft (at will)", "Entangle (1/day, from level 3), Fenborn only"],
    });
  });

  it("flattens a variant and its own traits into one readable list", () => {
    const variants = row(
      contentRows("species", {
        subraces: [
          {
            name: "Fenborn",
            description: "Raised in standing water.",
            ability_score_increases: { str: 1 },
            traits: [{ name: "Hold Breath", description: "Fifteen minutes." }],
          },
          { description: "A variant with no name is skipped." },
        ],
      }),
      "Variants",
    );
    expect(variants).toEqual({
      label: "Variants",
      kind: "traits",
      traits: [
        { name: "Fenborn (STR +1)", description: "Raised in standing water." },
        { name: "Fenborn: Hold Breath", description: "Fifteen minutes." },
      ],
    });
  });

  it("shows a background's proficiencies and what its feature does", () => {
    const rows = contentRows("background", {
      skill_proficiencies: ["Insight", "Religion"],
      feature_name: "Shelter of the Faithful",
      feature_description: "Free healing at a temple.",
    });
    expect(row(rows, "Skills")).toEqual({ label: "Skills", kind: "list", entries: ["Insight", "Religion"] });
    expect(text(rows, "Feature")).toBe("Shelter of the Faithful");
    expect(text(rows, "What the feature does")).toBe("Free healing at a temple.");
  });

  it("shows a class with its hit die and the features an approval copies, by level", () => {
    const rows = contentRows("class", {
      hit_die: 8,
      nested_features: [
        { level: "1", name: "Knack", description: "Once a day." },
        { level: "3", name: "Hex", description: null },
        { level: "5", name: "", description: "Nameless rows are skipped." },
      ],
    });
    expect(text(rows, "Hit die")).toBe("d8");
    expect(row(rows, "Features")).toEqual({
      label: "Features",
      kind: "traits",
      traits: [
        { name: "Level 1: Knack", description: "Once a day." },
        { name: "Level 3: Hex", description: null },
      ],
    });
  });

  it("shows a subclass with its features and the spells it grants", () => {
    const rows = contentRows("subclass", {
      class_name: "Hexer",
      nested_features: [{ level: "3", name: "Mire Step", description: null }],
      nested_spells: [{ level: "3", name: "Mire", description: "Mud." }],
    });
    expect(text(rows, "Subclass of")).toBe("Hexer");
    expect(row(rows, "Features")?.kind).toBe("traits");
    expect(row(rows, "Spells it grants")).toEqual({
      label: "Spells it grants",
      kind: "traits",
      traits: [{ name: "Level 3: Mire", description: "Mud." }],
    });
  });

  it("calls a level 0 spell a cantrip", () => {
    expect(text(contentRows("spell", { level: 0 }), "Level")).toBe("Cantrip");
    expect(text(contentRows("spell", { level: 3 }), "Level")).toBe("Level 3");
    expect(row(contentRows("spell", { level: "3" }), "Level")).toBeUndefined();
  });

  it("shows a feat's prerequisite ahead of its text", () => {
    expect(contentRows("feat", { description: "You hit harder.", prerequisite: "Strength 13" }).map((r) => r.label))
      .toEqual(["Prerequisite", "Description"]);
  });
});

describe("contentName", () => {
  it("is the stored name, which a class or subclass keeps under its own key", () => {
    expect(contentName({ name: "Wisp" })).toBe("Wisp");
    expect(contentName({ class_name: "Hexer" })).toBe("Hexer");
    expect(contentName({ subclass_name: "Bog Witch", class_name: "Hexer" })).toBe("Bog Witch");
  });

  it("is null when the row has no name to give, so the caller decides what to show", () => {
    expect(contentName({ name: "  " })).toBeNull();
    expect(contentName({})).toBeNull();
  });
});
