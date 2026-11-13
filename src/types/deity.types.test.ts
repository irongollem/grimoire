import { describe, expect, it } from "vitest";
import { alignmentAbbreviation, DEITY_ALIGNMENTS } from "@/types/deity.types";

describe("alignmentAbbreviation", () => {
  it("abbreviates every alignment the editor offers, except Unaligned", () => {
    // Bug: a new alignment added to the editor gets no tab on the card.
    const abbreviated = DEITY_ALIGNMENTS.filter((a) => alignmentAbbreviation(a) !== null);
    expect(abbreviated).toHaveLength(DEITY_ALIGNMENTS.length - 1);
    expect(alignmentAbbreviation("Unaligned")).toBeNull();
  });

  it("writes true neutral as N and the rest as two letters", () => {
    expect(alignmentAbbreviation("True Neutral")).toBe("N");
    expect(alignmentAbbreviation("Chaotic Evil")).toBe("CE");
    expect(alignmentAbbreviation("lawful good")).toBe("LG");
  });

  it("gives no tab for free text or nothing", () => {
    expect(alignmentAbbreviation("Whatever it likes")).toBeNull();
    expect(alignmentAbbreviation(null)).toBeNull();
  });
});
