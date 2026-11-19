import { describe, it, expect } from "vitest";
import { SPELL_CONDITION_EFFECT_PROMPT } from "./spellConditionPrompt";
import { CONDITION_NAMES } from "./curatedSpellConditions";

describe("SPELL_CONDITION_EFFECT_PROMPT", () => {
  it("names every condition of the rules and the three honesty rules", () => {
    // Bug caught: a condition added to the rules but missing from the prompt, so the model could never state it; or
    // the instruction to leave a condition unstated when the text does not say it being dropped in an edit.
    for (const name of CONDITION_NAMES) expect(SPELL_CONDITION_EFFECT_PROMPT).toContain(name);
    expect(SPELL_CONDITION_EFFECT_PROMPT).toContain("only when the description you wrote says it in words");
    expect(SPELL_CONDITION_EFFECT_PROMPT).toContain('"not_simple" when the effect depends on a choice, on hit points or on a table');
    expect(SPELL_CONDITION_EFFECT_PROMPT).toContain("are the only conditions");
  });
});
