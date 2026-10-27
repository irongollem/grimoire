import { describe, expect, it } from "vitest";
import {
  buildFocalQueue,
  entryLabel,
  namedEntryId,
  buildNamedFocalQueue,
  filterByStatus,
  type QueueNamedRow,
  nextMatchingIndex,
  type QueueArtRow,
  type QueueLibraryRow,
} from "./focalQueue";

const art = (key: string, imageUrl: string | null, checkedAt: string | null = null, x?: number): QueueArtRow => ({
  key,
  imageUrl,
  checkedAt,
  focalPoint: x === undefined ? null : { x, y: 50 },
});
const lib = (name: string, imageUrl: string | null, x?: number): QueueLibraryRow => ({
  name,
  imageUrl,
  focalPoint: x === undefined ? null : { x, y: 10 },
});

describe("buildFocalQueue", () => {
  it("groups rows that share a picture into one entry with sorted, deduped names and keys", () => {
    const entries = buildFocalQueue(
      "monster",
      [art("srd_owlbear", "a.webp"), art("srd_2024_owlbear", "a.webp"), art("srd_aboleth", "b.webp")],
      [lib("Owlbear", "a.webp"), lib("Owlbear", "a.webp"), lib("Aboleth", "b.webp"), lib("Owlbear Cub", "a.webp")],
    );
    expect(entries).toHaveLength(2);
    const owl = entries.find((e) => e.imageUrl === "a.webp");
    expect(owl?.names).toEqual(["Owlbear", "Owlbear Cub"]);
    expect(owl?.keys).toEqual(["srd_2024_owlbear", "srd_owlbear"]);
  });

  it("is checked only when every art row of the picture is checked", () => {
    const [mixed] = buildFocalQueue("spell", [art("a", "x.webp", "2026-10-01"), art("b", "x.webp")], [lib("A", "x.webp")]);
    expect(mixed?.checkedAt).toBeNull();
    const [done] = buildFocalQueue(
      "spell",
      [art("a", "x.webp", "2026-10-02"), art("b", "x.webp", "2026-10-01")],
      [lib("A", "x.webp")],
    );
    expect(done?.checkedAt).toBe("2026-10-01");
  });

  it("prefers the canonical focal point and falls back to the library row's", () => {
    const [fromArt] = buildFocalQueue("monster", [art("a", "x.webp", null, 30)], [lib("A", "x.webp", 70)]);
    expect(fromArt?.focalPoint).toEqual({ x: 30, y: 50 });
    const [fromLibrary] = buildFocalQueue("monster", [art("a", "x.webp")], [lib("A", "x.webp", 70)]);
    expect(fromLibrary?.focalPoint).toEqual({ x: 70, y: 10 });
  });

  it("takes the first library row's focal point when several rows show the picture", () => {
    const [entry] = buildFocalQueue("monster", [art("a", "x.webp")], [lib("A", "x.webp", 70), lib("A2", "x.webp", 90), lib("A3", "x.webp")]);
    expect(entry?.focalPoint).toEqual({ x: 70, y: 10 });
  });

  it("skips pictures without an art row and rows without a picture", () => {
    const entries = buildFocalQueue("item", [art("sword", null)], [lib("Sword", "orphan.webp"), lib("Blank", null)]);
    expect(entries).toEqual([]);
  });

  it("sorts unchecked first, then by first name", () => {
    const entries = buildFocalQueue(
      "monster",
      [art("1", "z.webp"), art("2", "y.webp", "2026-10-01"), art("3", "x.webp")],
      [lib("Zombie", "z.webp"), lib("Ape", "y.webp"), lib("Mimic", "x.webp")],
    );
    expect(entries.map((e) => e.names[0])).toEqual(["Mimic", "Zombie", "Ape"]);
  });
});

describe("entryLabel", () => {
  it("is the first name, else the first key, else the id", () => {
    const base = { id: "x.webp", kind: "monster", imageUrl: "x.webp", focalPoint: null, checkedAt: null } as const;
    expect(entryLabel({ ...base, names: ["Owlbear"], keys: ["srd_owlbear"] })).toBe("Owlbear");
    expect(entryLabel({ ...base, names: [], keys: ["srd_owlbear"] })).toBe("srd_owlbear");
    expect(entryLabel({ ...base, names: [], keys: [] })).toBe("x.webp");
  });
});

