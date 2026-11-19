import { describe, expect, it } from "vitest";
import { goTarget, siteOf, type PlaceForMap } from "./placeMap";

function place(id: string, parent: string | null, mapped = false): PlaceForMap {
  return {
    id,
    parent_id: parent,
    map_url: mapped ? "https://cdn.test/map.webp" : null,
    grid_calibration: null,
    map_layer_url: null,
    map_layer_stand_url: null,
    map_layer_calibration: null,
    plan_size: null,
  };
}
const index = (...places: PlaceForMap[]) => new Map(places.map((p) => [p.id, p]));

describe("siteOf", () => {
  it("is the place itself when it has a map, even if its parent has one too", () => {
    // Bug caught: always walking up to the outermost map, so a room-sized battle map shows the whole region instead.
    expect(siteOf("room", index(place("room", "dungeon", true), place("dungeon", null, true)))).toBe("room");
  });

  it("finds the site two levels up for a room with no map of its own", () => {
    // Bug caught: only checking the place and its direct parent.
    expect(siteOf("room", index(place("room", "wing"), place("wing", "dungeon"), place("dungeon", null, true)))).toBe("dungeon");
  });

  it("is null when no place on the way up has a map", () => {
    // Bug caught: returning the root (or the place) as a site that has nothing to draw.
    expect(siteOf("room", index(place("room", "town"), place("town", null)))).toBeNull();
  });

  it("is null for no place, and for a place that is not loaded", () => {
    // Bug caught: a throw, or a stale site, while the story has no place or its row is still loading.
    expect(siteOf(null, index())).toBeNull();
    expect(siteOf("ghost", index(place("a", null, true)))).toBeNull();
  });

  it("does not hang on a parent loop", () => {
    // Bug caught: an endless walk (or a wrong hit) when two places name each other as parent.
    expect(siteOf("a", index(place("a", "b"), place("b", "a")))).toBeNull();
  });

  it("finds a map exactly six steps up and gives up at seven", () => {
    // Bug caught: an off-by-one at the step limit, in either direction.
    const chain = (mapAt: string) =>
      index(...["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7"].map((id, i, all) => place(id, all[i + 1] ?? null, id === mapAt)));
    expect(siteOf("p0", chain("p6"))).toBe("p6");
    expect(siteOf("p0", chain("p7"))).toBeNull();
  });
});

describe("goTarget", () => {
  const base = { busy: false, currentRoomId: "a", clickedRoomId: "b", reachable: new Set(["a", "b"]) as ReadonlySet<string> | null };

  it("hands over a reachable other room", () => {
    expect(goTarget(base)).toBe("b");
  });

  it("is null while a turn is being answered", () => {
    // Bug caught: the player walking the party while the narrator is still answering.
    expect(goTarget({ ...base, busy: true })).toBeNull();
  });

  it("is null for the room the party is already in, and for no room", () => {
    // Bug caught: a click inside the current room being told to the story as a move.
    expect(goTarget({ ...base, clickedRoomId: "a" })).toBeNull();
    expect(goTarget({ ...base, clickedRoomId: null })).toBeNull();
  });

  it("is null for a room the doors do not lead to", () => {
    // Bug caught: walking through a locked door by clicking the room behind it.
    expect(goTarget({ ...base, reachable: new Set(["a"]) })).toBeNull();
  });

  it("allows any room when the doors make no claim", () => {
    // Bug caught: a site with no doors drawn locking the party into its first room.
    expect(goTarget({ ...base, reachable: null })).toBe("b");
  });
});
