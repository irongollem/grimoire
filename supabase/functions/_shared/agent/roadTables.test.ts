import { describe, expect, it } from "vitest";
import { entriesOf, rollAnswer, tablesAlong, tablesLine, type PlacedTable } from "./roadTables.ts";

const PARENTS: Record<string, string | null> = { coast: null, neverwinter: "coast", leilon: "coast", phandalin: "coast", island: null };
const parentOf = (id: string): string | null => PARENTS[id] ?? null;
const nameOf = (id: string): string => id;
const table = (id: string, placeId: string, over: Partial<PlacedTable> = {}): PlacedTable => ({
  id, name: `Table ${id}`, dice: "1d6", placeId,
  entries: [
    { min: 1, max: 3, label: "Nothing but rain", notes: null, encounterId: null },
    { min: 4, max: 5, label: "Bandits at a toll rope", notes: "They take coin over blood.", encounterId: "enc-1" },
  ],
  ...over,
});

describe("tablesAlong", () => {
  // Bug caught: a region's table read only at the region itself, so no town inside it ever has one.
  it("gives a place the tables of the nearest place it lies inside when it has none of its own", () => {
    const found = tablesAlong(["neverwinter", "leilon"], parentOf, nameOf, [table("road", "coast")]);
    expect(found.map((f) => [f.table.id, f.forPlace])).toEqual([["road", "neverwinter"]]);
  });

  // Bug caught: the region's general table offered at a town that has its own, the opposite of what the DM set up.
  it("lets a place's own tables win over those of what it lies inside", () => {
    const found = tablesAlong(["leilon"], parentOf, nameOf, [table("road", "coast"), table("marsh", "leilon")]);
    expect(found.map((f) => f.table.id)).toEqual(["marsh"]);
  });

  it("finds nothing for places with no table on them or above them", () => {
    expect(tablesAlong(["island"], parentOf, nameOf, [table("road", "coast")])).toEqual([]);
    expect(tablesLine([])).toBeNull();
  });
});

describe("rollAnswer", () => {
  // Bug caught: the entry read off by one at a range's edge (a 3 answered as the 4-to-5 entry).
  it("answers the entry whose range holds the face, at both of its edges", () => {
    expect(rollAnswer(table("t", "coast"), () => 3).content).toContain("Rolled 3 on \"Table t\" (1d6): Nothing but rain");
    expect(rollAnswer(table("t", "coast"), () => 4).content).toContain("Bandits at a toll rope");
  });

  // Bug caught: a prepared fight on the table told as loose words, so the narrator builds another fight for it.
  it("names the prepared fight an entry is, and the DM's note", () => {
    const { content } = rollAnswer(table("t", "coast"), () => 5);
    expect(content).toContain("They take coin over blood.");
    expect(content).toContain("encounter_id enc-1");
  });

  // Bug caught: a face no entry covers crashing the turn or being answered with the nearest entry.
  it("says nothing comes of a face no entry covers", () => {
    const { content, isError } = rollAnswer(table("t", "coast"), () => 6);
    expect(isError).toBe(false);
    expect(content).toContain("no entry covers it");
  });

  it("refuses a table that is not one of the campaign's placed tables", () => {
    expect(rollAnswer(undefined, () => 1).isError).toBe(true);
  });
});

describe("entriesOf", () => {
  // Bug caught: one malformed row in the stored entries taking the whole table down with it.
  it("keeps the entries that read as entries and leaves the rest", () => {
    expect(entriesOf([{ min: 1, max: 2, label: " Wolves ", encounter_id: "e1" }, { min: 3, label: "no max" }, "junk", null])).toEqual([
      { min: 1, max: 2, label: "Wolves", notes: null, encounterId: "e1" },
    ]);
    expect(entriesOf("not a list")).toEqual([]);
  });
});
