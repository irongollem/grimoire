import { describe, expect, it } from "vitest";
import { knowersByEntry } from "./useKnownToByEntry";
import type { WorldTie } from "@/lib/worldWeb/ties";

const tie = (over: Partial<WorldTie>): WorldTie => ({
  source: "link", row_id: "r", type: "known_to", from_kind: "canon", from_id: "t1", from_name: "A truth", from_image: null,
  to_kind: "faction", to_id: "f1", to_name: "The Ferrymen", to_image: null, told: null, role: null, status: null, ...over,
});

describe("knowersByEntry", () => {
  it("groups the people and factions that know each truth under that truth", () => {
    const m = knowersByEntry([tie({ row_id: "a" }), tie({ row_id: "b", to_kind: "npc", to_id: "n1", to_name: "Miss Pellam" }), tie({ row_id: "c", from_id: "t2" })]);
    expect(m.get("t1")?.map((k) => k.name)).toEqual(["The Ferrymen", "Miss Pellam"]);
    expect(m.get("t2")?.map((k) => k.rowId)).toEqual(["c"]);
  });

  it("ignores every other tie, so a place a truth is about is never listed as knowing it", () => {
    const m = knowersByEntry([tie({ type: "about", to_kind: "location" }), tie({ from_kind: "npc", from_id: "n1" }), tie({ source: "membership" })]);
    expect(m.size).toBe(0);
  });
});
