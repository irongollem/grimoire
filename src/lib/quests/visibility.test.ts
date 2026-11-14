import { describe, expect, it } from "vitest";
import { visibilityFloor, visibilityRank } from "./visibility";

const edges = [{ source_beat_id: "here", target_beat_id: "next" }];
const base = { beatId: "next", partyBeatIds: new Set(["here"]), reachedBeatIds: new Set<string>(), edges, secret: false };

describe("visibilityFloor", () => {
  it("is revealed for a beat the party stands on", () => {
    expect(visibilityFloor({ ...base, beatId: "here" })).toBe("revealed");
  });
  it("is revealed for a beat the party has already reached", () => {
    expect(visibilityFloor({ ...base, beatId: "old", reachedBeatIds: new Set(["old"]) })).toBe("revealed");
  });
  it("is rumored one route ahead of the party", () => {
    expect(visibilityFloor(base)).toBe("rumored");
  });
  it("stays hidden one route ahead when the beat is secret", () => {
    expect(visibilityFloor({ ...base, secret: true })).toBe("hidden");
  });
  it("is hidden when only a beat the party is not on leads to it", () => {
    expect(visibilityFloor({ ...base, edges: [{ source_beat_id: "elsewhere", target_beat_id: "next" }] })).toBe("hidden");
  });
});

describe("visibilityRank", () => {
  it("orders hidden below rumored below revealed", () => {
    expect([visibilityRank("hidden"), visibilityRank("rumored"), visibilityRank("revealed")]).toEqual([0, 1, 2]);
  });
});
