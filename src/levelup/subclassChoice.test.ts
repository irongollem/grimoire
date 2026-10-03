import { describe, expect, it } from "vitest";
import { subclassChoiceDue } from "@/levelup/subclassChoice";

describe("subclassChoiceDue", () => {
  it("asks at the subclass level", () => {
    expect(subclassChoiceDue({ subclass_name: null }, 3, 3)).toBe(true);
  });

  it("asks again past the subclass level when the row still has no subclass", () => {
    expect(subclassChoiceDue({ subclass_name: null }, 5, 3)).toBe(true);
  });

  it("does not ask before the subclass level", () => {
    expect(subclassChoiceDue({ subclass_name: null }, 2, 3)).toBe(false);
  });

  it("does not ask once the row has a subclass", () => {
    expect(subclassChoiceDue({ subclass_name: "Champion" }, 5, 3)).toBe(false);
  });

  it("asks a class being taken for the first time (no row) when it chooses at level 1", () => {
    expect(subclassChoiceDue(null, 1, 1)).toBe(true);
    expect(subclassChoiceDue(null, 1, 3)).toBe(false);
  });

  it("does not ask for a class with no recorded subclass level", () => {
    expect(subclassChoiceDue({ subclass_name: null }, 5, null)).toBe(false);
  });
});
