import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import CharacterFeatureCard from "@/components/features/CharacterFeatureCard.vue";
import type { GrantedFeature, ResourcePool } from "@/rules/features/characterFeatures";
import type { ClassFeature } from "@/types/feature.types";
import type { FeatureMechanics } from "@/rules/features/mechanics.types";

function feature(name: string, mechanics: FeatureMechanics, description: string | null = null): ClassFeature {
  return {
    id: `id-${name}`, user_id: null, campaign_id: null, name, description,
    repeatable: false, ability_increase: null, mechanics, source: null, prerequisite: null,
    tags: [], open5e_import: false, created_at: "", updated_at: "",
  } as unknown as ClassFeature;
}

function classGrant(levelsGained: number[]): GrantedFeature["grant"] {
  return { kind: "class", className: "Monk", subclassName: null, classLevel: 8, levelsGained };
}

const kiPool: ResourcePool = {
  key: "ki", label: "Ki", max: 8, recharge: "short", shortRestRegain: null, pool: true, sources: ["Ki"],
};

function mountCard(granted: GrantedFeature, pools: ResourcePool[] = []) {
  return mount(CharacterFeatureCard, {
    props: { granted, pools, remaining: () => 5 },
    global: { stubs: { RichTextViewer: true } },
  });
}

describe("CharacterFeatureCard", () => {
  it("shows the scaling value in the title", () => {
    const mechanics: FeatureMechanics = { scaling: { label: "Sneak Attack", values: { "1": "1d6" } } };
    const w = mountCard({ feature: feature("Sneak Attack", mechanics), mechanics, grant: classGrant([1]), scalingValue: "3d6" });
    expect(w.text()).toContain("Sneak Attack · 3d6");
  });

  it("shows the activation badge and a single level", () => {
    const mechanics: FeatureMechanics = { activation: "bonus_action" };
    const w = mountCard({ feature: feature("Flurry", mechanics), mechanics, grant: classGrant([2]), scalingValue: null });
    expect(w.text()).toContain("Bonus Action");
    expect(w.text()).toContain("Level 2");
  });

  it("lists every level an ability score improvement is gained", () => {
    const mechanics: FeatureMechanics = {};
    const w = mountCard({ feature: feature("Ability Score Improvement", mechanics), mechanics, grant: classGrant([4, 8]), scalingValue: null });
    expect(w.text()).toContain("Levels 4, 8");
  });

  it("names what the feature spends from the pool label", () => {
    const mechanics: FeatureMechanics = { spends: { key: "ki", amount: 1 } };
    const w = mountCard({ feature: feature("Stunning Strike", mechanics), mechanics, grant: classGrant([5]), scalingValue: null }, [kiPool]);
    expect(w.text()).toContain("Spends 1 Ki");
  });

  it("still shows a feature that has no text and no mechanics", () => {
    const mechanics: FeatureMechanics = {};
    const w = mountCard({ feature: feature("Unarmored Movement", mechanics), mechanics, grant: classGrant([2]), scalingValue: null });
    expect(w.text()).toContain("Unarmored Movement");
  });

  it("labels an origin feat", () => {
    const mechanics: FeatureMechanics = {};
    const w = mountCard({
      feature: { ...feature("Alert", mechanics), kind: "feat", feat_category: "origin" },
      mechanics, grant: { kind: "feat", via: "origin", atLevel: null }, scalingValue: null,
    });
    expect(w.text()).toContain("Origin feat");
  });

  it("names an origin feat with the variant its background chose", () => {
    const mechanics: FeatureMechanics = {};
    const w = mount(CharacterFeatureCard, {
      props: {
        granted: {
          feature: { ...feature("Magic Initiate", mechanics), kind: "feat", feat_category: "origin" },
          mechanics, grant: { kind: "feat", via: "origin", atLevel: null }, scalingValue: null,
        },
        pools: [],
        remaining: () => null,
        variant: "Wizard",
      },
    });
    expect(w.text()).toContain("Magic Initiate (Wizard)");
  });
});
