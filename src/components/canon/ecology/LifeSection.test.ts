import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("./HabitatsPanel.vue", () => ({ default: { template: "<div data-testid='habitats-panel' />" } }));
vi.mock("../WorldPeoples.vue", () => ({ default: { template: "<div data-testid='world-peoples' />" } }));

import LifeSection from "./LifeSection.vue";

describe("LifeSection", () => {
  // Bug (#1255 item 31): Peoples stayed in How the world works, so the two halves of "who and what lives here" were not read together.
  it("holds the peoples under Peoples and the habitats under Habitats, in a section the contents column scrolls to", () => {
    const w = mount(LifeSection);
    expect(w.get("section").attributes("id")).toBe("canon-life");
    expect(w.get("h2").text()).toContain("VI · Who and what lives here");
    const headings = w.findAll("h3").map((h) => h.text());
    expect(headings).toEqual(["Peoples", "Habitats"]);
    expect(w.find("[data-testid=world-peoples]").exists()).toBe(true);
    expect(w.find("[data-testid=habitats-panel]").exists()).toBe(true);
  });
});
