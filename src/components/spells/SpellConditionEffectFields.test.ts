import { describe, it, expect } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import SpellConditionEffectFields from "./SpellConditionEffectFields.vue";
import type { SpellConditionEffect } from "@/types/spell.types";

const HOLD_PERSON_TEXT =
  "Choose a humanoid that you can see within range. The target must succeed on a Wisdom saving throw or be paralyzed for the duration. " +
  "At the end of each of its turns, the target can make another Wisdom saving throw.";

type Props = { saveAbility: string; concentration: boolean; description: string; higherLevels: string };
const spell: Props = { saveAbility: "WIS", concentration: true, description: HOLD_PERSON_TEXT, higherLevels: "" };

/** Mounts the form like its parent does: every emitted entry comes back in as the model. */
function mountForm(initial: SpellConditionEffect | null = null, props: Partial<Props> = {}) {
  let current = initial;
  const wrapper: VueWrapper = mount(SpellConditionEffectFields, {
    props: {
      ...spell, ...props, modelValue: initial,
      "onUpdate:modelValue": (v: SpellConditionEffect | null) => { current = v; void wrapper.setProps({ modelValue: v }); },
    },
  });
  return { wrapper, entry: () => current };
}

const click = async (w: VueWrapper, label: string) => {
  const b = w.findAll("button").find((x) => x.text() === label);
  if (!b) throw new Error(`no button "${label}"`);
  await b.trigger("click");
};
const tick = async (w: VueWrapper, label: string, on = true) => {
  const l = w.findAll("label").find((x) => x.text().startsWith(label));
  if (!l) throw new Error(`no checkbox "${label}"`);
  await l.find("input").setValue(on);
};
const choose = (w: VueWrapper, index: number, value: string) => w.findAll("select")[index].setValue(value);

