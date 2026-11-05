import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AbilityScoreTable from "./AbilityScoreTable.vue";
import { vRollMode } from "@/directives/vRollMode";

const scores = { str: 10, dex: 16, con: 12, int: 8, wis: 14, cha: 10 };

function dexCheck(checkBonus: { amount: number; source: string } | null) {
  const wrapper = mount(AbilityScoreTable, {
    props: { scores, layout: "sheet", checkBonus },
    global: { directives: { "roll-mode": vRollMode } },
  });
  const button = wrapper.findAll("button").find((b) => b.attributes("aria-label")?.startsWith("Dexterity 16"));
  if (!button) throw new Error("no Dexterity check button");
  return { wrapper, button };
}

describe("AbilityScoreTable check bonus", () => {
  // #1147 review: a 2014 Bard's DEX check rolls +4 (modifier +3, Jack of All Trades +1), so the
  // button must say so, while the box keeps the modifier that attacks and damage read too.
  it("names the check's total and its source when something adds to it", () => {
    const { button } = dexCheck({ amount: 1, source: "Jack of All Trades" });
    expect(button.attributes("aria-label")).toBe(
      "Dexterity 16, modifier +3, check +4 with Jack of All Trades +1: roll a check",
    );
    expect(button.text()).toContain("+3");
  });

  it("still emits the ability's own modifier, so the parent adds the bonus once", async () => {
    const { wrapper, button } = dexCheck({ amount: 1, source: "Jack of All Trades" });
    await button.trigger("click");
    expect(wrapper.emitted("roll-ability")?.[0]?.[2]).toBe(3);
  });

  it("says nothing extra when nothing adds to the check", () => {
    expect(dexCheck(null).button.attributes("aria-label")).toBe("Dexterity 16, modifier +3: roll a check");
  });
});
