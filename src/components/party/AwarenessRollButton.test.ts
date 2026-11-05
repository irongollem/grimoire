// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AwarenessRollButton from "./AwarenessRollButton.vue";
import type { AwarenessRoll } from "@/types/party.types";
import type { AwarenessSource } from "@/rules/awareness";

const member: AwarenessSource = {
  str: 10, dex: 10, con: 10, int: 10, wis: 14, cha: 10,
  proficiency_bonus: 3,
  skill_proficiencies: { perception: "proficient" },
  conditions: [],
  ruleset: "2014",
};
const roll = { d20: 12, d20_second: 3, last_used_d20: null, last_used_d20_second: null } as AwarenessRoll;

describe("AwarenessRollButton", () => {
  it("emits use on click, so the DM's click actually spends the roll", async () => {
    const w = mount(AwarenessRollButton, { props: { member, jack: "none", roll } });
    await w.find("button").trigger("click");
    expect(w.emitted("use")).toHaveLength(1);
  });

  it("emits nothing while a use is pending, so a double click cannot spend two rolls", async () => {
    const w = mount(AwarenessRollButton, { props: { member, jack: "none", roll, pending: true } });
    await w.find("button").trigger("click");
    expect(w.emitted("use")).toBeUndefined();
  });

  it("shows the die plus the perception bonus, not the bare die", () => {
    const w = mount(AwarenessRollButton, { props: { member, jack: "none", roll } });
    expect(w.text()).toContain("17");
  });

  it("adds Jack of All Trades to an unproficient Perception, so a Bard's secret roll is not short", () => {
    const unproficient = { ...member, skill_proficiencies: {} };
    const w = mount(AwarenessRollButton, { props: { member: unproficient, jack: "any_check", roll } });
    // d20 12 + WIS 2 + half of proficiency 3 rounded down (PHB 2014 "Bard")
    expect(w.text()).toContain("15");
  });

  it("reads Roll when there is no roll yet, instead of a number", () => {
    const w = mount(AwarenessRollButton, { props: { member, jack: "none", roll: undefined } });
    expect(w.text()).toContain("Roll");
  });

  it("carries the spelled-out description as its hover text, not the bare number", () => {
    const w = mount(AwarenessRollButton, { props: { member, jack: "none", roll } });
    expect(w.find("button").attributes("title")).toContain("d20 12 + 5");
  });
});
