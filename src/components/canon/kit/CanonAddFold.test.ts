import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CanonAddFold from "./CanonAddFold.vue";

const mountFold = (choices: { key: string; label: string }[]) => mount(CanonAddFold, { props: { choices }, global: { stubs: { teleport: true } } });

describe("CanonAddFold", () => {
  // Bug caught: an "Add…" button drawn with nothing left to add, opening an empty menu.
  it("draws nothing when no block is left to add", () => {
    expect(mountFold([]).find("[data-testid=canon-add-fold]").exists()).toBe(false);
  });

  // Bug caught: the menu open from the start, or a choice that is reported without closing it.
  it("opens a menu of the choices and reports the one picked, closing the menu", async () => {
    const w = mountFold([{ key: "quests", label: "A quest" }, { key: "notes", label: "More about it" }]);
    expect(w.find("[data-slip]").exists()).toBe(false);
    await w.get("[data-testid=canon-add-fold-button]").trigger("click");
    expect(w.findAll("[data-slip] button").map((b) => b.text())).toEqual(["A quest", "More about it"]);
    await w.get("[data-testid=canon-add-notes]").trigger("click");
    expect(w.emitted("choose")).toEqual([["notes"]]);
    expect(w.find("[data-slip]").exists()).toBe(false);
  });
});
