import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SoloRolled from "./SoloRolled.vue";

describe("SoloRolled", () => {
  // Bug caught: the roll line drawn without who rolled, or claiming a success the server never decided.
  it("shows the total, who rolled what and the dice, with no verdict", () => {
    const w = mount(SoloRolled, { props: { who: "Inkling", roll: { label: "Wisdom (Perception)", faces: [13], kept: 13, bonus: 4, total: 17, mode: "normal", atTable: true } } });
    expect(w.text()).toContain("17");
    expect(w.text()).toContain("Inkling rolled Wisdom (Perception)");
    expect(w.text()).toContain("d20 (13) + 4 · rolled at the table");
    expect(w.text()).not.toMatch(/success|fail/i);
  });
});
