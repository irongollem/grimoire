import { describe, expect, it, vi } from "vitest";
import { createSolo, logicalSoundId, SOLO_DIM } from "./soloDim";

function setup(alive: string[] = []) {
  const setSoundDim = vi.fn();
  const ids = { value: null as readonly string[] | null };
  const live = new Set(alive);
  const solo = createSolo({
    engine: { setSoundDim },
    ids,
    isAlive: (id) => live.has(id),
    knownIds: () => ["a", "b", "a::loop"],
  });
  return { solo, ids, setSoundDim, live };
}

describe("solo", () => {
  it("treats a gapless shadow as the sound it shadows, so the partner is not dimmed under its own solo", () => {
    expect(logicalSoundId("a::loop")).toBe("a");
    const { solo, ids } = setup();
    ids.value = ["a"];
    expect(solo.dimFor("a::loop")).toBe(1);
    expect(solo.dimFor("b")).toBe(SOLO_DIM);
  });

  it("dims everything known outside the set and lifts it on null", () => {
    const { solo, setSoundDim } = setup(["a"]);
    solo.setSolo(["a"]);
    expect(setSoundDim).toHaveBeenCalledWith("b", SOLO_DIM, 250);
    expect(setSoundDim).toHaveBeenCalledWith("a", 1, 250);
    solo.setSolo(null);
    expect(setSoundDim).toHaveBeenLastCalledWith("a::loop", 1, 250);
  });

  it("does not clear a solo set before its sound has started", () => {
    const { solo, ids } = setup();
    solo.setSolo(["a"]);
    solo.checkAlive();
    expect(ids.value).toEqual(["a"]);
  });

  it("clears itself once the soloed sound was heard and has stopped", () => {
    const { solo, ids, live } = setup();
    solo.setSolo(["a"]);
    solo.noteStart("a");
    live.clear();
    solo.checkAlive();
    expect(ids.value).toBeNull();
  });

  it("treats an empty list as no solo", () => {
    const { solo, ids } = setup();
    solo.setSolo([]);
    expect(ids.value).toBeNull();
  });
});
