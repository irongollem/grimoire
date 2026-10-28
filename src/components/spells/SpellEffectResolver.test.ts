import { mount } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import type { Spell, StructuredSpellEffect } from "@/types/spell.types";
import SpellEffectResolver from "./SpellEffectResolver.vue";

const mocks = vi.hoisted(() => ({ sendRoll: vi.fn(), sendFlavor: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("@/composables/campaign/useCampaignMessages", () => ({
  useCampaignMessages: () => ({ sendRoll: mocks.sendRoll, sendFlavorMessage: mocks.sendFlavor }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ info: mocks.info, error: mocks.error, fromError: (error: unknown) => String(error) }),
}));
vi.mock("@/lib/dice/roller", () => ({ rollParsed: (p: { modifier: number }) => ({ total: 10 + p.modifier, breakdown: [] }) }));
vi.mock("@/composables/rules/useRuleset", () => ({ useRuleset: () => ({ ruleset: ref("2024") }) }));

const damageEffect: StructuredSpellEffect = {
  id: "damage", phase: "impact", outcome: "failed_save", target: { type: "creature", count: 2 },
  kind: "damage", dice: "2d6", multiplier: 1, damageType: "fire", condition: null,
  description: null, scaling: null,
};
const reviewedSpell = {
  name: "Burning Test", level: 1, attack_type: "save", mechanics_reviewed: true,
  effects: [damageEffect],
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

describe("SpellEffectResolver resolving", () => {
  beforeEach(() => {
    mocks.sendRoll.mockReset().mockResolvedValue(undefined);
    mocks.sendFlavor.mockReset().mockResolvedValue(undefined);
    mocks.info.mockReset();
    mocks.error.mockReset();
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function open(props: Partial<InstanceType<typeof SpellEffectResolver>["$props"]> = {}) {
    return mount(SpellEffectResolver, {
      props: { spell: reviewedSpell, castLevel: 1, characterLevel: 5, ...props },
      attachTo: document.body,
      global: { stubs: { Teleport: true, transition: false } },
    });
  }
  const resolveButton = (w: ReturnType<typeof open>) => w.findAll("button").find((b) => b.text().startsWith("Resolv"))!;
  const setOutcome = async (w: ReturnType<typeof open>, target: number, outcome: string) => {
    await w.get(`select[aria-label="Target ${target} outcome"]`).setValue(outcome);
  };

  it("rolls the effect only for the targets whose outcome it applies to", async () => {
    // The 2d6 fire damage is the failed-save outcome: the target who saved takes none of it.
    const w = open();
    await setOutcome(w, 2, "successful_save");
    await resolveButton(w).trigger("click");
    await flushPromises();
    expect(mocks.sendRoll).toHaveBeenCalledTimes(1);
    expect(mocks.sendRoll.mock.calls[0][0]).toMatchObject({ total: 10, isDamage: true });
    expect(mocks.sendRoll.mock.calls[0][0].label).toContain("Target 1");
    expect(mocks.sendRoll.mock.calls[0][0].label).toContain("(fire)");
  });

  it("names a target by the trimmed name typed, and falls back to Target N when blank", async () => {
    const w = open();
    await w.get('input[aria-label="Target 1 name"]').setValue("  Goblin  ");
    await w.get('input[aria-label="Target 2 name"]').setValue("   ");
    await resolveButton(w).trigger("click");
    await flushPromises();
    const labels = mocks.sendRoll.mock.calls.map((c) => c[0].label as string);
    expect(labels.some((l) => l.includes("· Goblin:"))).toBe(true);
    expect(labels.some((l) => l.includes("· Target 2:"))).toBe(true);
  });

  it("says so, and rolls nothing, when no chosen outcome triggers an effect", async () => {
    const w = open();
    await setOutcome(w, 1, "successful_save");
    await setOutcome(w, 2, "successful_save");
    await resolveButton(w).trigger("click");
    await flushPromises();
    expect(mocks.sendRoll).not.toHaveBeenCalled();
    expect(mocks.info).toHaveBeenCalled();
  });

  it("Careful Spell protects at most the casting modifier in creatures (minimum one) and rolls nothing beyond that", async () => {
    // PHB 2014 "Careful Spell": up to a number of creatures equal to your Charisma modifier (minimum of one).
    const w = open({ metamagicNames: ["Careful Spell"], spellcastingModifier: 1 });
    await setOutcome(w, 1, "careful_save");
    await setOutcome(w, 2, "careful_save");
    await resolveButton(w).trigger("click");
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledWith("Careful Spell can protect at most 1 target.");
    expect(mocks.sendRoll).not.toHaveBeenCalled();
  });

  it("allows Careful Spell on as many targets as the modifier allows", async () => {
    const w = open({ metamagicNames: ["Careful Spell"], spellcastingModifier: 2 });
    await setOutcome(w, 1, "careful_save");
    await setOutcome(w, 2, "careful_save");
    await resolveButton(w).trigger("click");
    await flushPromises();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("Careful Spell still protects one creature when the casting modifier is zero or negative", async () => {
    const w = open({ metamagicNames: ["Careful Spell"], spellcastingModifier: 0 });
    await setOutcome(w, 1, "careful_save");
    await resolveButton(w).trigger("click");
    await flushPromises();
    expect(mocks.error).not.toHaveBeenCalled();
    await setOutcome(w, 2, "careful_save");
    await resolveButton(w).trigger("click");
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledWith("Careful Spell can protect at most 1 target.");
  });

  it("halves a half-damage effect for the target who saved", async () => {
    // PHB 2014 "Saving Throws": many damage spells deal half damage on a successful save.
    const halfSpell = {
      ...reviewedSpell,
      effects: [{ ...damageEffect, id: "half", outcome: "successful_save", multiplier: 0.5 }],
    } as Spell;
    const w = open({ spell: halfSpell });
    await setOutcome(w, 1, "successful_save");
    await setOutcome(w, 2, "failed_save");
    await resolveButton(w).trigger("click");
    await flushPromises();
    expect(mocks.sendRoll).toHaveBeenCalledTimes(1);
    expect(mocks.sendRoll.mock.calls[0][0].total).toBe(5);
    expect(mocks.sendRoll.mock.calls[0][0].label).toContain("successful save, half");
  });

  it("flags the roll as a critical only for a critical hit", async () => {
    const attack = {
      ...reviewedSpell, attack_type: "ranged_spell",
      effects: [{ ...damageEffect, outcome: "hit" }, { ...damageEffect, id: "crit", outcome: "critical_hit" }],
    } as Spell;
    const w = open({ spell: attack });
    await setOutcome(w, 1, "critical_hit");
    await setOutcome(w, 2, "hit");
    await resolveButton(w).trigger("click");
    await flushPromises();
    const crits = mocks.sendRoll.mock.calls.map((c) => [c[0].label.includes("Target 1"), c[0].isCrit]);
    expect(crits).toContainEqual([true, true]);
    expect(crits).toContainEqual([false, false]);
  });

  it("ignores a second click while the first resolution is still sending", async () => {
    let release: () => void = () => undefined;
    mocks.sendRoll.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
    const w = open({ spell: { ...reviewedSpell, effects: [damageEffect] } as Spell });
    await w.get('input[aria-label="Target 2 name"]').setValue("x");
    await setOutcome(w, 2, "successful_save");
    await resolveButton(w).trigger("click");
    await resolveButton(w).trigger("click");
    release();
    await flushPromises();
    expect(mocks.sendRoll).toHaveBeenCalledTimes(1);
  });
});
