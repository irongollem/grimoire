// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NoticePinList from "./NoticePinList.vue";
import { grellRow, letterRow, pinRow } from "./pinRows";

const takerName = (id: string | null) => (id === "m1" ? "Aria" : null);

function mountList(pins = [pinRow(), grellRow(), letterRow({ status: "draft" }), pinRow({ id: "pin-taken", headline: "Rats in the cellar", status: "taken", taken_by: "m1", taken_session_number: 12, sort_order: 4 })]) {
  return mount(NoticePinList, { props: { pins, selectedId: null, takerName } });
}

describe("NoticePinList", () => {
  it("files pins under On the board, Drafts and Taken", () => {
    const w = mountList();
    expect(w.get('[data-group="up"]').text()).toContain("Note: LOST: one goat");
    expect(w.get('[data-group="up"]').text()).toContain("Wanted poster: Grell Ashmantle");
    expect(w.get('[data-group="draft"]').text()).toContain("To the brave souls who read this");
    expect(w.get('[data-group="taken"]').text()).toContain("Taken by Aria, session 12");
  });

  it("says what an empty group is for", () => {
    const w = mountList([pinRow()]);
    expect(w.get('[data-group="draft"]').text()).toContain("No drafts");
    expect(w.get('[data-group="taken"]').text()).toContain("Nobody has taken a notice yet");
  });

  it("moves a pin earlier or later, and blocks the ends", async () => {
    const w = mountList();
    const up = w.get('[data-group="up"]');
    const buttons = up.findAll("button");
    // goat: [row, earlier, later]; grell: [row, earlier, later]
    expect(buttons[1].attributes("disabled")).toBeDefined();
    expect(buttons[4].attributes("disabled")).toBeUndefined();
    expect(buttons[5].attributes("disabled")).toBeDefined();
    await buttons[2].trigger("click");
    expect(w.emitted("move")?.[0]).toEqual(["pin-goat", 1]);
  });

  it("selects a pin and pins a taken one back up", async () => {
    const w = mountList();
    await w.get('[data-group="up"] button').trigger("click");
    expect(w.emitted("select")?.[0]).toEqual(["pin-goat"]);
    const back = w.findAll("button").find((b) => b.text() === "Pin back up");
    await back?.trigger("click");
    expect(w.emitted("pin-back-up")?.[0]).toEqual(["pin-taken"]);
  });
});
