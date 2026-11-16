import { describe, expect, it } from "vitest";
import { labelAfterRefPick } from "./entryRefLabel";

describe("labelAfterRefPick", () => {
  it("fills an empty or blank label with the picked name", () => {
    // Fails if picking a creature leaves the entry reading "—" in the list.
    expect(labelAfterRefPick("", "Cat")).toBe("Cat");
    expect(labelAfterRefPick("   ", "Cat")).toBe("Cat");
  });

  it("never overwrites a label the DM typed", () => {
    // Fails if the guard is dropped and a typed label is replaced by the name.
    expect(labelAfterRefPick("A stray follows you home", "Cat")).toBe("A stray follows you home");
  });
});
