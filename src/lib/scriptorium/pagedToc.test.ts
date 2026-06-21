import { describe, it, expect } from "vitest";
import { expandTocPlaceholder, fillPagedTocPages, renderTocHtml } from "./pagedToc";

/** Build a container of fake Paged.js pages from per-page inner HTML. */
function makeContainer(pageHtml: string[]): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = pageHtml
    .map((h) => `<div class="pagedjs_page"><div class="pagedjs_pagebox">${h}</div></div>`)
    .join("");
  return container;
}

describe("renderTocHtml", () => {
  it("renders an empty-state when there are no headings", () => {
    expect(renderTocHtml([])).toContain("sc-toc-empty");
  });
  it("indents by level and shows the page label", () => {
    const html = renderTocHtml([
      { level: 1, text: "Chapter", page: "1" },
      { level: 2, text: "Section", page: "2" },
    ]);
    expect(html).toContain("Chapter");
    expect(html).toContain("sc-toc-h2");
    expect(html).toContain('class="sc-toc-page">2<');
  });
  it("escapes heading text", () => {
    expect(renderTocHtml([{ level: 1, text: "<b>x</b>", page: "1" }])).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("expandTocPlaceholder", () => {
  it("replaces the placeholder with a full TOC of the document headings", () => {
    const html = '<nav data-type="toc"></nav><h1>Chapter One</h1><h2>A Section</h2>';
    const out = expandTocPlaceholder(html, { showPageNumbers: true });
    expect(out).not.toContain('data-type="toc"');
    expect(out).toContain("Chapter One");
    expect(out).toContain("A Section");
    // Page cells are reserved (blank) for fillPagedTocPages to populate.
    expect(out).toContain('class="sc-toc-page">');
  });

  it("excludes cover and TOC-internal headings", () => {
    const html =
      '<div class="sc-cover sc-cover--front"><h1>Title On Cover</h1></div>' +
      '<nav data-type="toc"></nav><h1>Real Chapter</h1>';
    const out = expandTocPlaceholder(html, { showPageNumbers: true });
    const root = document.createElement("div");
    root.innerHTML = out;
    const toc = root.querySelector(".sc-toc");
    // The cover + its heading stay in the document; the TOC just doesn't list it.
    expect(toc?.textContent).toContain("Real Chapter");
    expect(toc?.textContent).not.toContain("Title On Cover");
  });

  it("reserves no page cells when numbering is off", () => {
    const out = expandTocPlaceholder('<nav data-type="toc"></nav><h1>Chapter</h1>', { showPageNumbers: false });
    expect(out).toContain("Chapter");
    expect(out).not.toContain("sc-toc-page");
  });

  it("is a no-op without a placeholder", () => {
    const html = "<h1>Chapter</h1>";
    expect(expandTocPlaceholder(html, { showPageNumbers: true })).toBe(html);
  });
});

describe("fillPagedTocPages", () => {
  /** Render an expanded TOC on the first page + chapters on later pages. */
  function withToc(pages: string[], showPageNumbers = true): HTMLElement {
    const toc = expandTocPlaceholder(
      '<nav data-type="toc"></nav>' + pages.join(""),
      { showPageNumbers },
    );
    // The expanded TOC sits on page 1; each chapter page mirrors a real heading.
    return makeContainer([toc.split("</nav>")[0] + "</nav>", ...pages]);
  }

  it("labels entries with the actual footer page numbers", () => {
    const c = withToc(["<h1>Chapter One</h1><p>a</p>", "<h2>A Section</h2><p>b</p>"]);
    fillPagedTocPages(c, { showPageNumbers: true, start: 1 });
    const pages = Array.from(c.querySelectorAll(".sc-toc-page")).map((e) => e.textContent);
    // TOC is page 1, chapter on page 2, section on page 3 — matches the footers.
    expect(pages).toEqual(["2", "3"]);
  });

  it("body starts at 1 when the TOC page carries a skip marker", () => {
    const toc = expandTocPlaceholder('<nav data-type="toc"></nav><h1>Chapter One</h1><h2>A Section</h2>', {
      showPageNumbers: true,
    });
    const c = makeContainer([
      toc.split("</nav>")[0] + "</nav>" + '<div data-type="skip-counting"></div>',
      "<h1>Chapter One</h1>",
      "<h2>A Section</h2>",
    ]);
    fillPagedTocPages(c, { showPageNumbers: true, start: 1 });
    const pages = Array.from(c.querySelectorAll(".sc-toc-page")).map((e) => e.textContent);
    expect(pages).toEqual(["1", "2"]);
  });

  it("does not list or number the TOC's own heading", () => {
    const c = withToc(["<h1>Real Chapter</h1>"]);
    fillPagedTocPages(c, { showPageNumbers: true, start: 1 });
    const entries = Array.from(c.querySelectorAll(".sc-toc-item"));
    expect(entries).toHaveLength(1);
    expect(entries[0].textContent).toContain("Real Chapter");
  });

  it("is a no-op when page numbering is off (no page cells)", () => {
    const c = withToc(["<h1>Chapter</h1>"], false);
    fillPagedTocPages(c, { showPageNumbers: false, start: 1 });
    expect(c.querySelector(".sc-toc-page")).toBeNull();
    expect(c.querySelector(".sc-toc")?.textContent).toContain("Chapter");
  });
});
