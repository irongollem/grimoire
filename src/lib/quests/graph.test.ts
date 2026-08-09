import { describe, expect, it } from "vitest";
import { findBeatPath, getReachableBeatIds } from "./graph";

const edge = (source_beat_id: string, target_beat_id: string) => ({
  source_beat_id,
  target_beat_id,
});

describe("quest beat graph traversal", () => {
  it("walks branches and converging paths once", () => {
    const edges = [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")];
    expect(getReachableBeatIds("a", edges)).toEqual(["b", "c", "d"]);
  });

  it("terminates when an authored route contains a cycle", () => {
    const edges = [edge("a", "b"), edge("b", "c"), edge("c", "a"), edge("c", "d")];
    expect(getReachableBeatIds("a", edges)).toEqual(["b", "c", "d"]);
    expect(findBeatPath("a", "d", edges)).toEqual(["a", "b", "c", "d"]);
  });

  it("returns null for an unreachable beat", () => {
    expect(findBeatPath("a", "z", [edge("a", "b"), edge("b", "a")])).toBeNull();
  });
});
