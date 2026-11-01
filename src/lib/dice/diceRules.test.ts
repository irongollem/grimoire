import { describe, expect, it } from "vitest";
import { NORMAL_ROLL, rollChoices, type DiceRules, type RollOption } from "./diceRules";

const help: RollOption = { key: "boon", label: "Boon", short: "Bn", hint: "keep higher", tone: "success" };
const hindrance: RollOption = { key: "bane", label: "Bane", short: "Bn", hint: "keep lower", tone: "danger" };

function rulesWith(options: RollOption[]): DiceRules {
  return {
    options,
    optionAppliesTo: () => true,
    facesNeeded: (_s, n) => n,
    score: () => ({ total: 0, label: "", modifier: 0, breakdown: [], isCrit: false, isFumble: false }),
    combine: (a) => a,
    tagLabel: (l) => l,
  };
}

describe("rollChoices", () => {
  it("puts Normal between hindrances and helps whatever order the system lists them in", () => {
    expect(rollChoices(rulesWith([help, hindrance])).map((c) => c.key)).toEqual(["bane", NORMAL_ROLL, "boon"]);
  });

  it("is empty for a system with no options, so a control does not offer Normal alone", () => {
    expect(rollChoices(rulesWith([]))).toEqual([]);
  });
});
