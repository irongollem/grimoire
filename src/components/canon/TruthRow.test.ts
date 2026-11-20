import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { CanonEntry } from "@/types/canon.types";
import type { Knower } from "@/composables/canon/useKnownToByEntry";

import TruthRow from "./TruthRow.vue";

const truth = (knowledge: CanonEntry["knowledge"]) => ({ id: "t1", title: "The Stain is a wound.", knowledge }) as CanonEntry;
const ferrymen: Knower = { rowId: "k", kind: "faction", id: "f1", name: "The Ferrymen" };

describe("TruthRow", () => {
  it("says nobody is named for a 'some' truth with no knowers, so the gap is visible in the list", () => {
    expect(mount(TruthRow, { props: { entry: truth("some"), knowers: [] } }).find("[data-testid=nobody-named]").exists()).toBe(true);
  });

  it("names the people and factions that know it", () => {
    const w = mount(TruthRow, { props: { entry: truth("some"), knowers: [ferrymen] } });
    expect(w.text()).toContain("The Ferrymen");
    expect(w.find("[data-testid=nobody-named]").exists()).toBe(false);
  });

  it("lists no knowers for a truth known to all, whatever the list handed it", () => {
    expect(mount(TruthRow, { props: { entry: truth("all"), knowers: [ferrymen] } }).text()).not.toContain("The Ferrymen");
  });

  it("states its mark in words, not colour alone", () => {
    expect(mount(TruthRow, { props: { entry: truth("secret"), knowers: [] } }).text()).toContain("Secret");
  });

  it("selects through one bare button that reports pressed, and the button carries the truth's words as its name", async () => {
    const w = mount(TruthRow, { props: { entry: truth("all"), knowers: [], selected: true } });
    const b = w.find("button");
    expect(b.attributes("aria-pressed")).toBe("true");
    expect(b.attributes("aria-label")).toBe("The Stain is a wound.");
    await b.trigger("click");
    expect(w.emitted("select")).toHaveLength(1);
  });
});
