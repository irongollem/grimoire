// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { parseMechanics } from "@/rules/features/mechanics";
import type { DueChoice, OptionContext } from "@/rules/features/levelUpChoices";
import type { FeatureChoice } from "@/rules/features/mechanics.types";
import ChoicePicker from "./ChoicePicker.vue";
import { initialChoiceValue, type ChoiceValue } from "./choiceValue";

const context: Omit<OptionContext, "existing"> = {
  ruleset: "2014",
  className: "Warlock",
  classLevel: 5,
  characterLevel: 5,
  abilityScores: { str: 10, dex: 14, con: 14, int: 10, wis: 12, cha: 16 },
  skills: {},
  canCastSpells: true,
  armorProficiencies: new Set(),
  hasFightingStyleFeature: false,
  takenFeatIds: [],
  feats: [],
  metamagic: [],
  wildShapeForms: [],
  masteryWeapons: [],
  spells: [],
  spellListVariant: null,
  pactBoon: null,
};

function due(choice: FeatureChoice, picks: number, existing: string[] = [], replaceAllowed = false): DueChoice {
  return { featureId: "f1", featureName: "Eldritch Invocations", choice, picks, replaceAllowed, existing };
}

const invocations = parseMechanics({
  choices: [{ key: "eldritch_invocations", label: "Eldritch Invocations", pick: { kind: "option", set: "eldritch_invocation" }, count: { kind: "known", values: { "2": 2 } }, replace_on_level_up: true }],
}).mechanics.choices![0];

function mountPicker(d: DueChoice, value: ChoiceValue = initialChoiceValue(d)) {
  return mount(ChoicePicker, { props: { due: d, context, modelValue: value } });
}

describe("ChoicePicker", () => {
  it("disables an unavailable option and says why", () => {
    const wrapper = mountPicker(due(invocations, 1));
    // Lifebane needs level 9 in the invocation data; at class level 5 it cannot be picked.
    const row = wrapper.findAll("button").find((b) => b.text().includes("Level"));
    expect(row).toBeDefined();
    expect(row!.attributes("disabled")).toBeDefined();
    expect(row!.text()).toMatch(/Level \d+/);
  });

  it("emits the pick and stops offering more once the count is met", async () => {
    const d = due(invocations, 1);
    const wrapper = mountPicker(d);
    const available = () => wrapper.findAll("button").filter((b) => b.attributes("disabled") === undefined);
    await available()[0].trigger("click");
    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toHaveLength(1);
    const next = (emitted![0] as [ChoiceValue])[0];
    expect(next.picks).toHaveLength(1);

    await wrapper.setProps({ modelValue: next });
    // The pick stays clickable (to undo it); every other option waits.
    const enabled = available().filter((b) => b.attributes("aria-pressed") !== "true");
    expect(enabled).toHaveLength(0);
    expect(wrapper.text()).toContain("1 / 1");
  });

  it("an earlier pick cannot be picked again", () => {
    const wrapper = mountPicker(due(invocations, 1, ["Agonizing Blast"]));
    const row = wrapper.findAll("button").find((b) => b.text().includes("Agonizing Blast"));
    expect(row!.attributes("disabled")).toBeDefined();
    expect(row!.text()).toContain("Already chosen");
  });

  it("offers a swap only when the entry allows one, and asks for both ends", async () => {
    const without = mountPicker(due(invocations, 1, ["Agonizing Blast"], false));
    expect(without.text()).not.toContain("Swap an earlier pick");

    const d = due(invocations, 0, ["Agonizing Blast", "Armor of Shadows"], true);
    const wrapper = mountPicker(d);
    const toggle = wrapper.findAll("button").find((b) => b.text().includes("Swap an earlier pick"));
    await toggle!.trigger("click");
    const [first] = wrapper.emitted("update:modelValue") as [ChoiceValue][];
    expect(first[0].replace).toEqual({ from: "", to: "" });

    await wrapper.setProps({ modelValue: first[0] });
    expect(wrapper.text()).toContain("Give up");
    expect(wrapper.text()).toContain("Take instead");
    expect(wrapper.find("select").findAll("option").map((o) => o.text())).toEqual(
      expect.arrayContaining(["Agonizing Blast", "Armor of Shadows"]),
    );
  });

  it("an Ability Score Improvement offers Feat only when feats are allowed", () => {
    const asi = parseMechanics({
      choices: [{ key: "asi", label: "Ability Score Improvement", pick: { kind: "asi_or_feat" }, count: { kind: "per_grant", amount: 1 }, replace_on_level_up: false }],
    }).mechanics.choices![0];
    const d = { ...due(asi, 1), featureName: "Ability Score Improvement" };
    const on = mount(ChoicePicker, { props: { due: d, context, modelValue: initialChoiceValue(d), featsAllowed: true } });
    expect(on.text()).toContain("Feat");
    const off = mount(ChoicePicker, { props: { due: d, context, modelValue: initialChoiceValue(d), featsAllowed: false } });
    expect(off.text()).not.toContain("Feat");
    expect(off.text()).toContain("+2 to one");
  });
});
