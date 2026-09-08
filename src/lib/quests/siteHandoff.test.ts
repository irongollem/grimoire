import { describe, it, expect } from "vitest";
import { isRoomUnwritten, unwrittenRoomIds, roomRowCaption, roomOrdinal, roomsWithHeldLoot } from "./siteHandoff";

function tiptap(text: string): string {
  return JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
}

describe("isRoomUnwritten", () => {
  it("is true for a null description", () => {
    expect(isRoomUnwritten(null)).toBe(true);
  });

  it("is true for an empty Tiptap doc with no text nodes", () => {
    expect(isRoomUnwritten(JSON.stringify({ type: "doc", content: [] }))).toBe(true);
  });

  it("is false the moment there is any authored text at all", () => {
    expect(isRoomUnwritten(tiptap("A"))).toBe(false);
  });
});

describe("unwrittenRoomIds", () => {
  it("collects only the rooms with no content", () => {
    const rooms = [
      { id: "r1", description: tiptap("Athletics DC 12") },
      { id: "r2", description: null },
      { id: "r3", description: JSON.stringify({ type: "doc", content: [] }) },
    ];
    expect(unwrittenRoomIds(rooms)).toEqual(new Set(["r2", "r3"]));
  });

  it("is empty when every room has content", () => {
    const rooms = [{ id: "r1", description: tiptap("Something") }];
    expect(unwrittenRoomIds(rooms)).toEqual(new Set());
  });
});

describe("roomRowCaption", () => {
  it("is just the description text when not cleared", () => {
    expect(roomRowCaption(tiptap("Encounter · 4 sodden husks"), false)).toBe("Encounter · 4 sodden husks");
  });

  it("appends ' · cleared' once the room is cleared", () => {
    expect(roomRowCaption(tiptap("Athletics DC 12"), true)).toBe("Athletics DC 12 · cleared");
  });

  it("falls back to the bare word 'Cleared' for a cleared room with no description text", () => {
    expect(roomRowCaption(null, true)).toBe("Cleared");
  });

  it("is empty for an unwritten, uncleared room", () => {
    expect(roomRowCaption(null, false)).toBe("");
  });
});

describe("roomOrdinal", () => {
  const order = ["room-a", "room-b", "room-c"];

  it("is null when the party has no current room in this site", () => {
    expect(roomOrdinal(null, order)).toBeNull();
  });

  it("is null when the current room id isn't one of this site's own rooms", () => {
    expect(roomOrdinal("some-other-room", order)).toBeNull();
  });

  it("is the 1-based position in the site's own order", () => {
    expect(roomOrdinal("room-a", order)).toBe(1);
    expect(roomOrdinal("room-c", order)).toBe(3);
  });
});

describe("roomsWithHeldLoot", () => {
  it("flags a room with held loot", () => {
    const loot = [{ location_id: "room-a", delivery_state: "held" as const }];
    expect(roomsWithHeldLoot(loot)).toEqual(new Set(["room-a"]));
  });

  it("does not flag loot that has already been dropped to chat", () => {
    const loot = [{ location_id: "room-a", delivery_state: "chat" as const }];
    expect(roomsWithHeldLoot(loot)).toEqual(new Set());
  });

  it("ignores loot with no location home (beat-anchored loot)", () => {
    const loot = [{ location_id: null, delivery_state: "held" as const }];
    expect(roomsWithHeldLoot(loot)).toEqual(new Set());
  });
});
