import { describe, expect, it } from "vitest";
import { findBeatPath, getReachableBeatIds, rootBeatIds, storyBeatOrder } from "./graph";

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
  const beat = (id: string, kind = "neutral", is_improvised = false) => ({ id, kind, is_improvised });

  it("treats a beat with no incoming edge as the root", () => {
    const edges = [edge("a", "b"), edge("b", "c")];
    expect(rootBeatIds([beat("a"), beat("b"), beat("c")], edges)).toEqual(["a"]);
  });

  it("returns every root when the party can start from more than one place", () => {
    const edges = [edge("tavern", "cave")];
    expect(rootBeatIds([beat("tavern"), beat("docks"), beat("cave")], edges)).toEqual(["tavern", "docks"]);
  });

  // `improvise_quest_runtime` defaults `p_keep_edge` to false, so a beat named
  // at the table has no incoming edge. Without this the quest would sprout a
  // second "opening" the moment the party went off script — an improvisation
  // happens part-way through a story, it is never an entrance to one.
  it("never treats an improvised beat as an opening", () => {
    const edges = [edge("a", "b")];
    expect(rootBeatIds([beat("a"), beat("b"), beat("aside", "neutral", true)], edges)).toEqual(["a"]);
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

describe("quest beat story order", () => {
  const beat = (id: string, kind = "neutral", is_improvised = false) => ({ id, kind, is_improvised });

  it("walks a linear chain start to finish", () => {
    const edges = [edge("a", "b"), edge("b", "c")];
    expect(storyBeatOrder([beat("a"), beat("b"), beat("c")], edges)).toEqual(["a", "b", "c"]);
  });

  it("finishes one root's branches before moving to the next root", () => {
    const edges = [edge("tavern", "cave")];
    expect(storyBeatOrder([beat("tavern"), beat("docks"), beat("cave")], edges)).toEqual(["tavern", "cave", "docks"]);
  });

  it("still lists every beat of a pure cycle, in authored order, when there is no root to walk from", () => {
    const edges = [edge("a", "b"), edge("b", "a")];
    expect(storyBeatOrder([beat("a"), beat("b")], edges)).toEqual(["a", "b"]);
  });

  it("never returns an archived beat", () => {
    expect(storyBeatOrder([beat("a"), beat("gone", "archived")], [])).toEqual(["a"]);
  });

  it("ignores an edge pointing at a beat outside this list", () => {
    expect(storyBeatOrder([beat("a")], [edge("a", "ghost")])).toEqual(["a"]);
  });
});
