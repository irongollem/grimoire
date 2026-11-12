// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createPrintedBook, printedContentsHtml, recordPrintedBook } from "./usePrintedBook";

const li = (text: string, page: string) =>
  `<li class="sc-toc-item sc-toc-h1"><span class="sc-toc-link"><span class="sc-toc-text">${text}</span><span class="sc-toc-page">${page}</span></span></li>`;

function host(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("printedContentsHtml", () => {
  // Fails on: a contents list that runs over two pages showing only its first page's entries in the editor.
  it("gathers a list the layout split over several pages into one", () => {
    const html = printedContentsHtml(
      host(
        `<nav class="sc-toc"><h2 class="sc-toc-heading">Contents</h2><ol class="sc-toc-list sc-toc-cols-2">${li("One", "3")}</ol></nav>` +
          `<nav class="sc-toc"><ol class="sc-toc-list sc-toc-cols-2">${li("Two", "4")}</ol></nav>`,
      ),
    );
    expect(html).toContain("One");
    expect(html).toContain("Two");
    expect(html).toContain("sc-toc-cols-2");
    expect(html?.match(/<h2/g)).toHaveLength(1);
  });

  // Fails on: a book with no contents page getting one in the editor, or an empty book losing its "no headings" line.
  it("is null without a contents page and keeps the empty line without headings", () => {
    expect(printedContentsHtml(host("<p>text</p>"))).toBeNull();
    expect(printedContentsHtml(host('<nav class="sc-toc"><p class="sc-toc-empty">No headings yet.</p></nav>'))).toContain(
      "No headings yet.",
    );
  });
});

describe("recordPrintedBook", () => {
  // Fails on: the layout's result never reaching the editor's contents page and entries.
  it("writes the contents and the entry fits a layout produced", () => {
    const book = createPrintedBook();
    recordPrintedBook(
      book,
      host(
        `<nav class="sc-toc"><ol class="sc-toc-list">${li("One", "3")}</ol></nav>` +
          '<div data-type="entity-embed" data-block-id="b1"><div class="sc-statblock-entry sc-statblock-entry--wide"></div></div>',
      ),
    );
    expect(book.contents.value).toContain("One");
    expect(book.entryFits.value.get("b1")?.size).toBe("wide");
  });
});
