// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { slashItems } from "./slashMenu";

describe("slashItems", () => {
  const all = () => true;
  // Fails on: the menu listing only labels, so "/sidebar" finds nothing (the entry is called Note).
  it("matches the short name as well as the label", () => {
    expect(slashItems("sidebar", all).map((e) => e.label)).toContain("Note");
    expect(slashItems("read", all).map((e) => e.label)).toContain("Descriptive (Read-Aloud)");
  });
  it("lists every block that has an action when nothing is typed", () => {
    expect(slashItems("", all).length).toBeGreaterThan(30);
  });
  // Fails on: a disabled entry (Column Break in one column) offered in the menu.
  it("leaves out what is not available here", () => {
    expect(slashItems("column break", (e) => e.label !== "Column Break")).toEqual([]);
  });
});
