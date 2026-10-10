import { describe, expect, it } from "vitest";
import { buildRoomFillConstraints, neighboursOf, normalizeRoomFill, roomFillToTiptap } from "./roomFill";
import type { RoomFillDoorEdge, RoomNeighbour } from "./roomFill";
import type { Location } from "@/types/location.types";

function tiptap(text: string): string {
  return JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
}
function loc(id: string, name: string, extra: Partial<Location> = {}): Location {
  return { id, name, location_type: "room", description: null, ...extra } as Location;
}

describe("buildRoomFillConstraints", () => {
  const site = loc("s", "Ashen Keep", { location_type: "dungeon", description: tiptap("A ruined fortress.") });
  const room = loc("r1", "Armoury");
  const exit: RoomNeighbour = { name: "Hall", kind: "door", label: "", locked: true, lockNote: "iron key", secret: false };

  it("names the site, level, room, exits and siblings", () => {
    const lines = buildRoomFillConstraints({
      site, level: { name: "Crypt", ordinal: 2, total: 3 }, room, neighbours: [exit],
      siblings: [room, loc("r2", "Hall"), loc("r3", "Well")],
    });
    expect(lines).toContain("Site: Ashen Keep (dungeon) — A ruined fortress.");
    expect(lines).toContain("Level: Crypt (floor 2 of 3)");
    expect(lines).toContain("Room: Armoury");
    expect(lines).toContain("Exits: Hall via door, locked: iron key");
    expect(lines).toContain("Other rooms on this level: Hall, Well");
  });

  it("flags secret exits as DM-only and says when there are none", () => {
    const secret = buildRoomFillConstraints({ site, level: null, room, neighbours: [{ ...exit, locked: false, secret: true, label: "bookcase" }], siblings: [] });
    expect(secret.find((l) => l.startsWith("Exits"))).toBe('Exits: Hall via door "bookcase", secret, DM-only');
    const none = buildRoomFillConstraints({ site, level: null, room, neighbours: [], siblings: [] });
    expect(none.find((l) => l.startsWith("Exits"))).toContain("none recorded");
  });

  it("stays inside the edge function's limits", () => {
    const many = Array.from({ length: 80 }, (_, i) => loc(`x${i}`, `Chamber number ${i} of the deep`));
    const lines = buildRoomFillConstraints({ site: loc("s", "S", { description: tiptap("x".repeat(900)) }), level: null, room, neighbours: [], siblings: many });
    expect(lines.length).toBeLessThanOrEqual(12);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(400);
  });
});

describe("neighboursOf", () => {
  const base = { is_one_way: false, door_kind: "door", label: "", starts_locked: false, lock_note: null, is_secret: false } as const;
  const a = { id: "a", name: "A" };
  const b = { id: "b", name: "B" };
  it("follows outgoing doors and two-way incoming ones, not one-way incoming", () => {
    const doors: RoomFillDoorEdge[] = [
      { ...base, from_location_id: "a", to_location_id: "b", from_location: a, to_location: b },
      { ...base, from_location_id: "b", to_location_id: "a", from_location: b, to_location: a, is_one_way: true },
      { ...base, from_location_id: "b", to_location_id: "a", from_location: b, to_location: a, door_kind: "stair" },
      { ...base, from_location_id: "a", to_location_id: null, from_location: a, to_location: null },
    ];
    expect(neighboursOf("a", doors).map((n) => [n.name, n.kind])).toEqual([["B", "door"], ["B", "stair"], ["untraced space", "door"]]);
  });
});

describe("normalizeRoomFill", () => {
  it("trims, drops non-strings and caps features", () => {
    const fill = normalizeRoomFill({ read_aloud: " Dust. ", description: "Old.", features: ["a", 3, "", " b ", ...Array(10).fill("c")] });
    expect(fill.readAloud).toBe("Dust.");
    expect(fill.features.slice(0, 2)).toEqual(["a", "b"]);
    expect(fill.features).toHaveLength(8);
  });
  it("throws a readable error when unusable", () => {
    expect(() => normalizeRoomFill(null)).toThrow(/did not return a room/);
    expect(() => normalizeRoomFill({ read_aloud: 5, features: ["x"] })).toThrow(/empty room/);
  });
});

describe("roomFillToTiptap", () => {
  it("builds blockquote, paragraphs, then a bullet list", () => {
    const doc = JSON.parse(roomFillToTiptap({ readAloud: "You enter.", description: "One.\n\nTwo.", features: ["Trap"] }));
    expect(doc.content.map((n: { type: string }) => n.type)).toEqual(["blockquote", "paragraph", "paragraph", "bulletList"]);
    expect(doc.content[3].content[0]).toEqual({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Trap" }] }] });
  });
  it("omits empty parts", () => {
    const doc = JSON.parse(roomFillToTiptap({ readAloud: "", description: "Only.", features: [] }));
    expect(doc.content).toHaveLength(1);
  });
});
