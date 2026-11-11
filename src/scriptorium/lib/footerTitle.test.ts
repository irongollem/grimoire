// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { chapterTitleOf, footerTitleFor, runningTitle } from "./footerTitle";

const source = { mode: "chapter" as const, bookTitle: "The Locked Workshop", chapterTitle: "The Understage", custom: "A Side-Trip" };

describe("runningTitle", () => {
  it("a left page always says the book, a right page follows the choice", () => {
    // Bug caught: the choice applied to both sides, so a printed book's left page stops naming the book.
    expect(runningTitle(source, false)).toBe("The Locked Workshop");
    expect(runningTitle(source, true)).toBe("The Understage");
    expect(runningTitle({ ...source, mode: "book" }, true)).toBe("The Locked Workshop");
    expect(runningTitle({ ...source, mode: "custom" }, true)).toBe("A Side-Trip");
    expect(runningTitle({ ...source, mode: "custom" }, false)).toBe("The Locked Workshop");
  });
});

describe("chapterTitleOf", () => {
  it("is the first heading's text, and nothing for a chapter without one", () => {
    expect(chapterTitleOf("<p>x</p><h1> The <em>Understage</em> </h1><h1>Later</h1>")).toBe("The Understage");
    expect(chapterTitleOf("<p>no heading</p>")).toBe("");
  });
});

describe("footerTitleFor", () => {
  // Fails on: a template's footer text ("Bestiary") silently replaced by the chapter title on a new book.
  it("keeps a new book's footer text as its running title, and gives a book without any its chapters' titles", () => {
    expect(footerTitleFor("Bestiary")).toBe("custom");
    expect(footerTitleFor("")).toBe("chapter");
    expect(footerTitleFor("   ")).toBe("chapter");
  });
});
