import { describe, it, expect } from "vitest";
import {
  buildRuleRow,
  buildRulesetRow,
  editionForDocument,
  licenseForDocument,
  slugifyName,
  type Open5eV2Rule,
  type Open5eV2Ruleset,
} from "./rulesMapping";

describe("slugifyName", () => {
  it("lowercases and collapses non-alphanumerics to underscores", () => {
    expect(slugifyName("Ability Scores and Modifiers")).toBe("ability_scores_and_modifiers");
  });
  it("trims leading/trailing underscores", () => {
    expect(slugifyName("  D20 Tests!  ")).toBe("d20_tests");
  });
  it("handles apostrophes and punctuation", () => {
    expect(slugifyName("The Bonus Doesn't Stack")).toBe("the_bonus_doesn_t_stack");
  });
});

describe("editionForDocument", () => {
  it("maps srd-2014 -> 2014 and srd-2024 -> 2024", () => {
    expect(editionForDocument("srd-2014")).toBe("2014");
    expect(editionForDocument("srd-2024")).toBe("2024");
  });
  it("throws on an unrecognized document key rather than silently defaulting", () => {
    expect(() => editionForDocument("srd-2014e")).toThrow(/unexpected Open5e document key/);
  });
});

describe("licenseForDocument", () => {
  it("2014 SRD is OGL + CC-BY-4.0", () => {
    expect(licenseForDocument("srd-2014")).toBe("cc-by-40, ogl-10a");
  });
  it("2024 SRD is CC-BY-4.0 only (no OGL)", () => {
    expect(licenseForDocument("srd-2024")).toBe("cc-by-40");
  });
  it("throws on an unrecognized document key", () => {
    expect(() => licenseForDocument("phb-2024")).toThrow(/unexpected Open5e document key/);
  });
});

describe("buildRulesetRow", () => {
  const ruleset: Open5eV2Ruleset = {
    key: "srd-2024_combat",
    name: "Combat",
    desc: "Adventurers encounter many dangerous monsters…",
    document: { key: "srd-2024" },
  };

  it("becomes a top-level row keyed by its own Open5e key", () => {
    const row = buildRulesetRow(ruleset);
    expect(row.slug).toBe("srd-2024_combat");
    expect(row.parent_slug).toBeNull();
    expect(row.ruleset).toBe("2024");
    expect(row.doc_slug).toBe("srd-2024");
    expect(row.conceptual_key).toBe("combat");
    expect(row.source_document_key).toBe("srd-2024");
    expect(row.source_record_key).toBe("srd-2024_combat");
    expect(row.source_license).toBe("cc-by-40");
    expect(row.content).toBe(ruleset.desc);
  });

  it("preserves an empty desc rather than substituting a placeholder", () => {
    const row = buildRulesetRow({ ...ruleset, desc: "" });
    expect(row.content).toBe("");
  });
});

describe("buildRuleRow", () => {
  const rule: Open5eV2Rule = {
    key: "srd_abilities_ability-scores-and-modifiers",
    name: "Ability Scores and Modifiers",
    desc: "Each of a creature's abilities has a score…",
    document: "srd-2014",
    ruleset: "srd_abilities",
    index: 1,
  };

  it("nests under its parent ruleset via parent_slug", () => {
    const row = buildRuleRow(rule);
    expect(row.slug).toBe("srd_abilities_ability-scores-and-modifiers");
    expect(row.parent_slug).toBe("srd_abilities");
    expect(row.ruleset).toBe("2014");
    expect(row.doc_slug).toBe("srd-2014");
    expect(row.conceptual_key).toBe("ability_scores_and_modifiers");
    expect(row.source_document_key).toBe("srd-2014");
    expect(row.source_record_key).toBe("srd_abilities_ability-scores-and-modifiers");
    expect(row.source_license).toBe("cc-by-40, ogl-10a");
    expect(row.provenance).toMatchObject({ source: "open5e", api_version: "v2", endpoint: "rules", index: 1 });
  });

  it("produces a distinct slug per edition even for same-named rules/rulesets", () => {
    const row2014 = buildRulesetRow({ key: "srd_combat", name: "Combat", desc: "", document: { key: "srd-2014" } });
    const row2024 = buildRulesetRow({ key: "srd-2024_combat", name: "Combat", desc: "", document: { key: "srd-2024" } });
    expect(row2014.slug).not.toBe(row2024.slug);
    expect(row2014.conceptual_key).toBe(row2024.conceptual_key); // same concept, both editions
    expect(row2014.ruleset).not.toBe(row2024.ruleset);
  });
});
