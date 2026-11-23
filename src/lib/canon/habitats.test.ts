import { describe, expect, it } from "vitest";
import { habitatForPlace, lifeConstraints, type HabitatLife } from "./habitats";

const parents: Record<string, string | null> = { room: "town", town: "region", region: null, island: null, inner: "town" };
const parentOf = (id: string) => parents[id] ?? null;

describe("habitatForPlace", () => {
  // Bug: a covered place took its ancestor's habitat instead of its own.
  it("takes a place's own habitat over the one around it", () => {
    const covered = [{ habitatId: "marsh", locationId: "region" }, { habitatId: "moor", locationId: "town" }];
    expect(habitatForPlace("town", parentOf, covered)).toEqual({ habitatId: "moor", throughPlaceId: "town" });
  });

  // Bug: a room of a covered town was in no habitat, so the party in the tavern rolled nothing.
  it("gives a room the habitat of the nearest covered place it lies inside, and names that place", () => {
    const covered = [{ habitatId: "marsh", locationId: "region" }, { habitatId: "moor", locationId: "town" }];
    expect(habitatForPlace("room", parentOf, covered)).toEqual({ habitatId: "moor", throughPlaceId: "town" });
    expect(habitatForPlace("inner", parentOf, [{ habitatId: "marsh", locationId: "region" }])).toEqual({ habitatId: "marsh", throughPlaceId: "region" });
  });

  // Bug: an uncovered place was given some habitat anyway.
  it("is null for a place under nothing covered", () => {
    expect(habitatForPlace("island", parentOf, [{ habitatId: "marsh", locationId: "region" }])).toBeNull();
  });

  // Bug: a parent cycle looped forever.
  it("stops on a parent cycle", () => {
    const loop = (id: string) => (id === "a" ? "b" : "a");
    expect(habitatForPlace("a", loop, [])).toBeNull();
  });
});

const life = (name: string, percent: number, readable = true): HabitatLife => ({ id: name, habitatId: "h", recordId: name, fromLibrary: true, name, percent, readable });
const marsh = [life("Marsh eel", 40), life("Giant frog", 20)];

describe("lifeConstraints", () => {
  // Bug: the roll ignored the shares (always the first, or evenly).
  it("rolls a creature at its share", () => {
    expect(lifeConstraints("Salt marsh", marsh, () => 0.1)[0]).toContain("around Marsh eel");
    expect(lifeConstraints("Salt marsh", marsh, () => 0.5)[0]).toContain("around Giant frog");
    expect(lifeConstraints("Salt marsh", marsh, () => 0.1)[0]).toContain("what lives in Salt marsh. Other creatures may join it.");
  });

  // Bug: "anything else" still named a creature from the list, or did not name them to avoid.
  it("on 'anything else' asks for creatures that are not any listed", () => {
    expect(lifeConstraints("Salt marsh", marsh, () => 0.9)).toEqual(["The creatures are not Marsh eel, Giant frog: something this country rarely sees."]);
  });

  // Bug: a creature another DM listed was handed to the model by its placeholder name.
  it("never names a creature the reader cannot read", () => {
    const list = [life("Marsh eel", 40), life("A creature another DM listed", 20, false)];
    expect(lifeConstraints("Salt marsh", list, () => 0.5)).toEqual(["The creatures are not Marsh eel: something this country rarely sees."]);
  });

  // Bug: a habitat with nothing at a share still constrained the encounter.
  it("adds no constraint for a habitat with no creature at a share", () => {
    expect(lifeConstraints("Salt marsh", [], () => 0.1)).toEqual([]);
    expect(lifeConstraints("Salt marsh", [life("Marsh eel", 0)], () => 0.1)).toEqual([]);
  });
});
