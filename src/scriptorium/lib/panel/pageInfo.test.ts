import { describe, expect, it } from "vitest";
import { bookPageNumber, describePage, paperLine, type PanelPageContext } from "./pageInfo";

const ctx: PanelPageContext = {
  paperLabel: "Grimoire · A4 · Two columns",
  chapterNumber: 3,
  chapterTitle: "The Understage",
  isHandout: false,
  firstPageLabel: "14",
  bookPageCount: 28,
};

describe("what the panel says about a page", () => {
  // Fails on: the big number being the chapter's page, which is not the number printed on the paper.
  it("names the page by the book's numbering, and its place in the chapter", () => {
    expect(describePage(ctx, 3, 4)).toEqual({ number: "16", of: "of 28", where: "3 · The Understage, page 3 of 4" });
  });

  it("falls back to the chapter's page when the book has no numbers yet", () => {
    expect(describePage({ ...ctx, firstPageLabel: null, bookPageCount: null }, 2, 4)).toMatchObject({ number: "2", of: null });
  });

  it("does not turn a roman-numeral front matter label into arithmetic", () => {
    expect(bookPageNumber("iv", 2)).toBeNull();
  });

  // Fails on: a handout talking about chapters it does not have.
  it("says nothing of chapters for a handout", () => {
    expect(describePage({ ...ctx, isHandout: true }, 1, 1).where).toBeNull();
  });

  it("reads the paper out as look, size and columns", () => {
    expect(paperLine("Grimoire", "A4", true)).toBe("Grimoire · A4 · Two columns");
    expect(paperLine("Letter", "A5", false)).toBe("Letter · A5 · One column");
  });
});
