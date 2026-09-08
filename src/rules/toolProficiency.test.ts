import { describe, it, expect } from "vitest";
import { canonicalToolName, hasToolProficiency } from "@/rules/toolProficiency";

describe("canonicalToolName", () => {
  it("passes through already-canonical values unchanged", () => {
    expect(canonicalToolName("Forgery Kit")).toBe("Forgery Kit");
    expect(canonicalToolName("Disguise Kit")).toBe("Disguise Kit");
    expect(canonicalToolName("Smith's Tools")).toBe("Smith's Tools");
  });

  it("fixes case variants to the catalogue's own casing", () => {
    expect(canonicalToolName("Alchemist's supplies")).toBe("Alchemist's Supplies");
    expect(canonicalToolName("Leatherworker's tools")).toBe("Leatherworker's Tools");
    expect(canonicalToolName("Woodcarver's tools")).toBe("Woodcarver's Tools");
    expect(canonicalToolName("Navigator's tools")).toBe("Navigator's Tools");
    expect(canonicalToolName("thieves' tools")).toBe("Thieves' Tools");
    expect(canonicalToolName("herbalism kit")).toBe("Herbalism Kit");
    expect(canonicalToolName("Herbalism kit")).toBe("Herbalism Kit");
  });

  it("resolves the 'Herbalist kit' alias to the catalogue's 'Herbalism Kit'", () => {
    expect(canonicalToolName("Herbalist kit")).toBe("Herbalism Kit");
  });

  it("strips a leading 'or ' and trailing '.' left over from splitting benefit prose", () => {
    expect(canonicalToolName("or Disguise Kit.")).toBe("Disguise Kit");
  });

  it("normalises a curly apostrophe to straight before matching the catalogue", () => {
    // Open5e prose uses U+2019; the catalogue and every alias key use the
    // straight apostrophe. Every other fixture here is already straight, so
    // this is the case that proves the normalisation step actually runs.
    expect(canonicalToolName("Thieves’ Tools")).toBe("Thieves' Tools");
  });

  it("returns null for prose that names no proficiency at all", () => {
    expect(canonicalToolName("No additional tool proficiencies")).toBeNull();
    expect(canonicalToolName("One type of gaming set")).toBeNull();
    expect(canonicalToolName("Two of your choice")).toBeNull();
    expect(canonicalToolName("One artisan's tools set of your choice")).toBeNull();
    expect(canonicalToolName("One type of artisan's tools or one type of musical instrument")).toBeNull();
    expect(canonicalToolName("one musical instrument")).toBeNull();
    expect(canonicalToolName("One type of musical instrument")).toBeNull();
    // Names a real tool, but only offers it — granting Thieves' Tools outright
    // would invent a proficiency the character may never have picked.
    expect(canonicalToolName("Your choice of one from Thieves’ Tools")).toBeNull();
  });

  it("keeps non-tool proficiencies stored in the same column, cleaned but unaltered", () => {
    expect(canonicalToolName("Light Armor")).toBe("Light Armor");
    expect(canonicalToolName("Shields")).toBe("Shields");
    expect(canonicalToolName("Martial Weapons")).toBe("Martial Weapons");
  });

  it("returns an unrecognised-but-plausible value cleaned, never dropped or coerced to empty", () => {
    expect(canonicalToolName("Glassblower's Kit (Homebrew)")).toBe("Glassblower's Kit (Homebrew)");
  });

  it("returns null for blank input", () => {
    expect(canonicalToolName("")).toBeNull();
    expect(canonicalToolName("   ")).toBeNull();
  });
});

describe("hasToolProficiency", () => {
  it("matches when a dirty stored value canonicalises to the same tool as a clean requirement", () => {
    expect(hasToolProficiency(["Herbalist kit"], ["Herbalism Kit"])).toBe(true);
    expect(hasToolProficiency(["Forgery kit"], ["Forgery Kit"])).toBe(true);
  });

  it("matches when either side is stored in unusual casing", () => {
    expect(hasToolProficiency(["smith's tools"], ["Smith's Tools"])).toBe(true);
  });

  it("returns true if any of several accepted tools is owned", () => {
    expect(
      hasToolProficiency(["Cobbler's Tools"], ["Leatherworker's Tools", "Cobbler's Tools"]),
    ).toBe(true);
  });

  it("returns false when nothing matches", () => {
    expect(hasToolProficiency(["Smith's Tools"], ["Herbalism Kit"])).toBe(false);
  });

  it("ignores non-proficiency prose mixed into the stored list", () => {
    expect(
      hasToolProficiency(["No additional tool proficiencies", "Herbalism Kit"], ["Herbalism Kit"]),
    ).toBe(true);
  });

  it("handles null/undefined stored proficiencies as no match", () => {
    expect(hasToolProficiency(null, ["Herbalism Kit"])).toBe(false);
    expect(hasToolProficiency(undefined, ["Herbalism Kit"])).toBe(false);
  });

  it("handles an empty stored list as no match", () => {
    expect(hasToolProficiency([], ["Herbalism Kit"])).toBe(false);
  });
});
