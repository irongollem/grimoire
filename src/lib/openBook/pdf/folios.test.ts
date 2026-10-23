// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { applyFolios, cssString, folioLabels } from "./folios";

const page = (firstChapter: boolean, plain: boolean) => ({ firstChapter, plain });

describe("folioLabels", () => {
  it("numbers the front matter in roman and chapter I's opening page as 1", () => {
    const labels = folioLabels([
      page(false, true), // title page: none shown
      page(false, false), // contents
      page(false, false), // contents, continued
      page(true, true), // chapter I opener: page 1, none shown
      page(false, false), // first entry: 2
      page(false, false),
    ]);
    expect(labels).toEqual([null, "ii", "iii", null, "2", "3"]);
  });

  it("stays roman when the book has no chapters", () => {
    expect(folioLabels([page(false, true), page(false, false)])).toEqual([null, "ii"]);
  });
});

describe("cssString", () => {
  it("closes the quote and escapes what would end it early", () => {
    expect(cssString("4")).toBe('"4"');
    expect(cssString('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
});

describe("applyFolios", () => {
  function host(): HTMLElement {
    const el = document.createElement("div");
    el.innerHTML = `
      <div class="pagedjs_page pagedjs_plain_page"><a class="pb-pg" href="#e-x"></a></div>
      <div class="pagedjs_page"><nav class="pb-toc"><a href="#e-x">x</a><a href="#chapter-a">a</a><a href="#e-none">n</a></nav></div>
      <div class="pagedjs_page pagedjs_plain_page"><section class="pb-first" id="chapter-a"></section></div>
      <div class="pagedjs_page"><section id="e-x"></section></div>`;
    return el;
  }

  it("writes each page's folio and the page number of every link that wants one", () => {
    const el = host();
    applyFolios(el);
    const pages = el.querySelectorAll<HTMLElement>(".pagedjs_page");
    expect(pages[1].style.getPropertyValue("--ob-folio")).toBe('"ii"');
    expect(pages[3].style.getPropertyValue("--ob-folio")).toBe('"2"');
    // A plain page shows nothing, and a link to a chapter opener still gets its number.
    expect(pages[2].style.getPropertyValue("--ob-folio")).toBe('""');
    const links = el.querySelectorAll<HTMLElement>(".pb-toc a");
    expect(links[0].dataset.pg).toBe("2");
    expect(links[1].dataset.pg).toBe("1");
    expect(links[2].dataset.pg).toBeUndefined();
  });
});
