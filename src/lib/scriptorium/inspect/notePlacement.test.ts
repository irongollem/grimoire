import { describe, expect, it } from "vitest";
import type { ScriptoriumChapterSummary, ScriptoriumNote } from "@/types/scriptorium.types";
import { noteTargetForClick, noteWhere, numberNotes, orderNotes, placeNotes, type PageProbe } from "./notePlacement";

const note = (id: string, chapter_id: string, block_id: string | null, over: Partial<ScriptoriumNote> = {}): ScriptoriumNote => ({
  id, user_id: "me", document_id: "d", chapter_id, block_id, body: id, done: false, created_at: id, updated_at: id, ...over,
});
const chapter = (id: string, position: number): ScriptoriumChapterSummary => ({
  id, document_id: "d", position, title: id, word_count: 0, created_at: "", updated_at: "",
});
const page = (index: number, chapterId: string | null, blocks: [string, number][], blank = false): PageProbe => ({
  index, chapterId, blank, blocks: blocks.map(([id, top]) => ({ id, top })),
});

describe("placeNotes", () => {
  it("follows the block to the page it now lives on after a re-layout", () => {
    const n = [note("n1", "c1", "b9")];
    expect(placeNotes(n, [page(0, "c1", [["b1", 10]]), page(1, "c1", [["b9", 40]])]).get("n1")).toMatchObject({ pageIndex: 1, top: 40, blockId: "b9" });
    expect(placeNotes(n, [page(0, "c1", [["b1", 10], ["b9", 80]]), page(1, "c1", [])]).get("n1")).toMatchObject({ pageIndex: 0, top: 80 });
  });

  it("pins a note whose block is gone, or that never had one, to the top of its chapter's first page", () => {
    const pages = [page(0, "c0", [["a", 5]]), page(1, "c1", [["b1", 30]]), page(2, "c1", [])];
    const placed = placeNotes([note("gone", "c1", "deleted"), note("none", "c1", null, { created_at: "z" })], pages);
    expect(placed.get("gone")).toMatchObject({ pageIndex: 1, top: 0, blockId: null });
    expect(placed.get("none")).toMatchObject({ pageIndex: 1, top: 0, blockId: null });
  });

  it("never pins to a blank page, and leaves a note of an empty chapter unplaced", () => {
    const placed = placeNotes([note("n", "c1", null), note("e", "empty", null)], [page(0, "c1", [], true), page(1, "c1", [["b", 1]])]);
    expect(placed.get("n")?.pageIndex).toBe(1);
    expect(placed.get("e")?.pageIndex).toBeNull();
  });

  it("gives notes on one block their own slot", () => {
    const placed = placeNotes([note("a", "c1", "b"), note("b2", "c1", "b")], [page(0, "c1", [["b", 5]])]);
    expect([placed.get("a")?.slot, placed.get("b2")?.slot]).toEqual([0, 1]);
  });
});

describe("numbering", () => {
  const chapters = [chapter("c1", 0), chapter("c2", 1)];
  const pages = [page(0, "c1", [["x", 10], ["y", 90]]), page(1, "c2", [["z", 5]])];
  const notes = [note("late", "c2", "z"), note("low", "c1", "y"), note("high", "c1", "x"), note("old", "c1", "x", { done: true, created_at: "0" })];

  it("numbers open notes in book order, ignoring creation order", () => {
    const placements = placeNotes(notes, pages);
    expect(orderNotes(notes, chapters, placements).map((x) => x.id)).toEqual(["old", "high", "low", "late"]);
    expect(numberNotes(notes, chapters, placements, false).map(({ note: x, n }) => [n, x.id])).toEqual([[1, "high"], [2, "low"], [3, "late"]]);
  });

  it("hides done notes until asked", () => {
    const placements = placeNotes(notes, pages);
    expect(numberNotes(notes, chapters, placements, false).some(({ note: x }) => x.done)).toBe(false);
    expect(numberNotes(notes, chapters, placements, true)).toHaveLength(4);
  });
});

describe("noteTargetForClick", () => {
  it("pins to the clicked block, else the page's first block", () => {
    const p = page(0, "c1", [["a", 0], ["b", 50]]);
    expect(noteTargetForClick(p, "b")).toEqual({ chapterId: "c1", blockId: "b" });
    expect(noteTargetForClick(p, null)).toEqual({ chapterId: "c1", blockId: "a" });
    expect(noteTargetForClick(p, "elsewhere")).toEqual({ chapterId: "c1", blockId: "a" });
  });
  it("pins nothing on a blank page or a page with no block", () => {
    expect(noteTargetForClick(page(0, "c1", [["a", 0]], true), "a")).toBeNull();
    expect(noteTargetForClick(page(0, "c1", []), null)).toBeNull();
    expect(noteTargetForClick(page(0, null, [["a", 0]]), "a")).toBeNull();
  });
});

describe("noteWhere", () => {
  it("leaves the page out while unknown", () => {
    expect(noteWhere(1, "193", "The Spiral's Heart")).toBe("1 · Page 193 · The Spiral's Heart");
    expect(noteWhere(2, null, "Bestiary")).toBe("2 · Bestiary");
  });
});
