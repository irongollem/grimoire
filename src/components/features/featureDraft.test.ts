import { describe, expect, it } from "vitest";
import type { ClassFeature } from "@/types/feature.types";
import { checkDraft, contentChanged, contentColumns, draftFromFeature, emptyDraft } from "./featureDraft";

const uses = { key: "ember", label: "Ember", amount: { kind: "fixed", value: 2 }, recharge: "long", pool: false } as const;

function feature(over: Partial<ClassFeature> = {}): ClassFeature {
  return {
    id: "f1", user_id: "u1", campaign_id: null, name: "Ember Step", description: null, kind: "feature",
    feat_category: null, prerequisites: null, repeatable: false, ability_increase: null, mechanics: {},
    source: null, prerequisite: null, tags: [], open5e_import: false, created_at: "", updated_at: "", ...over,
  };
}

describe("draftFromFeature", () => {
  it("round-trips an untouched row to an unchanged save", () => {
    const row = feature({ mechanics: { activation: "action", uses } });
    const draft = draftFromFeature(row);
    const check = checkDraft(draft, "feature");
    expect(check.mechanicsErrors).toEqual([]);
    expect(contentChanged(row, contentColumns(draft, check, "feature"))).toBe(false);
  });

  it("drops unreadable stored mechanics instead of carrying them", () => {
    expect(draftFromFeature(feature({ mechanics: { activation: "flying" } as never })).mechanics).toEqual({});
  });
});

describe("checkDraft", () => {
  it("reports an incomplete part and does not call the draft valid", () => {
    const draft = emptyDraft("all");
    draft.mechanics = { uses: { ...uses, key: "" } };
    expect(checkDraft(draft, "feature").mechanicsErrors.length).toBeGreaterThan(0);
  });

  it("checks the feat fields only for a feat", () => {
    const draft = emptyDraft("all");
    draft.feat.prerequisites = {};
    expect(checkDraft(draft, "feature").featErrors).toEqual([]);
    expect(checkDraft(draft, "feat").featErrors).toHaveLength(1);
  });

  it("clears feat columns on an ability", () => {
    const draft = emptyDraft("all");
    draft.feat = { feat_category: "origin", prerequisites: null, repeatable: true, ability_increase: null };
    const columns = contentColumns(draft, checkDraft(draft, "feature"), "feature");
    expect(columns).toMatchObject({ kind: "feature", feat_category: null, repeatable: false });
  });
});

describe("contentChanged", () => {
  it("counts a mechanics edit as authoring and ignores tags", () => {
    const row = feature();
    const draft = draftFromFeature(row);
    draft.tags = ["fire"];
    expect(contentChanged(row, contentColumns(draft, checkDraft(draft, "feature"), "feature"))).toBe(false);
    draft.mechanics = { activation: "reaction" };
    expect(contentChanged(row, contentColumns(draft, checkDraft(draft, "feature"), "feature"))).toBe(true);
  });
});
