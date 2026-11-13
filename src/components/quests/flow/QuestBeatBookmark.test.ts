import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestBeatBookmark from "./QuestBeatBookmark.vue";

describe("QuestBeatBookmark", () => {
  it("is decorative and carries its state", () => {
    const w = mount(QuestBeatBookmark, { props: { state: "done" } });
    expect(w.attributes("aria-hidden")).toBe("true");
    expect(w.attributes("data-state")).toBe("done");
  });
  it("unreachable carries a slash mark and failed an x, untouched neither", () => {
    expect(mount(QuestBeatBookmark, { props: { state: "unreachable" } }).find("svg").exists()).toBe(true);
    expect(mount(QuestBeatBookmark, { props: { state: "failed" } }).find("svg").exists()).toBe(true);
    expect(mount(QuestBeatBookmark, { props: { state: "untouched" } }).find("svg").exists()).toBe(false);
  });
});
