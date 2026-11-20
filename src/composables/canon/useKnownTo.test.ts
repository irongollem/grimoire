import { describe, expect, it } from "vitest";
import { knownToOf } from "./useKnownTo";
import type { Connection } from "@/types/connections.types";

const conn = (over: Partial<Connection>): Connection => ({
  source: "link", row_id: "r", type: "known_to", outward: true, other_kind: "npc", other_id: "n1", other_name: "Miss Pellam",
  other_image: null, note: null, told: null, player_visible_to: null, ai_provenance: null, role: null, status: null, ...over,
});

describe("knownToOf", () => {
  it("keeps who knows a truth and drops its other ties, so 'Known to' never lists a place the truth is about", () => {
    const rows = [conn({ row_id: "a" }), conn({ row_id: "b", type: "about", other_kind: "location" })];
    expect(knownToOf(rows).map((c) => c.row_id)).toEqual(["a"]);
  });

  it("drops a known_to read from the far end, which would be a truth that knows someone", () => {
    expect(knownToOf([conn({ outward: false })])).toEqual([]);
  });
});
