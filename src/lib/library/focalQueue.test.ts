import { describe, expect, it } from "vitest";
import {
  buildFocalQueue,
  filterByStatus,
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
