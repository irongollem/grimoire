import { describe, expect, it } from "vitest";
import { resolveStartBeatId } from "./entry";

const beatIds = new Set(["b1", "b2", "b3"]);

describe("resolveStartBeatId", () => {
  it("picks a live bridge entry first, even when a stored entry and a sole root also exist", () => {
    const result = resolveStartBeatId({
      unlockEntryBeatId: "b2",
      entryBeatId: "b1",
      rootIds: new Set(["b1"]),
      beatIds,
    });
    expect(result).toEqual({ beatId: "b2", reason: "bridge" });
  });

  it("falls through a bridge entry that points at a beat which no longer exists", () => {
    const result = resolveStartBeatId({
      unlockEntryBeatId: "gone",
      entryBeatId: "b1",
      rootIds: new Set(["b1"]),
      beatIds,
    });
    expect(result).toEqual({ beatId: "b1", reason: "entry" });
  });

  it("falls through a null bridge entry to the quest's own entry", () => {
    const result = resolveStartBeatId({
      unlockEntryBeatId: null,
      entryBeatId: "b1",
      rootIds: new Set(["b1", "b2"]),
      beatIds,
    });
    expect(result).toEqual({ beatId: "b1", reason: "entry" });
  });

  it("falls through an entry beat that no longer exists to the sole root", () => {
    const result = resolveStartBeatId({
      unlockEntryBeatId: null,
      entryBeatId: "gone",
      rootIds: new Set(["b3"]),
      beatIds,
    });
    expect(result).toEqual({ beatId: "b3", reason: "sole-root" });
  });

  it("falls through no entry at all to the sole root", () => {
    const result = resolveStartBeatId({
      unlockEntryBeatId: null,
      entryBeatId: null,
      rootIds: new Set(["b3"]),
      beatIds,
    });
    expect(result).toEqual({ beatId: "b3", reason: "sole-root" });
  });

  it("asks when there is no entry, no bridge, and several roots", () => {
    const result = resolveStartBeatId({
      unlockEntryBeatId: null,
      entryBeatId: null,
      rootIds: new Set(["b1", "b2"]),
      beatIds,
    });
    expect(result).toEqual({ beatId: null, reason: "ask" });
  });

  it("asks when there is no entry, no bridge, and no root at all (a pure cycle)", () => {
    const result = resolveStartBeatId({
      unlockEntryBeatId: null,
      entryBeatId: null,
      rootIds: new Set(),
      beatIds,
    });
    expect(result).toEqual({ beatId: null, reason: "ask" });
  });
});
