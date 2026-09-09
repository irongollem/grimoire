import { describe, it, expect } from "vitest";
import {
  doorsFromRoomPerspective,
  doorsOfSpace,
  verticalWays,
  doorTitle,
  doorSubtitle,
  type DoorPerspectiveRow,
} from "./doors";

function row(overrides: Partial<DoorPerspectiveRow> = {}): DoorPerspectiveRow {
  return {
    from_location_id: "room-a",
    to_location_id: "room-b",
    is_one_way: false,
    sort_order: null,
    from_location: { id: "room-a", name: "Flooded Nave" },
    to_location: { id: "room-b", name: "Reliquary" },
    ...overrides,
  };
}

describe("doorsFromRoomPerspective", () => {
  it("shows an outgoing door as leading to its `to` room", () => {
    const rows = [row({ from_location_id: "room-a", to_location_id: "room-b" })];
    expect(doorsFromRoomPerspective(rows, "room-a")).toEqual([
      { door: rows[0], otherRoomId: "room-b", otherRoomName: "Reliquary" },
    ]);
  });

  it("shows a bidirectional incoming door as leading to its `from` room", () => {
    const rows = [
      row({
        from_location_id: "room-b",
        to_location_id: "room-a",
        is_one_way: false,
        from_location: { id: "room-b", name: "Reliquary" },
        to_location: { id: "room-a", name: "Flooded Nave" },
      }),
    ];
    expect(doorsFromRoomPerspective(rows, "room-a")).toEqual([
      { door: rows[0], otherRoomId: "room-b", otherRoomName: "Reliquary" },
    ]);
  });

  it("drops a one-way door that leads INTO this room — not a way out of it", () => {
    const rows = [row({ from_location_id: "room-b", to_location_id: "room-a", is_one_way: true })];
    expect(doorsFromRoomPerspective(rows, "room-a")).toEqual([]);
  });

  it("keeps a one-way door that leads OUT of this room", () => {
    const rows = [row({ from_location_id: "room-a", to_location_id: "room-b", is_one_way: true })];
    const views = doorsFromRoomPerspective(rows, "room-a");
    expect(views).toHaveLength(1);
    expect(views[0].otherRoomId).toBe("room-b");
  });

  it("ignores a row that doesn't touch this room at all", () => {
    const rows = [row({ from_location_id: "room-x", to_location_id: "room-y" })];
    expect(doorsFromRoomPerspective(rows, "room-a")).toEqual([]);
  });

  it("falls back to '???' when the joined room name is missing", () => {
    const rows = [row({ from_location_id: "room-a", to_location_id: "room-b", to_location: null })];
    expect(doorsFromRoomPerspective(rows, "room-a")[0].otherRoomName).toBe("???");
  });

  it("sorts by sort_order (nulls last), then by the other room's name", () => {
    const rows = [
      row({ to_location_id: "room-c", sort_order: null, to_location: { id: "room-c", name: "Charlie" } }),
      row({ to_location_id: "room-d", sort_order: 2, to_location: { id: "room-d", name: "Delta" } }),
      row({ to_location_id: "room-e", sort_order: null, to_location: { id: "room-e", name: "Alpha" } }),
      row({ to_location_id: "room-f", sort_order: 1, to_location: { id: "room-f", name: "Foxtrot" } }),
    ];
    const views = doorsFromRoomPerspective(rows, "room-a");
    expect(views.map((v) => v.otherRoomName)).toEqual(["Foxtrot", "Delta", "Alpha", "Charlie"]);
  });

  it("merges outgoing and bidirectional-incoming doors into one list", () => {
    const rows = [
      row({ from_location_id: "room-a", to_location_id: "room-b" }),
      row({
        from_location_id: "room-c",
        to_location_id: "room-a",
        is_one_way: false,
        from_location: { id: "room-c", name: "Crypt" },
        to_location: { id: "room-a", name: "Flooded Nave" },
      }),
      row({ from_location_id: "room-d", to_location_id: "room-a", is_one_way: true }),
    ];
    const views = doorsFromRoomPerspective(rows, "room-a");
    expect(views.map((v) => v.otherRoomName).sort()).toEqual(["Crypt", "Reliquary"]);
  });
});

