import { mount } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import type { Spell, StructuredSpellEffect } from "@/types/spell.types";
import SpellEffectResolver from "./SpellEffectResolver.vue";

const mocks = vi.hoisted(() => ({ rolls: vi.fn(), sendRoll: vi.fn(), sendFlavor: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("@/composables/campaign/useCampaignMessages", () => ({
  useCampaignMessages: () => ({ sendRoll: mocks.sendRoll, sendFlavorMessage: mocks.sendFlavor }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ info: mocks.info, error: mocks.error, fromError: (error: unknown) => String(error) }),
}));
vi.mock("@/lib/dice/roller", () => ({ rollParsed: (p: { modifier: number }) => { mocks.rolls(); return { total: 10 + p.modifier, breakdown: [] }; } }));
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
    expect(wrapper.text()).toContain("Roll this one by hand");
    expect(wrapper.find('select[aria-label$=" outcome"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe("SpellEffectResolver resolving", () => {
  beforeEach(() => {
    mocks.rolls.mockReset();
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

  it("rolls a two-target save spell once and halves that same roll for the target who saved (PHB 2014 'Damage Rolls')", async () => {
    const fireball = {
      ...reviewedSpell,
      effects: [damageEffect, { ...damageEffect, id: "base-save-half", outcome: "successful_save", multiplier: 0.5 }],
    } as Spell;
    const w = open({ spell: fireball });
    await setOutcome(w, 1, "failed_save");
    await setOutcome(w, 2, "successful_save");
    await resolveButton(w).trigger("click");
    await flushPromises();
    expect(mocks.rolls).toHaveBeenCalledTimes(1);
    const totals = mocks.sendRoll.mock.calls.map((c) => c[0].total);
    expect(totals).toEqual([10, 5]);
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

describe("SpellEffectResolver rays, darts and chosen damage types (#1123)", () => {
  beforeEach(() => {
    mocks.rolls.mockReset();
    mocks.sendRoll.mockReset().mockResolvedValue(undefined);
    mocks.sendFlavor.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });
  function open(spell: Spell, props: Record<string, unknown> = {}) {
    return mount(SpellEffectResolver, {
      props: { spell, castLevel: 2, characterLevel: 5, ...props },
      attachTo: document.body,
      global: { stubs: { Teleport: true, transition: false } },
    });
  }
  type Wrapper = ReturnType<typeof open>;
  const resolveButton = (w: Wrapper) => w.findAll("button").find((b) => b.text().startsWith("Resolv") || b.text().startsWith("Pick a"))!;
  const labels = () => mocks.sendRoll.mock.calls.map((c) => c[0].label as string);

  // PHB 2014 Scorching Ray at 3rd level: four rays; resolved by effectsForCast to count 4.
  const scorching = {
    name: "Scorching Ray", level: 2, attack_type: "ranged_spell", mechanics_reviewed: true,
    effects: [{ ...damageEffect, outcome: "hit", damageType: "fire", dice: "2d6", target: { type: "creature", count: 1 }, instances: { noun: "ray", count: 3 } }],
  } as Spell;
  const missile = {
    name: "Magic Missile", level: 1, attack_type: null, mechanics_reviewed: true,
    effects: [{ ...damageEffect, outcome: "automatic", damageType: "force", dice: "1d4", modifier: 1, instances: { noun: "dart", count: 3 } }],
  } as Spell;
  const orbEffect: StructuredSpellEffect = { ...damageEffect, outcome: "hit", damageType: null, dice: "3d8", target: { type: "creature", count: 1 }, damageTypeChoices: ["acid", "cold", "fire"] };
  const orb = {
    name: "Chromatic Orb", level: 1, attack_type: "ranged_spell", mechanics_reviewed: true,
    effects: [orbEffect],
  } as Spell;

  it("shows one row per ray, labelled with the noun, and no Targets count", () => {
    // Bug: the dialog still asked for a target count and rolled per target, so three rays at one goblin were one row.
    const w = open(scorching);
    expect(w.findAll('input[aria-label$=" target name"]').map((i) => i.attributes("aria-label")))
      .toEqual(["Ray 1 target name", "Ray 2 target name", "Ray 3 target name"]);
    expect(w.findAll('select[aria-label$=" outcome"]')).toHaveLength(3);
    expect(w.text()).not.toContain("Targets");
  });

  it("rolls each ray separately, doubles only the critical ray, and labels ray and target", async () => {
    // Bug: rays aimed at the same creature shared one roll; or a crit doubled every ray.
    const w = open(scorching);
    await w.get('input[aria-label="Ray 2 target name"]').setValue("Goblin");
    await w.get('input[aria-label="Ray 3 target name"]').setValue("Goblin");
    await w.get('select[aria-label="Ray 2 outcome"]').setValue("critical_hit");
    await w.get('select[aria-label="Ray 3 outcome"]').setValue("miss");
    await resolveButton(w).trigger("click");
    await flushPromises();
    expect(mocks.rolls).toHaveBeenCalledTimes(2); // ray 3 missed
    expect(labels()).toEqual(["Scorching Ray · Ray 1: damage (fire)", "Scorching Ray · Ray 2 → Goblin: damage (fire)"]);
    expect(mocks.sendRoll.mock.calls.map((c) => c[0].isCrit)).toEqual([false, true]);
  });

  it("rolls three darts once and posts the same total for each (both editions' Magic Missile)", async () => {
    // Bug: each dart rolled its own damage, though the darts strike simultaneously.
    const w = open(missile);
    expect(w.find('select[aria-label$=" outcome"]').exists()).toBe(false);
    await resolveButton(w).trigger("click");
    await flushPromises();
    expect(mocks.rolls).toHaveBeenCalledTimes(1);
    expect(mocks.sendRoll.mock.calls.map((c) => c[0].total)).toEqual([11, 11, 11]);
    expect(labels()[2]).toBe("Magic Missile · Dart 3: damage (force)");
  });

  it("blocks Resolve until a damage type is picked, then carries the pick into the label", async () => {
    // Bug: Chromatic Orb rolled with a null type, so the chat said "damage" with no element.
    const w = open(orb);
    expect(resolveButton(w).text()).toBe("Pick a damage type");
    expect(resolveButton(w).attributes("disabled")).toBeDefined();
    await resolveButton(w).trigger("click");
    expect(mocks.sendRoll).not.toHaveBeenCalled();
    await w.findAll("button").find((b) => b.text() === "Cold")!.trigger("click");
    expect(resolveButton(w).attributes("disabled")).toBeUndefined();
    await resolveButton(w).trigger("click");
    await flushPromises();
    expect(labels()).toEqual(["Chromatic Orb · Target 1: damage (cold)"]);
  });

  it("uses a select for a long choice list and blocks until it is set", async () => {
    // Bug: more than six types overflowed a segmented row; the select path must also gate Resolve.
    const types = ["a", "b", "c", "d", "e", "f", "g"];
    const w = open({ ...orb, effects: [{ ...orbEffect, damageTypeChoices: types }] } as Spell);
    expect(resolveButton(w).text()).toBe("Pick a damage type");
    await w.get('select[aria-label="Damage type"]').setValue("g");
    expect(resolveButton(w).text()).toBe("Resolve Impact");
  });

  it("lets Transmuted Spell's override win over the picked type", async () => {
    // Bug: the pick replaced the metamagic override in the label.
    const w = open(orb, { damageTypeOverride: "lightning" });
    await w.findAll("button").find((b) => b.text() === "Cold")!.trigger("click");
    await resolveButton(w).trigger("click");
    await flushPromises();
    expect(labels()).toEqual(["Chromatic Orb · Target 1: damage (lightning)"]);
  });

  it("gives a spell opened into an already-mounted dialog its own outcomes, not the empty dialog's", async () => {
    // Bug: the dialog mounts with no spell, so its first row was "automatic"; a save
    // spell opened later kept that row, showed a blank outcome and resolved nothing.
    const w = mount(SpellEffectResolver, {
      props: { spell: null, castLevel: 3, characterLevel: 5 },
      attachTo: document.body,
      global: { stubs: { Teleport: true, transition: false } },
    });
    const fireball = {
      name: "Fireball", level: 3, attack_type: "save", mechanics_reviewed: true,
      effects: [{ ...damageEffect, id: "base", outcome: "failed_save", dice: "8d6", target: { type: "creature", count: 1 } }],
    } as Spell;
    await w.setProps({ spell: fireball });
    expect((w.get('select[aria-label="Target 1 outcome"]').element as HTMLSelectElement).value).toBe("failed_save");
    await resolveButton(w).trigger("click");
    await flushPromises();
    expect(labels()).toEqual(["Fireball · Target 1: damage (fire)"]);
  });

  it("asks once for a save spell's type and shares it with the half branch (Spirit Guardians)", async () => {
    // Bug: the half twin carried its own choice, so the dialog showed two pickers and a
    // successful save rolled separately, in a type the caster never picked.
    const guardianBase: StructuredSpellEffect = {
      ...damageEffect, id: "base", outcome: "failed_save", dice: "3d8", damageType: null,
      target: { type: "creature", count: 2 }, damageTypeChoices: ["radiant", "necrotic"],
    };
    const guardians = {
      name: "Spirit Guardians", level: 3, attack_type: "save", mechanics_reviewed: true,
      effects: [guardianBase, { ...guardianBase, id: "base-save-half", outcome: "successful_save", multiplier: 0.5 }],
    } as Spell;
    const w = open(guardians, { castLevel: 3 });
    expect(w.findAll("p").filter((p) => p.text() === "Damage type")).toHaveLength(1);
    await w.findAll("button").find((b) => b.text() === "Necrotic")!.trigger("click");
    await w.get('select[aria-label="Target 2 outcome"]').setValue("successful_save");
    await resolveButton(w).trigger("click");
    await flushPromises();
    expect(mocks.rolls).toHaveBeenCalledTimes(1);
    expect(labels()).toEqual([
      "Spirit Guardians · Target 1: damage (necrotic)",
      "Spirit Guardians · Target 2: damage (necrotic) · successful save, half",
    ]);
    expect(mocks.sendRoll.mock.calls.map((c) => c[0].total)).toEqual([10, 5]);
  });
});
