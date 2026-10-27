import { beforeEach, describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake, type SupabaseFake } from "@/test/supabaseFake";
import { assembleTieExtras, loadTieExtras } from "./embedTies";
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

describe("loadTieExtras", () => {
  let fake: SupabaseFake;
  const client = () => fake.client as unknown as SupabaseClient;

  beforeEach(() => {
    fake = createSupabaseFake();
    fake.seed("npcs", [
      { id: "brenna", name: "Brenna", location_id: "ford" },
      { id: "harl", name: "Harl the Toll-man", location_id: null },
    ]);
    fake.seed("locations", [{ id: "ford", name: "Fordwatch" }]);
    fake.seed("factions", [
      { id: "concord", name: "The Iron Concord", seat_location_id: "ford" },
      { id: "ferrymen", name: "The Ferrymen", seat_location_id: null },
    ]);
    fake.seed("deities", [{ id: "lady", name: "The Drowned Lady" }]);
  });

  it("counts only Active memberships: a retired or expelled member is not in the faction any more", async () => {
    fake.seed("faction_npcs", [
      { npc_id: "brenna", faction_id: "concord", role: "captain", status: "Active" },
      { npc_id: "brenna", faction_id: "ferrymen", role: null, status: "Retired" },
    ]);
    const out = await loadTieExtras(client(), "npc", [{ id: "brenna", location_id: "ford" }]);
    expect(out.get("brenna")?.memberships).toEqual([{ faction: "The Iron Concord", role: "captain" }]);
  });

  it("words a link from whichever end the subject stands on, and not another row's links", async () => {
    fake.seed("world_links", [
      { id: "l1", from_kind: "npc", from_id: "brenna", to_kind: "deity", to_id: "lady", type: "worships" },
      { id: "l2", from_kind: "npc", from_id: "harl", to_kind: "npc", to_id: "brenna", type: "mentor_of" },
      // Between two rows that are not in this load.
      { id: "l3", from_kind: "npc", from_id: "stranger", to_kind: "deity", to_id: "lady", type: "worships" },
    ]);
    const out = await loadTieExtras(client(), "npc", [{ id: "brenna", location_id: "ford" }]);
    expect(out.get("brenna")?.ties).toEqual(["apprentice of Harl the Toll-man", "worships The Drowned Lady"]);
  });

  it("reads past one page of links, so a hub row's later links are not silently lost", async () => {
    // 1,000 is PostgREST's page size. The one link that sorts first once worded sits on page two.
    const filler = Array.from({ length: 1000 }, (_, i) => ({
      id: `a${String(i).padStart(4, "0")}`,
      from_kind: "npc",
      from_id: "brenna",
      to_kind: "deity",
      to_id: "lady",
      type: "worships",
    }));
    fake.seed("world_links", [
      ...filler,
      { id: "z-last", from_kind: "npc", from_id: "brenna", to_kind: "npc", to_id: "harl", type: "friend" },
    ]);
    const out = await loadTieExtras(client(), "npc", [{ id: "brenna", location_id: null }]);
    expect(out.get("brenna")?.ties).toContain("friend of Harl the Toll-man");
  });

  it("gives a place the factions seated in it, and only those", async () => {
    const out = await loadTieExtras(client(), "location", [{ id: "ford" }]);
    expect(out.get("ford")?.seatOf).toEqual(["The Iron Concord"]);
  });

  it("reads nothing for no rows", async () => {
    fake.failNext("world_links", { message: "must not be read" });
    await expect(loadTieExtras(client(), "npc", [])).resolves.toEqual(new Map());
  });
});