describe("doorsOfSpace", () => {
  it("is the same merge as doorsFromRoomPerspective, for a space that may be a nested site", () => {
    const rows = [row({ from_location_id: "level-2", to_location_id: "room-b" })];
    expect(doorsOfSpace(rows, "level-2")).toEqual(doorsFromRoomPerspective(rows, "level-2"));
  });
});

describe("verticalWays", () => {
  it("keeps only stair and shaft kinds", () => {
    const doors = [
      { door_kind: "door" as const },
      { door_kind: "stair" as const },
      { door_kind: "arch" as const },
      { door_kind: "shaft" as const },
      { door_kind: "portal" as const },
    ];
    expect(verticalWays(doors).map((d) => d.door_kind)).toEqual(["stair", "shaft"]);
  });

  it("returns an empty list when nothing is vertical", () => {
    expect(verticalWays([{ door_kind: "door" as const }, { door_kind: "arch" as const }])).toEqual([]);
  });
});

describe("doorTitle", () => {
  const names = new Map([
    ["nave", "Nave"],
    ["cell", "Abbot's Cell"],
    ["stair", "Drowned Stair"],
    ["vault", "Sunken Vault"],
  ]);

  it("joins two spaces with a right arrow for a horizontal kind", () => {
    expect(doorTitle({ from_location_id: "nave", to_location_id: "cell", door_kind: "door" }, names)).toBe(
      "Nave → Abbot's Cell",
    );
  });

  it("joins two spaces with a down arrow for a vertical kind", () => {
    expect(doorTitle({ from_location_id: "stair", to_location_id: "vault", door_kind: "stair" }, names)).toBe(
      "Drowned Stair ↓ Sunken Vault",
    );
  });

  it("falls back to '???' for a space id not in the map", () => {
    expect(doorTitle({ from_location_id: "nave", to_location_id: "unknown", door_kind: "door" }, names)).toBe(
      "Nave → ???",
    );
  });
});

describe("doorSubtitle", () => {
  function subtitleRow(overrides: Partial<import("./doors").DoorSubtitleRow> = {}): import("./doors").DoorSubtitleRow {
    return {
      door_kind: "door",
      is_secret: false,
      starts_locked: false,
      lock_note: null,
      label: "",
      is_one_way: false,
      ...overrides,
    };
  }

  it("leads with Secret and the label when the door is secret", () => {
    expect(subtitle({ is_secret: true, label: "behind the ash-screen" })).toBe("Secret · behind the ash-screen");
  });

  it("leads with Locked and the lock note when the door starts locked", () => {
    expect(subtitle({ starts_locked: true, lock_note: "the brass key" })).toBe("Locked · the brass key");
  });

  it("leads with the kind label and the door's label otherwise, for a horizontal kind", () => {
    expect(subtitle({ door_kind: "door", label: "iron grille" })).toBe("Door · iron grille");
  });

  it("prefers Secret over Locked when a door is both", () => {
    expect(subtitle({ is_secret: true, starts_locked: true, lock_note: "a key", label: "a note" })).toBe(
      "Secret · a note",
    );
  });

  it("omits the separator when there is no free-text detail", () => {
    expect(subtitle({ is_secret: true, label: "" })).toBe("Secret");
    expect(subtitle({ starts_locked: true, lock_note: null })).toBe("Locked");
    expect(subtitle({ door_kind: "arch", label: "" })).toBe("Arch");
  });

  it("names a two-way vertical kind's climb direction alongside its label", () => {
    expect(subtitle({ door_kind: "stair", is_one_way: false, label: "flooded at the base" })).toBe(
      "Stair · two-way · flooded at the base",
    );
  });

  it("names a one-way vertical kind's climb direction alongside its label", () => {
    expect(subtitle({ door_kind: "shaft", is_one_way: true, label: "40 ft, no climb" })).toBe(
      "Shaft · one-way · 40 ft, no climb",
    );
  });

  it("still names the climb direction for a vertical kind with no label", () => {
    expect(subtitle({ door_kind: "stair", is_one_way: false, label: "" })).toBe("Stair · two-way");
  });

  function subtitle(overrides: Partial<import("./doors").DoorSubtitleRow>): string {
    return doorSubtitle(subtitleRow(overrides));
  }
});
