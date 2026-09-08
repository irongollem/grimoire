import { describe, it, expect } from "vitest";
import { doorsFromRoomPerspective } from "./useLocationDoors";
import type { LocationDoorWithRooms } from "./useLocationDoors";

function door(overrides: Partial<LocationDoorWithRooms> = {}): LocationDoorWithRooms {
  return {
    id: "door-1",
    user_id: "u",
    from_location_id: "room-a",
    to_location_id: "room-b",
    label: "",
    is_one_way: false,
    starts_locked: false,
    lock_note: null,
    is_secret: false,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    from_location: { id: "room-a", name: "Flooded Nave" },
    to_location: { id: "room-b", name: "Reliquary" },
    ...overrides,
  };
}

describe("doorsFromRoomPerspective", () => {
  it("shows an outgoing door as leading to its `to` room", () => {
    const rows = [door({ id: "d1", from_location_id: "room-a", to_location_id: "room-b" })];
    const views = doorsFromRoomPerspective(rows, "room-a");
    expect(views).toEqual([
      { door: rows[0], otherRoomId: "room-b", otherRoomName: "Reliquary" },
    ]);
  });

  it("shows a bidirectional incoming door as leading to its `from` room", () => {
    const rows = [
      door({
        id: "d2",
        from_location_id: "room-b",
        to_location_id: "room-a",
        is_one_way: false,
        from_location: { id: "room-b", name: "Reliquary" },
        to_location: { id: "room-a", name: "Flooded Nave" },
      }),
    ];
    const views = doorsFromRoomPerspective(rows, "room-a");
    expect(views).toEqual([
      { door: rows[0], otherRoomId: "room-b", otherRoomName: "Reliquary" },
    ]);
  });

  it("drops a one-way door that leads INTO this room — not a way out of it", () => {
    const rows = [
      door({
        id: "d3",
        from_location_id: "room-b",
        to_location_id: "room-a",
        is_one_way: true,
      }),
    ];
    expect(doorsFromRoomPerspective(rows, "room-a")).toEqual([]);
  });

  it("keeps a one-way door that leads OUT of this room", () => {
    const rows = [door({ id: "d4", from_location_id: "room-a", to_location_id: "room-b", is_one_way: true })];
    const views = doorsFromRoomPerspective(rows, "room-a");
    expect(views).toHaveLength(1);
    expect(views[0].otherRoomId).toBe("room-b");
  });

  it("ignores a row that doesn't touch this room at all", () => {
    const rows = [door({ id: "d5", from_location_id: "room-x", to_location_id: "room-y" })];
    expect(doorsFromRoomPerspective(rows, "room-a")).toEqual([]);
  });

  it("falls back to '???' when the joined room name is missing", () => {
    const rows = [door({ id: "d6", from_location_id: "room-a", to_location_id: "room-b", to_location: null })];
    const views = doorsFromRoomPerspective(rows, "room-a");
    expect(views[0].otherRoomName).toBe("???");
  });

  it("sorts by sort_order (nulls last), then by the other room's name", () => {
    const rows = [
      door({
        id: "unordered-charlie",
        from_location_id: "room-a",
        to_location_id: "room-c",
        sort_order: null,
        to_location: { id: "room-c", name: "Charlie" },
      }),
      door({
        id: "ordered-2",
        from_location_id: "room-a",
        to_location_id: "room-d",
        sort_order: 2,
        to_location: { id: "room-d", name: "Delta" },
      }),
      door({
        id: "unordered-alpha",
        from_location_id: "room-a",
        to_location_id: "room-e",
        sort_order: null,
        to_location: { id: "room-e", name: "Alpha" },
      }),
      door({
        id: "ordered-1",
        from_location_id: "room-a",
        to_location_id: "room-f",
        sort_order: 1,
        to_location: { id: "room-f", name: "Foxtrot" },
      }),
    ];
    const views = doorsFromRoomPerspective(rows, "room-a");
    expect(views.map((v) => v.door.id)).toEqual([
      "ordered-1",
      "ordered-2",
      "unordered-alpha",
      "unordered-charlie",
    ]);
  });

  it("merges outgoing and bidirectional-incoming doors into one list", () => {
    const rows = [
      door({ id: "out", from_location_id: "room-a", to_location_id: "room-b" }),
      door({
        id: "in",
        from_location_id: "room-c",
        to_location_id: "room-a",
        is_one_way: false,
        from_location: { id: "room-c", name: "Crypt" },
        to_location: { id: "room-a", name: "Flooded Nave" },
      }),
      door({ id: "one-way-in", from_location_id: "room-d", to_location_id: "room-a", is_one_way: true }),
    ];
    const views = doorsFromRoomPerspective(rows, "room-a");
    expect(views.map((v) => v.door.id).sort()).toEqual(["in", "out"]);
  });
});
