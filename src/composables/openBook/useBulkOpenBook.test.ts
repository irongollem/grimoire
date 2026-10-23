import { describe, expect, it } from "vitest";
import { addToBookMessage, splitByWholeParty } from "@/composables/openBook/useBulkOpenBook";

describe("splitByWholeParty", () => {
  const shared: Record<string, string[]> = { a: ["p1", "p2"], b: ["p1"], c: [] };
  it("keeps only entries every party member can see", () => {
    const out = splitByWholeParty(["a", "b", "c"], (id) => shared[id], ["p1", "p2"]);
    expect(out).toEqual({ eligible: ["a"], skipped: ["b", "c"] });
  });
  it("skips everything while the party is empty", () => {
    expect(splitByWholeParty(["a"], (id) => shared[id], [])).toEqual({ eligible: [], skipped: ["a"] });
  });
});

describe("addToBookMessage", () => {
  it("says how many were skipped", () => {
    expect(addToBookMessage(3, 2, "NPC")).toBe("Added 3 NPCs to the Open Book. Skipped 2 not shared with the whole party.");
  });
  it("is plain when nothing was skipped", () => {
    expect(addToBookMessage(1, 0, "faction")).toBe("Added 1 faction to the Open Book.");
  });
  it("says so when nothing could be added", () => {
    expect(addToBookMessage(0, 1, "NPC")).toBe("Nothing added: 1 NPC not shared with the whole party yet.");
  });
});
