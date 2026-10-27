import { describe, expect, it } from "vitest";
import {
  splitLegacyKin,
  sortByHierarchy,
  buildIdMapFromArrays,
  remapKeep,
  remapKeepArr,
  remapOrNull,
  freshId,
} from "@/lib/campaign/campaignSerialization";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("sortByHierarchy", () => {
  it("keeps multiple roots and their subtrees in valid topological order", () => {
    const rows = [
      { id: "a1a", parent_id: "a1" },
      { id: "b1", parent_id: "b" },
      { id: "a1", parent_id: "a" },
      { id: "a", parent_id: null },
      { id: "b", parent_id: null },
    ];
    const sorted = sortByHierarchy(rows, "parent_id");
    const order = sorted.map((r) => r.id);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("a1"));
    expect(order.indexOf("a1")).toBeLessThan(order.indexOf("a1a"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("b1"));
    expect(sorted).toHaveLength(5);
  });

  it("does not drop rows caught in a circular reference", () => {
    const rows = [
      { id: "x", parent_id: "y" },
      { id: "y", parent_id: "x" },
    ];
    const sorted = sortByHierarchy(rows, "parent_id");
    expect(sorted).toHaveLength(2);
    expect(sorted.map((r) => r.id).sort()).toEqual(["x", "y"]);
  });

});

describe("buildIdMapFromArrays", () => {
  it("assigns a unique fresh UUID for every row with an id", () => {
    const map = buildIdMapFromArrays([
      [{ id: "a" }, { id: "b" }],
      [{ id: "c" }],
    ]);
    expect([...map.keys()].sort()).toEqual(["a", "b", "c"]);
    for (const [oldId, newId] of map) {
      expect(newId).not.toBe(oldId);
      expect(newId).toMatch(UUID_RE);
    }
    // All freshly minted ids are distinct.
    expect(new Set(map.values()).size).toBe(3);
  });

  it("skips undefined arrays and rows without an id", () => {
    const map = buildIdMapFromArrays([
      undefined,
      [{ id: "a" }, { name: "no-id-row" }],
    ]);
    expect([...map.keys()]).toEqual(["a"]);
  });
});

describe("remapKeep (preserve-on-miss)", () => {
  const map = new Map([["old", "new"]]);

  it("preserves the original id when not in the map", () => {
    expect(remapKeep("library-ref", map)).toBe("library-ref");
  });

  it("returns null for null/undefined/empty-string ids", () => {
    expect(remapKeep(null, map)).toBeNull();
    expect(remapKeep(undefined, map)).toBeNull();
    expect(remapKeep("", map)).toBeNull();
  });
});

describe("remapKeepArr", () => {
  const map = new Map([["a", "A"]]);

  it("remaps known ids and preserves unknown ones", () => {
    expect(remapKeepArr(["a", "z"], map)).toEqual(["A", "z"]);
  });

  it("never lets an empty entry become null in the list", () => {
    expect(remapKeepArr(["a", ""], map)).toEqual(["A", ""]);
  });

  it("returns [] for non-array input", () => {
    expect(remapKeepArr(null, map)).toEqual([]);
    expect(remapKeepArr(undefined, map)).toEqual([]);
    expect(remapKeepArr("a", map)).toEqual([]);
  });
});

describe("remapOrNull (null-on-miss)", () => {
  const map = new Map([["old", "new"]]);

  it("remaps an id present in the map", () => {
    expect(remapOrNull("old", map)).toBe("new");
  });

  it("returns null when the id is not in the map (entity did not travel)", () => {
    expect(remapOrNull("not-bundled", map)).toBeNull();
  });

  it("returns null for null/undefined/empty-string ids", () => {
    expect(remapOrNull(null, map)).toBeNull();
    expect(remapOrNull(undefined, map)).toBeNull();
    expect(remapOrNull("", map)).toBeNull();
  });
});

describe("freshId", () => {
  it("returns the mapped id when present", () => {
    expect(freshId("old", new Map([["old", "new"]]))).toBe("new");
  });

  it("mints a fresh UUID when the id is absent", () => {
    const minted = freshId("missing", new Map());
    expect(minted).toMatch(UUID_RE);
  });
});

