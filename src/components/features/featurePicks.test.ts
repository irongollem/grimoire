import { describe, expect, it } from "vitest";
import type { FeatureMechanics } from "@/rules/features/mechanics.types";
import { grantsPick, pickIdsOf, picksFor, spellPickIdsOf } from "./featurePicks";

const UUID = "11111111-2222-3333-4444-555555555555";
const spellChoice = { key: "mi_spell", label: "Spell", pick: { kind: "spell" as const, lists: ["Wizard"], level: 1, free_cast: true }, count: { kind: "per_grant" as const, amount: 1 }, replace_on_level_up: false };
const featChoice = { key: "asi_feat", label: "Feat", pick: { kind: "feat" as const }, count: { kind: "per_grant" as const, amount: 1 }, replace_on_level_up: false };
const mechanics = { choices: [spellChoice, featChoice] } as unknown as FeatureMechanics;
const names = {
  feature: (id: string) => (id === UUID ? "Alert" : null),
  spell: (id: string) => ({ srd_srd_shield: "Shield", [UUID]: "Homebrew Bolt" })[id] ?? null,
};

describe("picksFor", () => {
  it("resolves a spell pick through spell names, a homebrew UUID included, and a feat pick through feature names", () => {
    const picks = picksFor(mechanics, { mi_spell: ["srd_srd_shield", UUID], asi_feat: [UUID] }, names);
    expect(picks).toEqual([
      { key: "mi_spell", label: "Spell", values: ["Shield", "Homebrew Bolt"] },
      { key: "asi_feat", label: "Feat", values: ["Alert"] },
    ]);
  });

  it("leaves out a value that has not resolved", () => {
    expect(picksFor(mechanics, { mi_spell: ["unknown_spell"] }, names)).toEqual([]);
  });
});

describe("pick ids", () => {
  const choices = { mi_spell: ["srd_srd_shield", UUID], asi_feat: [UUID] };
  it("keeps spell ids out of the feature lookup and feature ids out of the spell one", () => {
    expect(pickIdsOf([mechanics], choices)).toEqual([UUID]);
    expect(spellPickIdsOf([mechanics], choices)).toEqual(["srd_srd_shield", UUID]);
  });
});

describe("grantsPick", () => {
  it("lists skills by label, then tools and languages", () => {
    const m = { grants: { skills: ["arcana", "sleight_of_hand"], tools: ["Thieves' Tools"], languages: ["Draconic"] } } as unknown as FeatureMechanics;
    expect(grantsPick(m)).toEqual({ key: "grants", label: "Proficiency", values: ["Arcana", "Sleight of Hand", "Thieves' Tools", "Draconic"] });
  });

  it("shows nothing for a feature that grants nothing", () => {
    expect(grantsPick({} as FeatureMechanics)).toBeNull();
    expect(grantsPick({ grants: {} } as FeatureMechanics)).toBeNull();
  });
});