describe("nextMatchingIndex", () => {
  const entries = buildFocalQueue(
    "monster",
    [art("1", "a.webp"), art("2", "b.webp", "t"), art("3", "c.webp", "t"), art("4", "d.webp", "t")],
    [lib("A", "a.webp"), lib("B", "b.webp"), lib("C", "c.webp"), lib("D", "d.webp")],
  );
  it("steps by one for the all filter", () => {
    expect(nextMatchingIndex(entries, 0, "all")).toBe(1);
  });
  it("skips checked entries for the unchecked filter and reports the end", () => {
    expect(nextMatchingIndex(entries, -1, "unchecked")).toBe(0);
    expect(nextMatchingIndex(entries, 0, "unchecked")).toBe(-1);
  });
  it("returns -1 past the last entry", () => {
    expect(nextMatchingIndex(entries, 3, "all")).toBe(-1);
  });
});

describe("filterByStatus", () => {
  it("keeps only unchecked entries for the unchecked filter", () => {
    const entries = buildFocalQueue("monster", [art("1", "a.webp"), art("2", "b.webp", "t")], []);
    expect(filterByStatus(entries, "unchecked")).toHaveLength(1);
    expect(filterByStatus(entries, "all")).toHaveLength(2);
  });
});

describe("buildNamedFocalQueue", () => {
  const row = (id: string, name: string, imageUrl: string | null, checkedAt: string | null = null, x?: number): QueueNamedRow => ({
    id,
    name,
    imageUrl,
    checkedAt,
    focalPoint: x === undefined ? null : { x, y: 50 },
  });

  it("merges editions case-insensitively and keeps names with no picture", () => {
    const entries = buildNamedFocalQueue("class", [
      row("2", "wizard", null),
      row("1", "Wizard", null),
      row("3", "Bard", "bard.webp", "2026-10-01"),
    ]);
    expect(entries).toHaveLength(2);
    const wizard = entries.find((e) => e.id === "name:wizard");
    expect(wizard?.keys).toEqual(["1", "2"]);
    expect(wizard?.names).toEqual(["Wizard"]);
    expect(wizard?.imageUrl).toBeNull();
  });

  it("is unchecked without a picture or when any edition is unchecked", () => {
    const [noArt, mixed, done] = buildNamedFocalQueue("species", [
      row("1", "A", null, "2026-10-01"),
      row("2", "B", "b.webp", "2026-10-01"),
      row("3", "B", "b.webp"),
      row("4", "C", "c.webp", "2026-10-02"),
    ]);
    expect(noArt?.checkedAt).toBeNull();
    expect(mixed?.checkedAt).toBeNull();
    expect(done?.checkedAt).toBe("2026-10-02");
    expect(done?.id).toBe("name:c");
  });

  it("takes the first picture by id order and keeps the id stable when the picture changes", () => {
    const before = buildNamedFocalQueue("background", [row("b", "Sage", "two.webp", null, 20), row("a", "Sage", "one.webp", null, 80)]);
    expect(before[0]?.imageUrl).toBe("one.webp");
    expect(before[0]?.focalPoint).toEqual({ x: 80, y: 50 });
    const after = buildNamedFocalQueue("background", [row("b", "Sage", "new.webp"), row("a", "Sage", "new.webp")]);
    expect(after[0]?.id).toBe(before[0]?.id);
  });

  it("ignores a row with a blank name, and treats padded spellings of a name as one", () => {
    const entries = buildNamedFocalQueue("class", [row("1", "  ", "x.webp"), row("2", " Bard ", "b.webp"), row("3", "bard", "b.webp")]);
    expect(entries.map((e) => e.id)).toEqual(["name:bard"]);
    expect(namedEntryId("  BARD ")).toBe("name:bard");
  });

  it("keeps the focal point recorded against the chosen picture, not another edition's", () => {
    const [entry] = buildNamedFocalQueue("species", [row("a", "Elf", "one.webp"), row("b", "Elf", "two.webp", null, 25)]);
    expect(entry?.imageUrl).toBe("one.webp");
    expect(entry?.focalPoint).toBeNull();
  });

  it("sorts unchecked first, then by name", () => {
    const entries = buildNamedFocalQueue("species", [
      row("1", "Elf", "e.webp", "t"),
      row("2", "Orc", "o.webp"),
      row("3", "Dwarf", "d.webp"),
    ]);
    expect(entries.map((e) => e.names[0])).toEqual(["Dwarf", "Orc", "Elf"]);
  });
});
