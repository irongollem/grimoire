// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { parseMechanics } from "@/rules/features/mechanics";
import type { DueChoice, OptionContext } from "@/rules/features/levelUpChoices";
import type { FeatureChoice } from "@/rules/features/mechanics.types";
import type { ClassFeature } from "@/types/feature.types";
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
  describe("picking from a short list", () => {
    const custom = (picks: number, existing: string[] = [], replaceAllowed = false) =>
      due(
        parseMechanics({
          choices: [{ key: "c", label: "Boon", pick: { kind: "custom", options: ["alpha", "beta", "gamma"] }, count: { kind: "per_grant", amount: 1 }, replace_on_level_up: true }],
        }).mechanics.choices![0],
        picks,
        existing,
        replaceAllowed,
      );
    const row = (w: ReturnType<typeof mountPicker>, label: string) => w.findAll("button").find((b) => b.text().includes(label))!;

    it("keeps a chosen option clickable so it can be undone, clears the ability it carried, and frees the others", async () => {
      const d = custom(1);
      const value: ChoiceValue = { ...initialChoiceValue(d), picks: ["alpha"], ability: { primary: "str", secondary: null } };
      const w = mountPicker(d, value);
      expect(row(w, "alpha").attributes("disabled")).toBeUndefined();
      expect(row(w, "beta").attributes("disabled")).toBeDefined();
      await row(w, "alpha").trigger("click");
      const [next] = w.emitted("update:modelValue")![0] as [ChoiceValue];
      expect(next.picks).toEqual([]);
      expect(next.ability).toEqual({ primary: null, secondary: null });
    });

    it("asks for no more picks than there are options to take", () => {
      const w = mountPicker(custom(5));
      expect(w.text()).toContain("0 / 3");
    });

    it("holds back the option a swap would take, so it cannot also be picked outright", () => {
      const d = custom(1, ["delta"], true);
      const w = mountPicker(d, { ...initialChoiceValue(d), replace: { from: "delta", to: "beta" } });
      expect(row(w, "beta").attributes("disabled")).toBeDefined();
      expect(row(w, "alpha").attributes("disabled")).toBeUndefined();
    });

    it("offers a swap only the options that are neither picked nor unavailable", () => {
      const d = custom(1, ["alpha"], true);
      const w = mountPicker(d, { ...initialChoiceValue(d), picks: ["gamma"], replace: { from: "", to: "" } });
      const options = w.findComponent({ name: "EntityCombobox" }).props("options") as { id: string }[];
      const offered = options.map((o) => o.id);
      // alpha is already held, gamma is picked now; only beta is left to take instead.
      expect(offered).toEqual(["beta"]);
    });
  });

  describe("taking a feat", () => {
    const feat = (id: string, name: string) => ({ id, name, kind: "feat", ruleset: null, feat_category: null, prerequisites: null, repeatable: false, ability_increase: null, description: null }) as unknown as ClassFeature;
    const featDue = due({ key: "f", label: "Feat", pick: { kind: "feat", categories: null }, count: { kind: "per_grant", amount: 1 }, replace_on_level_up: false }, 1);
    const withFeats = { ...context, feats: [feat("alert", "Alert"), feat("tough", "Tough")] };

    it("swaps the picked feat for another instead of stacking a second, and keeps the others clickable", async () => {
      const w = mount(ChoicePicker, { props: { due: featDue, context: withFeats, modelValue: { ...initialChoiceValue(featDue), picks: ["alert"], ability: { primary: "str", secondary: null } } } });
      const tough = w.findAll("button").find((b) => b.text().includes("Tough"))!;
      expect(tough.attributes("disabled")).toBeUndefined();
      await tough.trigger("click");
      const [next] = w.emitted("update:modelValue")![0] as [ChoiceValue];
      expect(next.picks).toEqual(["tough"]);
      // The ability chosen for Alert does not carry over to Tough.
      expect(next.ability).toEqual({ primary: null, secondary: null });
    });
  });

  describe("an Ability Score Improvement", () => {
    const asi = parseMechanics({
      choices: [{ key: "asi", label: "Ability Score Improvement", pick: { kind: "asi_or_feat" }, count: { kind: "per_grant", amount: 1 }, replace_on_level_up: false }],
    }).mechanics.choices![0];

    it("starts afresh when its form changes: picks and ability are dropped", async () => {
      const d = { ...due(asi, 1), featureName: "Ability Score Improvement" };
      const value: ChoiceValue = { ...initialChoiceValue(d), asi: { mode: "feat", primary: null, secondary: null }, picks: ["alert"], ability: { primary: "str", secondary: null } };
      const w = mount(ChoicePicker, { props: { due: d, context, modelValue: value } });
      await w.findAll("button").find((b) => b.text().includes("+1 to two"))!.trigger("click");
      const [next] = w.emitted("update:modelValue")![0] as [ChoiceValue];
      expect(next.asi).toEqual({ mode: "plus1plus1", primary: null, secondary: null });
      expect(next.picks).toEqual([]);
      expect(next.ability).toEqual({ primary: null, secondary: null });
    });
  });

  it("searches a long list, and says when nothing matches", async () => {
    const w = mountPicker(due(invocations, 1));
    const search = w.find("input[type=search]");
    expect(search.exists()).toBe(true);
    await search.setValue("agonizing");
    const labels = w.findAll("ul button").map((b) => b.text());
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((l) => l.toLowerCase().includes("agonizing"))).toBe(true);
    await search.setValue("zzzz");
    expect(w.text()).toContain("Nothing matches.");
  });
});