describe("SpellConditionEffectFields", () => {
  // Bug caught: a homebrew Hold Person that saves an entry the fight cannot use (a missing save ability, concentration
  // left false, a repeat save without its ability), so it spends the slot and imposes nothing.
  it("builds exactly the entry a fight expects from the plain-word choices", async () => {
    const { wrapper, entry } = mountForm();
    await choose(wrapper, 0, "condition");
    await tick(wrapper, "Paralyzed");
    await click(wrapper, "On a failed save");
    await click(wrapper, "One creature");
    await click(wrapper, "Minutes");
    await tick(wrapper, "They save again");
    expect(entry()).toEqual({
      verdict: "condition", conditions: ["Paralyzed"], stops_casting: null, speed_zero: false,
      applies: "failed_save", save_ability: "WIS",
      targets: { kind: "one", count: 1, more_per_slot_above: 0 },
      only_kinds: [],
      duration: { unit: "minute", amount: 1, concentration: true },
      repeat_save: { when: "end_of_its_turn", ability: "WIS" },
      leaves_play: false, ends_when_harmed: null, break_free: null, must_flee: false,
    });
  });

  // Bug caught: a second place to pick the save, or concentration asked of the DM, so entry and spell can disagree.
  it("takes the save ability and concentration from the spell, and follows them when they change", async () => {
    const { wrapper, entry } = mountForm();
    await choose(wrapper, 0, "condition");
    await click(wrapper, "On a failed save");
    await click(wrapper, "Rounds");
    expect(entry()).toMatchObject({ save_ability: "WIS", duration: { unit: "round", concentration: true } });
    await wrapper.setProps({ saveAbility: "CON", concentration: false });
    expect(entry()).toMatchObject({ save_ability: "CON", duration: { concentration: false } });
    expect(wrapper.text()).not.toContain("concentration?");
  });

  // Bug caught: a failed-save condition with no save to fail, left unexplained.
  it("says so when a failed save has no saving throw set on the spell", async () => {
    const { wrapper } = mountForm(null, { saveAbility: "" });
    await choose(wrapper, 0, "condition");
    await click(wrapper, "On a failed save");
    expect(wrapper.text()).toContain("Set the saving throw above");
  });

  // Bug caught: switching to "does nothing" leaving a stale condition list in the saved entry.
  it("clears every condition field when switched back to does nothing", async () => {
    const { wrapper, entry } = mountForm();
    await choose(wrapper, 0, "condition");
    await tick(wrapper, "Stunned");
    await click(wrapper, "Several creatures");
    await tick(wrapper, "They break free with an ability check");
    await choose(wrapper, 0, "no_condition");
    expect(entry()).toEqual({
      verdict: "no_condition", conditions: [], stops_casting: null, speed_zero: false, applies: null, save_ability: null,
      targets: null, only_kinds: [], duration: null, repeat_save: null,
    });
    expect(wrapper.text()).not.toContain("Conditions");
    await choose(wrapper, 0, "");
    expect(entry()).toBeNull();
  });

  // Bug caught: "several" saved with a count of 0 or 1, which a fight refuses.
  it("will not emit a count below 2 for several creatures", async () => {
    const { wrapper, entry } = mountForm();
    await choose(wrapper, 0, "condition");
    await click(wrapper, "Several creatures");
    await wrapper.find('input[aria-label="How many creatures"]').setValue("1");
    expect(entry()?.targets).toEqual({ kind: "several", count: 2, more_per_slot_above: 0 });
    await wrapper.find('input[aria-label="How many creatures"]').setValue("4");
    expect(entry()?.targets).toEqual({ kind: "several", count: 4, more_per_slot_above: 0 });
  });

  // Bug caught: a break-free check that could be saved with no ability to make it with.
  it("keeps at least one ability ticked for breaking free", async () => {
    const { wrapper, entry } = mountForm();
    await choose(wrapper, 0, "condition");
    await tick(wrapper, "They break free with an ability check");
    await tick(wrapper, "Strength", false);
    expect(entry()?.break_free).toEqual({ abilities: ["STR"], skill: null });
    await tick(wrapper, "Dexterity");
    expect(entry()?.break_free).toEqual({ abilities: ["STR", "DEX"], skill: null });
  });

  // Bug caught: advice swallowed (a DM never learns their entry claims a condition the text never names), or turned into a block.
  it("lists a finding when the entry claims Stunned and the text never says it, without refusing the entry", async () => {
    const { wrapper, entry } = mountForm();
    await choose(wrapper, 0, "condition");
    await tick(wrapper, "Stunned");
    expect(wrapper.text()).toContain("Check against the spell's text");
    expect(wrapper.text()).toContain("The description never says Stunned.");
    // Bug caught (seen in the running editor): the check's field names on a Dungeon Master's screen.
    expect(wrapper.text()).toContain("Say who it reaches.");
    expect(wrapper.text()).not.toContain("is missing");
    expect(entry()?.conditions).toEqual(["Stunned"]);
  });

  // Bug caught: the evidence finding, which the form has no field for, shown on a faithful entry.
  it("shows no check on a faithful reading", async () => {
    const { wrapper } = mountForm();
    await choose(wrapper, 0, "condition");
    await tick(wrapper, "Paralyzed");
    await click(wrapper, "On a failed save");
    await click(wrapper, "One creature");
    await click(wrapper, "Minutes");
    expect(wrapper.text()).not.toContain("Check against the spell's text");
  });

  // Bug caught: the DM-facing words replaced by code words.
  it("shows the summary sentence and never a code word", async () => {
    const { wrapper } = mountForm();
    await choose(wrapper, 0, "condition");
    await tick(wrapper, "Paralyzed");
    await click(wrapper, "On a failed save");
    await click(wrapper, "One creature");
    await click(wrapper, "Minutes");
    expect(wrapper.text()).toContain("Paralyzed on a failed Wisdom save, one creature, up to 1 minute (concentration).");
    for (const code of ["verdict", "no_condition", "failed_save", "not_simple"]) expect(wrapper.text()).not.toContain(code);
  });
});
