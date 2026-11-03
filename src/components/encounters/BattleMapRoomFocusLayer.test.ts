// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BattleMapRoomFocusLayer from "./BattleMapRoomFocusLayer.vue";

const base = { hostW: 400, hostH: 300, cellPx: 20, originX: 10, originY: 10, focusCells: ["3,2", "4,2", "3,3"] };

describe("BattleMapRoomFocusLayer", () => {
  // Decision 8: the blue outline had no name, so the DM could not tell it from any other highlight.
  it("names the outline with a chip at the room's top-left corner, and draws none without a label", () => {
    const chip = mount(BattleMapRoomFocusLayer, { props: { ...base, label: "Fight here" } }).find("[data-testid=room-focus-label]");
    expect(chip.text()).toBe("Fight here");
    const rect = chip.find("rect");
    expect(Number(rect.attributes("x"))).toBe(10 + 3 * 20 + 4);
    expect(Number(rect.attributes("y"))).toBe(10 + 2 * 20 + 4);
    expect(mount(BattleMapRoomFocusLayer, { props: base }).find("[data-testid=room-focus-label]").exists()).toBe(false);
  });
});
