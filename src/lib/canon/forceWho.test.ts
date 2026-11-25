import { describe, expect, it } from "vitest";
import type { Connection } from "@/types/connections.types";
import { forceWhoMap, isWhoTie, whoLine, whoPath } from "./forceWho";

const tie = (over: Partial<Connection> = {}): Connection => ({
  source: "link", row_id: "r", type: "about", outward: true, other_kind: "npc", other_id: "n1", other_name: "Vexa", other_image: null,
  note: null, told: null, player_visible_to: null, ai_provenance: null, role: null, status: null, ...over,
});

describe("isWhoTie", () => {
  // Bug caught (#1279 item 11): a tie that is not the force's who hidden from Connections (a place it is about, a link read from the far end, a known_to).
  it.each([
    [tie(), true],
    [tie({ other_kind: "faction" }), true],
    [tie({ other_kind: "deity" }), true],
    [tie({ other_kind: "location" }), false],
    [tie({ other_kind: "party_member" }), false],
    [tie({ outward: false }), false],
    [tie({ type: "known_to" }), false],
    [tie({ source: "membership" }), false],
  ])("%#", (c, expected) => expect(isWhoTie(c)).toBe(expected));
});

describe("forceWhoMap", () => {
  const names = new Map([["faction:a", "The Ferrymen (renamed)"], ["npc:b", "Vexa"]]);
  // Bug caught: a renamed record read under its old name, a gone one drawn as a blank, or a kind's id matched against another kind's.
  it("reads names as they are now, in link order, and leaves out a record that is gone or of another kind", () => {
    const map = forceWhoMap(
      [{ force_id: "f1", kind: "faction", id: "a" }, { force_id: "f1", kind: "npc", id: "b" }, { force_id: "f1", kind: "npc", id: "gone" }, { force_id: "f2", kind: "npc", id: "a" }],
      names,
    );
    expect(map.get("f1")).toEqual([{ kind: "faction", id: "a", name: "The Ferrymen (renamed)" }, { kind: "npc", id: "b", name: "Vexa" }]);
    expect(map.has("f2")).toBe(false);
  });
});

describe("whoLine and whoPath", () => {
  const w = (name: string) => ({ kind: "npc" as const, id: "i", name });
  it("joins one, two and three names as a sentence", () => {
    expect(whoLine([])).toBe("");
    expect(whoLine([w("A")])).toBe("A");
    expect(whoLine([w("A"), w("B")])).toBe("A and B");
    expect(whoLine([w("A"), w("B"), w("C")])).toBe("A, B and C");
  });
  // Bug caught: a god or a faction linking to the NPC route.
  it("links each kind to its own page", () => {
    expect(whoPath({ kind: "npc", id: "1", name: "" })).toBe("/npcs/1");
    expect(whoPath({ kind: "faction", id: "1", name: "" })).toBe("/factions/1");
    expect(whoPath({ kind: "deity", id: "1", name: "" })).toBe("/deities/1");
  });
});
