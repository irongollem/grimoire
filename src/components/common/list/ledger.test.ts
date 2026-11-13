import { describe, expect, it } from "vitest";
import { artFreeSkeleton } from "./ledger";

describe("artFreeSkeleton", () => {
  // Bug: a phone showed the desktop ledger shimmer, a promise its text rows never keep.
  it("gives a phone its text shapes and a desktop the ledger or the catalogue card", () => {
    expect(artFreeSkeleton("rows", true)).toBe("rows-text");
    expect(artFreeSkeleton("grid", true)).toBe("cards-text");
    expect(artFreeSkeleton("rows")).toBe("ledger");
    expect(artFreeSkeleton("grid")).toBe("entries");
  });
});
