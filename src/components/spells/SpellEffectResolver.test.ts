import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { Spell } from "@/types/spell.types";
import SpellEffectResolver from "./SpellEffectResolver.vue";

vi.mock("@/composables/useCampaignMessages", () => ({
  useCampaignMessages: () => ({ sendRoll: vi.fn(), sendFlavorMessage: vi.fn() }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ info: vi.fn(), error: vi.fn(), fromError: (error: unknown) => String(error) }),
}));
vi.mock("@/composables/useRuleset", () => ({ useRuleset: () => ({ ruleset: ref("2024") }) }));

const reviewedSpell = {
  name: "Burning Test", level: 1, attack_type: "save", mechanics_reviewed: true,
  effects: [{
    id: "damage", phase: "impact", outcome: "failed_save", target: { type: "creature", count: 2 },
    kind: "damage", dice: "2d6", multiplier: 1, damageType: "fire", condition: null,
    description: null, scaling: null,
  }],
} as Spell;

describe("SpellEffectResolver accessibility and responsive workflow", () => {
  it("exposes a labelled modal and labelled target controls at mobile width", async () => {
    window.innerWidth = 375;
    const wrapper = mount(SpellEffectResolver, {
      props: { spell: reviewedSpell, castLevel: 1, characterLevel: 5 },
      global: { stubs: { Teleport: true } },
    });
    expect(wrapper.get('[role="dialog"]').attributes("aria-modal")).toBe("true");
    expect(wrapper.get('[role="dialog"]').attributes("aria-label")).toBe("Resolve Burning Test");
    expect(wrapper.findAll('input[aria-label^="Target "]')).toHaveLength(2);
    expect(wrapper.findAll('select[aria-label$=" outcome"]')).toHaveLength(2);
    expect(wrapper.get('button[aria-label="Close resolver"]').attributes("type")).toBe("button");
  });

  it("shows unreviewed imports as manual-only without outcome automation", () => {
    const wrapper = mount(SpellEffectResolver, {
      props: { spell: { ...reviewedSpell, mechanics_reviewed: false }, castLevel: 1, characterLevel: 1 },
      global: { stubs: { Teleport: true } },
    });
    expect(wrapper.text()).toContain("Manual resolution required");
    expect(wrapper.find('select[aria-label$=" outcome"]').exists()).toBe(false);
  });
});
