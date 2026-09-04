import { describe, it, expect } from "vitest";
import { partyRoomInSite, reachableRoomIds } from "./siteRun";
import type { DoorEdge } from "./siteRun";

function door(overrides: Partial<DoorEdge> = {}): DoorEdge {
  return {
    from_location_id: "room-a",
    to_location_id: "room-b",
    is_one_way: false,
    starts_locked: false,
    ...overrides,
  };
}

describe("partyRoomInSite", () => {
  it("is null when the campaign has no location at all", () => {
    expect(partyRoomInSite(null, ["room-a", "room-b"])).toBeNull();
  });

  it("is null when the party is at the site itself, not one of its rooms", () => {
    expect(partyRoomInSite("site-id", ["room-a", "room-b"])).toBeNull();
  });

  it("is null when the party is somewhere else entirely", () => {
    expect(partyRoomInSite("some-other-location", ["room-a", "room-b"])).toBeNull();
  });

  it("is the room id when the party is in one of this site's rooms", () => {
    expect(partyRoomInSite("room-b", ["room-a", "room-b"])).toBe("room-b");
  });
});

describe("reachableRoomIds", () => {
  it("always includes the starting room, even with no doors at all", () => {
    expect(reachableRoomIds("room-a", [])).toEqual(new Set(["room-a"]));
  });

  it("reaches a room across an unlocked bidirectional door, from either side", () => {
    const doors = [door({ from_location_id: "room-a", to_location_id: "room-b" })];
    expect(reachableRoomIds("room-a", doors)).toEqual(new Set(["room-a", "room-b"]));
    expect(reachableRoomIds("room-b", doors)).toEqual(new Set(["room-a", "room-b"]));
  });

  it("does not cross a starts_locked door", () => {
    const doors = [door({ starts_locked: true })];
    expect(reachableRoomIds("room-a", doors)).toEqual(new Set(["room-a"]));
  });

  it("a locked door blocks both directions, not just the authored one", () => {
    const doors = [door({ from_location_id: "room-a", to_location_id: "room-b", starts_locked: true })];
    expect(reachableRoomIds("room-b", doors)).toEqual(new Set(["room-b"]));
  });

  it("a one-way door only reaches forward", () => {
    const doors = [door({ from_location_id: "room-a", to_location_id: "room-b", is_one_way: true })];
    expect(reachableRoomIds("room-a", doors)).toEqual(new Set(["room-a", "room-b"]));
    expect(reachableRoomIds("room-b", doors)).toEqual(new Set(["room-b"]));
  });

  it("chains reachability across multiple rooms", () => {
    const doors = [
      door({ from_location_id: "room-a", to_location_id: "room-b" }),
      door({ from_location_id: "room-b", to_location_id: "room-c" }),
    ];
    expect(reachableRoomIds("room-a", doors)).toEqual(new Set(["room-a", "room-b", "room-c"]));
  });

  it("a locked door part-way down a chain cuts off everything past it", () => {
    const doors = [
      door({ from_location_id: "room-a", to_location_id: "room-b" }),
      door({ from_location_id: "room-b", to_location_id: "room-c", starts_locked: true }),
    ];
    expect(reachableRoomIds("room-a", doors)).toEqual(new Set(["room-a", "room-b"]));
  });

  it("a room with no door to it at all is simply absent from the set", () => {
    const doors = [door({ from_location_id: "room-a", to_location_id: "room-b" })];
    expect(reachableRoomIds("room-a", doors).has("room-isolated")).toBe(false);
  });
});
