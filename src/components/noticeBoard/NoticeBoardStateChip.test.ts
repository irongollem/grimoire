// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NoticeBoardStateChip from "./NoticeBoardStateChip.vue";

describe("NoticeBoardStateChip", () => {
  it("names the state as a static tag, not a button", () => {
    const w = mount(NoticeBoardStateChip, { props: { state: "shown" } });
    expect(w.text()).toBe("Shown to players");
    expect(w.element.tagName).toBe("SPAN");
    expect(w.attributes("data-board-state")).toBe("shown");
  });

  it("says Presenting, or the label it is given", () => {
    expect(mount(NoticeBoardStateChip, { props: { state: "presenting" } }).text()).toBe("Presenting");
    expect(mount(NoticeBoardStateChip, { props: { state: "presenting", label: "Presenting now" } }).text()).toBe("Presenting now");
  });
});