describe("splitLegacyKin (#1083)", () => {
  it("keeps both notes when an old file holds a pair once each way", () => {
    const out = splitLegacyKin(
      [],
      [
        { id: "1", npc_id: "a", related_npc_id: "b", relationship_type: "sibling", notes: "cousin" },
        { id: "2", npc_id: "b", related_npc_id: "a", relationship_type: "family", notes: "her late husband's nephew" },
      ],
      [],
    );
    expect(out.kin).toHaveLength(1);
    expect(out.kin[0]).toMatchObject({ note: "cousin / her late husband's nephew", kind: "relative", needs_sorting: true });
  });

  it("turns a bond type the tables no longer accept into a contact", () => {
    const out = splitLegacyKin(
      [],
      [{ id: "1", npc_id: "a", related_npc_id: "b", relationship_type: "bestie" }],
      [{ id: "n", npc_id: "a", party_member_id: "p", relationship_type: "nemesis" }],
    );
    expect(out.bonds[0].relationship_type).toBe("contact");
    expect(out.pcNotes[0].relationship_type).toBe("contact");
  });

  it("turns family and sibling bonds into kin, keeps other bonds, and softens PC notes to contact", () => {
    const out = splitLegacyKin(
      [],
      [
        { id: "1", npc_id: "a", related_npc_id: "b", relationship_type: "family", notes: "cousins" },
        { id: "2", npc_id: "b", related_npc_id: "c", relationship_type: "sibling" },
        { id: "3", npc_id: "a", related_npc_id: "c", relationship_type: "ally" },
      ],
      [{ id: "n", npc_id: "a", party_member_id: "p", relationship_type: "family" }],
    );
    expect(out.bonds.map((b) => b.id)).toEqual(["3"]);
    expect(out.pcNotes[0].relationship_type).toBe("contact");
    expect(out.kin.map((k) => [k.kind, k.needs_sorting, k.from_npc_id])).toEqual([
      ["relative", true, "a"],
      ["sibling", false, "b"],
      ["relative", true, "a"],
    ]);
    expect(out.kin[2].to_party_member_id).toBe("p");
  });

  it.each(["chosen_family", "friend", "ally", "rival", "enemy", "lover", "mentor", "apprentice", "subordinate", "superior", "contact", "former_ally", "former_enemy"])(
    "keeps the bond type %s the table still accepts (20261022113302)",
    (type) => {
      const out = splitLegacyKin([], [{ id: "1", npc_id: "a", related_npc_id: "b", relationship_type: type }], []);
      expect(out.bonds[0].relationship_type).toBe(type);
    },
  );

  it("keeps a pair written as a sibling both ways a sibling, and makes a sibling-then-family pair an unsorted relative", () => {
    const sibs = splitLegacyKin([], [
      { id: "1", npc_id: "a", related_npc_id: "b", relationship_type: "sibling" },
      { id: "2", npc_id: "b", related_npc_id: "a", relationship_type: "sibling" },
    ], []);
    expect(sibs.kin).toHaveLength(1);
    expect(sibs.kin[0]).toMatchObject({ kind: "sibling", needs_sorting: false });

    const mixed = splitLegacyKin([], [
      { id: "1", npc_id: "a", related_npc_id: "b", relationship_type: "sibling" },
      { id: "2", npc_id: "b", related_npc_id: "a", relationship_type: "family" },
    ], []);
    expect(mixed.kin[0]).toMatchObject({ kind: "relative", needs_sorting: true });
  });

  it("carries the AI provenance of a legacy bond onto its kin link", () => {
    const out = splitLegacyKin([], [{ id: "1", npc_id: "a", related_npc_id: "b", relationship_type: "family", ai_provenance: { model: "x" } }], []);
    expect(out.kin[0].ai_provenance).toEqual({ model: "x" });
  });

  it("keeps an existing link for a pair, whichever way round the old bond was written", () => {
    const out = splitLegacyKin(
      [{ id: "k", from_npc_id: "b", to_npc_id: "a", kind: "parent" }],
      [{ id: "1", npc_id: "a", related_npc_id: "b", relationship_type: "family" }],
      [],
    );
    expect(out.kin).toHaveLength(1);
    expect(out.kin[0].id).toBe("k");
  });
});
