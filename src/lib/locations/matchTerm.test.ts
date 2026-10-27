import { describe, expect, it } from "vitest";
import { chooseMatchTerm } from "./matchTerm";

describe("chooseMatchTerm", () => {
  it("uses the answered term while a longer one is still loading", () => {
    expect(chooseMatchTerm(" dragons ", "dragon", 2)).toEqual({ term: "dragon", useTextMatches: true });
  });

  it("uses the live term before any answer has arrived", () => {
    expect(chooseMatchTerm("dragon", null, 2)).toEqual({ term: "dragon", useTextMatches: false });
  });

  it("uses the live term, without text ids, below the minimum length", () => {
    expect(chooseMatchTerm("d", "dragon", 2)).toEqual({ term: "d", useTextMatches: false });
  });

  it("text ids apply at exactly the minimum length", () => {
    expect(chooseMatchTerm("dr", "dr", 2)).toEqual({ term: "dr", useTextMatches: true });
  });

  it("counts the trimmed live term against the minimum, and returns it trimmed", () => {
    // " d " is one character once trimmed, so it is still below a minimum of 2.
    expect(chooseMatchTerm(" d ", "dragon", 2)).toEqual({ term: "d", useTextMatches: false });
  });
});
