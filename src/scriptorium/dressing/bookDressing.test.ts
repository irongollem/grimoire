import { describe, expect, it } from "vitest";
import { bookDressing, pageKey } from "./bookDressing";
import type { BookLayoutResult, BookPageInfo } from "@/scriptorium/lib/bookLayout/types";

const page = (over: Partial<BookPageInfo>): BookPageInfo => ({ chapterId: "a", pageInChapter: 1, globalIndex: 0, blank: false, cover: false, label: null, ...over });
const layout = (pages: BookPageInfo[]) => ({ pages }) as unknown as BookLayoutResult;

describe("bookDressing", () => {
  it("numbers a chapter's page by its place in the whole book, covers and blank pages counted", () => {
    // Fails on: numbering by the page within its chapter, so the editor dresses page 2 of chapter b like the book's
    // page 2 while the preview and the PDF dress it as page 5: the same page, different marks.
    const book = bookDressing({
      dressing: () => null,
      handout: () => false,
      layout: () =>
        layout([
          page({ pageInChapter: 1, globalIndex: 0, cover: true }),
          page({ pageInChapter: 2, globalIndex: 1 }),
          page({ pageInChapter: null, globalIndex: 2, blank: true }),
          page({ chapterId: "b", pageInChapter: 1, globalIndex: 3 }),
        ]),
    });
    expect(book.pages.value.get(pageKey("a", 1))).toEqual({ number: 1, kind: "cover" });
    expect(book.pages.value.get(pageKey("a", 2))).toEqual({ number: 2, kind: "text" });
    expect(book.pages.value.get(pageKey("b", 1))).toEqual({ number: 4, kind: "text" });
    expect(book.pages.value.size).toBe(3);
  });

  it("knows no pages before the first layout", () => {
    expect(bookDressing({ dressing: () => null, handout: () => false, layout: () => null }).pages.value.size).toBe(0);
  });
});
