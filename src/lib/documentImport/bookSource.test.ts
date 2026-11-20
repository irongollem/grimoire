import { describe, expect, it } from "vitest";
import { bookImportName, bookSelectionSize, bookToMarkdown, embedRefsOf, importableBooks, type BookChapterSource } from "./bookSource";
import { TEXT_CHARS_PER_PAGE, FREE_PAGE_LIMIT } from "./limits";

const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const chapter = (id: string, position: number, ...content: object[]): BookChapterSource => ({ id, position, title: id, content: { type: "doc", content } });
const embed = (entityType: string, entityId: string) => ({ type: "entityEmbed", attrs: { entityType, entityId } });

describe("bookToMarkdown", () => {
  it("names a linked entry so the import finds it, keeps a secret's text, and drops the cover", () => {
    const md = bookToMarkdown(
      [chapter("c1", 1, { type: "coverPage", attrs: {} }, embed("npc", "n1"), { type: "secretBlock", content: [para("It was the ghost.")] })],
      new Map([["npc:n1", "Tam Harrow"]]),
    );
    expect(md).toContain("## Tam Harrow");
    expect(md).toContain("It was the ghost.");
    expect(md).not.toContain("Doc");
  });

  it("reads the chapters in book order whatever order they were given", () => {
    const md = bookToMarkdown([chapter("b", 2, para("Second")), chapter("a", 1, para("First"))], new Map());
    expect(md).toBe("First\n\nSecond");
  });
});

describe("embedRefsOf", () => {
  it("lists each linked thing once across the chapters", () => {
    const refs = embedRefsOf([chapter("a", 1, embed("npc", "n1"), embed("npc", "n1")), chapter("b", 2, embed("location", "l1"))]);
    expect(refs.map((r) => `${r.type}:${r.id}`).sort()).toEqual(["location:l1", "npc:n1"]);
  });
});

describe("bookSelectionSize", () => {
  const long = (pages: number) => chapter("big", 1, para("x".repeat(pages * TEXT_CHARS_PER_PAGE)));

  it("says an empty selection has nothing to judge, so the import cannot start on nothing", () => {
    expect(bookSelectionSize([], new Map(), false)).toMatchObject({ charCount: 0, validation: null });
  });

  it("refuses a selection over the plan's page cap, which is what the step tells the DM to untick chapters for", () => {
    const size = bookSelectionSize([long(FREE_PAGE_LIMIT + 5)], new Map(), false);
    expect(size.validation).toMatchObject({ ok: false, reason: "too_many_pages" });
    expect(bookSelectionSize([chapter("s", 1, para("short"))], new Map(), false).validation).toEqual({ ok: true });
  });
});

describe("importableBooks and the name", () => {
  it("offers this campaign's books and account-wide ones, never another campaign's or a handout", () => {
    const docs = [
      { id: "1", kind: "book", campaign_id: "c1" },
      { id: "2", kind: "book", campaign_id: null },
      { id: "3", kind: "book", campaign_id: "c2" },
      { id: "4", kind: "handout", campaign_id: "c1" },
    ];
    expect(importableBooks(docs, "c1").map((d) => d.id)).toEqual(["1", "2"]);
  });

  it("names the import for the book", () => {
    expect(bookImportName(" The Drowned Shrine ")).toBe("Book: The Drowned Shrine");
  });
});
