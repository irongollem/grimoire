import { describe, expect, it } from "vitest";
import { findBeatPath, getReachableBeatIds, rootBeatIds } from "./graph";

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

describe("quest beat graph roots", () => {
  const beat = (id: string, kind = "neutral") => ({ id, kind });

  it("treats a beat with no incoming edge as the root", () => {
    const edges = [edge("a", "b"), edge("b", "c")];
    expect(rootBeatIds([beat("a"), beat("b"), beat("c")], edges)).toEqual(["a"]);
  });

  it("returns every root when the party can start from more than one place", () => {
    const edges = [edge("tavern", "cave")];
    expect(rootBeatIds([beat("tavern"), beat("docks"), beat("cave")], edges)).toEqual(["tavern", "docks"]);
  });

  it("returns none for a pure cycle", () => {
    const edges = [edge("a", "b"), edge("b", "a")];
    expect(rootBeatIds([beat("a"), beat("b")], edges)).toEqual([]);
  });

  it("returns none when there are no beats yet", () => {
    expect(rootBeatIds([], [])).toEqual([]);
  });

  it("never returns an archived beat, even with no incoming edge", () => {
    expect(rootBeatIds([beat("a"), beat("gone", "archived")], [])).toEqual(["a"]);
  });
});
