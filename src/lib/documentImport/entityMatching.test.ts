import { describe, expect, it } from "vitest";
import {
  matchEntitiesByName,
  normalizeItemMatchRows,
  normalizeMonsterMatchRows,
  type RawMatchRow,
} from "./entityMatching";

describe("normalizeMonsterMatchRows", () => {
  it("reads a campaign match from monster_id and drops library_monster_id", () => {
    const rows = normalizeMonsterMatchRows([
      {
        query_name: "Icewind kobold",
        monster_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        library_monster_id: null,
        source: "campaign",
        matched_name: "Kobold",
        match_kind: "contains",
      },
    ]);
    expect(rows).toEqual([
      {
        queryName: "Icewind kobold",
        match: {
          targetId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          source: "campaign",
          matchedName: "Kobold",
          matchKind: "contains",
        },
      },
    ]);
  });

  it("reads a library match from library_monster_id", () => {
    const rows = normalizeMonsterMatchRows([
      {
        query_name: "Giant Rat",
        monster_id: null,
        library_monster_id: "srd_giant_rat",
        source: "library",
        matched_name: "Giant Rat",
        match_kind: "exact",
      },
    ]);
    expect(rows).toEqual([
      {
        queryName: "Giant Rat",
        match: { targetId: "srd_giant_rat", source: "library", matchedName: "Giant Rat", matchKind: "exact" },
      },
    ]);
  });

  it("drops a row missing every field it needs rather than guessing", () => {
    expect(normalizeMonsterMatchRows([{ query_name: "Owlbear" }])).toEqual([]);
    expect(normalizeMonsterMatchRows([null, undefined, "not an object", 42])).toEqual([]);
  });

  it("drops a campaign-sourced row whose monster_id is missing", () => {
    const rows = normalizeMonsterMatchRows([
      {
        query_name: "Grell",
        monster_id: null,
        library_monster_id: "srd_grell",
        source: "campaign", // inconsistent with the RPC's own contract
        matched_name: "Grell",
        match_kind: "exact",
      },
    ]);
    expect(rows).toEqual([]);
  });

  it("rejects an unrecognized source or match_kind", () => {
    const base = { query_name: "Kobold", monster_id: "id-1", library_monster_id: null, matched_name: "Kobold" };
    expect(normalizeMonsterMatchRows([{ ...base, source: "somewhere", match_kind: "exact" }])).toEqual([]);
    expect(normalizeMonsterMatchRows([{ ...base, source: "campaign", match_kind: "fuzzy" }])).toEqual([]);
  });

  it("returns an empty array for an empty input", () => {
    expect(normalizeMonsterMatchRows([])).toEqual([]);
  });
});

describe("normalizeItemMatchRows", () => {
  it("reads item_id / library_item_id instead of the monster columns", () => {
    const rows = normalizeItemMatchRows([
      {
        query_name: "a potion of healing",
        item_id: null,
        library_item_id: "srd_potion_of_healing",
        source: "library",
        matched_name: "Potion of Healing",
        match_kind: "exact",
      },
    ]);
    expect(rows).toEqual([
      {
        queryName: "a potion of healing",
        match: {
          targetId: "srd_potion_of_healing",
          source: "library",
          matchedName: "Potion of Healing",
          matchKind: "exact",
        },
      },
    ]);
  });
});

describe("matchEntitiesByName", () => {
  it("assigns a match to every entity whose heading equals a resolved query_name", () => {
    const rows: RawMatchRow[] = [
      { queryName: "Kobold", match: { targetId: "id-1", source: "campaign", matchedName: "Kobold", matchKind: "exact" } },
    ];
    const result = matchEntitiesByName([{ ref: "r1", heading: "Kobold" }], rows);
    expect(result.get("r1")).toEqual(rows[0]?.match);
  });

  it("leaves an entity out of the map when its heading has no matching row", () => {
    const result = matchEntitiesByName([{ ref: "r1", heading: "Unknown Beast" }], []);
    expect(result.has("r1")).toBe(false);
    expect(result.size).toBe(0);
  });

  it("assigns the same match to every entity that printed the same name", () => {
    const rows: RawMatchRow[] = [
      { queryName: "Giant Rat", match: { targetId: "id-1", source: "library", matchedName: "Giant Rat", matchKind: "exact" } },
    ];
    const result = matchEntitiesByName(
      [{ ref: "r1", heading: "Giant Rat" }, { ref: "r2", heading: "Giant Rat" }],
      rows,
    );
    expect(result.get("r1")).toEqual(rows[0]?.match);
    expect(result.get("r2")).toEqual(rows[0]?.match);
  });

  it("does not match on a different literal string even if it would normalize the same", () => {
    // The RPC's own normalisation ("Kobold" vs "kobold") produces two rows if
    // asked with two different literal strings; this function only does exact
    // key lookup against whatever `query_name`s actually came back.
    const rows: RawMatchRow[] = [
      { queryName: "kobold", match: { targetId: "id-1", source: "campaign", matchedName: "Kobold", matchKind: "exact" } },
    ];
    const result = matchEntitiesByName([{ ref: "r1", heading: "Kobold" }], rows);
    expect(result.has("r1")).toBe(false);
  });

  it("returns an empty map for no entities or no rows", () => {
    expect(matchEntitiesByName([], []).size).toBe(0);
    expect(matchEntitiesByName([{ ref: "r1", heading: "Kobold" }], []).size).toBe(0);
  });
});
