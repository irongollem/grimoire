import { describe, it, expect } from "vitest";
import { assembleTieExtras } from "./embedTies";
import { tieNameKey } from "./entityEmbedText";

const names = new Map([
  // Brenna is deliberately unnamed here, so Harl's reverse tie to her is dropped rather than guessed.
  [tieNameKey("npc", "harl"), "Harl the Toll-man"],
  [tieNameKey("location", "ford"), "Fordwatch"],
  [tieNameKey("faction", "concord"), "The Iron Concord"],
  [tieNameKey("deity", "lady"), "The Drowned Lady"],
]);

describe("assembleTieExtras", () => {
  it("gives an NPC home, membership and ties, each only for that NPC", () => {
    const out = assembleTieExtras(
      "npc",
      [{ id: "brenna", location_id: "ford" }, { id: "harl", location_id: null }],
      [
        { from_kind: "npc", from_id: "brenna", to_kind: "deity", to_id: "lady", type: "worships" },
        { from_kind: "npc", from_id: "brenna", to_kind: "npc", to_id: "harl", type: "rival" },
      ],
      names,
      [{ npc_id: "brenna", faction_id: "concord", role: "captain" }],
      [],
    );
    expect(out.get("brenna")).toEqual({
      ties: ["rival of Harl the Toll-man", "worships The Drowned Lady"],
      home: "Fordwatch",
      memberships: [{ faction: "The Iron Concord", role: "captain" }],
    });
    expect(out.get("harl")).toEqual({ ties: [], home: null, memberships: [] });
  });

  it("reads a faction's seat and a location's seat-of", () => {
    const faction = assembleTieExtras("faction", [{ id: "concord", seat_location_id: "ford" }], [], names, [], []);
    expect(faction.get("concord")?.seat).toBe("Fordwatch");
    const location = assembleTieExtras("location", [{ id: "ford" }], [], names, [], [{ faction_id: "concord", location_id: "ford" }]);
    expect(location.get("ford")?.seatOf).toEqual(["The Iron Concord"]);
  });
});
