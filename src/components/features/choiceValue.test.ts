import { describe, expect, it } from "vitest";
import type { DueChoice } from "@/rules/features/levelUpChoices";
import type { ClassFeature } from "@/types/feature.types";
import { emptyChoiceValue, initialChoiceValue, isChoiceComplete, type ChoiceValue } from "./choiceValue";

const choice = (pick: DueChoice["choice"]["pick"]) =>
  ({ key: "k", label: "L", pick, count: { kind: "per_grant", amount: 1 }, replace_on_level_up: false }) as DueChoice["choice"];
const due = (pick: DueChoice["choice"]["pick"], picks = 1): DueChoice => ({
  featureId: "f", featureName: "F", choice: choice(pick), picks, replaceAllowed: false, existing: [],
});
const feats = new Map<string, ClassFeature>([
  ["athlete", { id: "athlete", ability_increase: { abilities: ["str", "dex"], amount: 1, split: false, max: 20 } } as unknown as ClassFeature],
  ["alert", { id: "alert", ability_increase: null } as unknown as ClassFeature],
]);

describe("isChoiceComplete", () => {
  it("an option pick needs its count, but never more than can be picked", () => {
    const d = due({ kind: "custom", options: ["a", "b"] }, 2);
    expect(isChoiceComplete(d, emptyChoiceValue(), feats, 2)).toBe(false);
    expect(isChoiceComplete(d, { ...emptyChoiceValue(), picks: ["a", "b"] }, feats, 2)).toBe(true);
    // Only one option is selectable, so one pick is all that can be asked.
    expect(isChoiceComplete(d, { ...emptyChoiceValue(), picks: ["a"] }, feats, 1)).toBe(true);
  });

  it("an ASI needs a form, its abilities, and for a feat the feat and its ability", () => {
    const d = due({ kind: "asi_or_feat" });
    const v = (patch: Partial<ChoiceValue>): ChoiceValue => ({ ...initialChoiceValue(d), ...patch });
    expect(isChoiceComplete(d, initialChoiceValue(d), feats, 0)).toBe(false);
    expect(isChoiceComplete(d, v({ asi: { mode: "plus2", primary: "str", secondary: null } }), feats, 0)).toBe(true);
    expect(isChoiceComplete(d, v({ asi: { mode: "plus1plus1", primary: "str", secondary: "str" } }), feats, 0)).toBe(false);
    expect(isChoiceComplete(d, v({ asi: { mode: "plus1plus1", primary: "str", secondary: "dex" } }), feats, 0)).toBe(true);
    const featMode = { mode: "feat" as const, primary: null, secondary: null };
    expect(isChoiceComplete(d, v({ asi: featMode, picks: ["alert"] }), feats, 1)).toBe(true);
    expect(isChoiceComplete(d, v({ asi: featMode, picks: ["athlete"] }), feats, 1)).toBe(false);
    expect(isChoiceComplete(d, v({ asi: featMode, picks: ["athlete"], ability: { primary: "dex", secondary: null } }), feats, 1)).toBe(true);
  });

  it("a half-made swap blocks the entry", () => {
    const d = due({ kind: "custom", options: ["a"] });
    expect(isChoiceComplete(d, { ...emptyChoiceValue(), picks: ["a"], replace: { from: "x", to: "" } }, feats, 1)).toBe(false);
  });
});
