import { describe, expect, it } from "vitest";
import { wholeParty } from "@/lib/openBook/eligibility";
import { addToBookMessage, splitByEligibility } from "@/composables/openBook/useBulkOpenBook";

describe("splitByEligibility", () => {
  const shared: Record<string, string[]> = { a: ["p1", "p2"], b: ["p1"], c: [] };
  const wholeOnly = (id: string, party: readonly string[]) => wholeParty(shared[id], party);
  it("keeps only entries the predicate accepts", () => {
    const out = splitByEligibility(["a", "b", "c"], wholeOnly, ["p1", "p2"]);
    expect(out).toEqual({ eligible: ["a"], skipped: ["b", "c"] });
  });
  it("skips everything while the party is empty", () => {
    expect(splitByEligibility(["a"], wholeOnly, [])).toEqual({ eligible: [], skipped: ["a"] });
  });
});

describe("addToBookMessage", () => {
  it("says how many were skipped", () => {
    expect(addToBookMessage(3, 2, "NPC")).toBe("Added 3 NPCs to the Open Book. Skipped 2 not ready for the book.");
  });
  it("is plain when nothing was skipped", () => {
    expect(addToBookMessage(1, 0, "faction")).toBe("Added 1 faction to the Open Book.");
  });
  it("says so when nothing could be added", () => {
    expect(addToBookMessage(0, 1, "NPC")).toBe("Nothing added: 1 NPC not ready for the book yet.");
  });
});
