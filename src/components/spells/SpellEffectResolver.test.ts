import { mount } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  // #746 moved the dialog shell onto `AppModal`, which names the panel via
  // `ModalHeader`'s `aria-labelledby` (a real heading, read once) rather than a
  // hand-rolled `aria-label` string, and routes Escape through the shared
  // hotkey registry — a real `document`-level listener, so the wrapper has to
  // be attached there for the dispatch below to reach it.
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("exposes a labelled modal and labelled target controls at mobile width", async () => {
    window.innerWidth = 375;
    const wrapper = mount(SpellEffectResolver, {
      props: { spell: reviewedSpell, castLevel: 1, characterLevel: 5 },
      attachTo: document.body,
      global: { stubs: { Teleport: true, transition: false } },
    });
    await nextTick();
    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.attributes("aria-modal")).toBe("true");
    const headingId = dialog.attributes("aria-labelledby");
    expect(headingId).toBeTruthy();
    expect(wrapper.get(`#${headingId}`).text()).toBe("Resolve Burning Test");
    expect(wrapper.findAll('input[aria-label^="Target "]')).toHaveLength(2);
    expect(wrapper.findAll('select[aria-label$=" outcome"]')).toHaveLength(2);
    expect(wrapper.get('button[aria-label="Close"]').attributes("type")).toBe("button");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("shows unreviewed imports as manual-only without outcome automation", () => {
    const wrapper = mount(SpellEffectResolver, {
      props: { spell: { ...reviewedSpell, mechanics_reviewed: false }, castLevel: 1, characterLevel: 1 },
      attachTo: document.body,
      global: { stubs: { Teleport: true, transition: false } },
    });
    expect(wrapper.text()).toContain("Manual resolution required");
    expect(wrapper.find('select[aria-label$=" outcome"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
