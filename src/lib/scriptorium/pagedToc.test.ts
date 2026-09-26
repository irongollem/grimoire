import { describe, it, expect } from "vitest";
import { expandTocPlaceholder, fillPagedTocPages, renderTocHtml, tocColumnCount } from "./pagedToc";

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

  it("carries the page-size/entry-count column count as a class on the list", () => {
    const items = [{ level: 1 as const, text: "Chapter", page: "1" }];
    expect(renderTocHtml(items, "A4")).toContain("sc-toc-cols-2");
    expect(renderTocHtml(items, "A5")).toContain("sc-toc-cols-1");
  });

  it("marks a level-1 entry sc-toc-h1 so it can be styled bold/red distinctly from h2", () => {
    expect(renderTocHtml([{ level: 1, text: "Chapter", page: "1" }])).toContain("sc-toc-h1");
  });
});

describe("tocColumnCount", () => {
  it("is always one column on A5, regardless of entry count", () => {
    expect(tocColumnCount("A5", 1)).toBe(1);
    expect(tocColumnCount("A5", 50)).toBe(1);
  });

  it("is two columns on A4/Letter for a modest entry count", () => {
    expect(tocColumnCount("A4", 5)).toBe(2);
    expect(tocColumnCount("Letter", 20)).toBe(2);
  });

  it("is three columns on A4/Letter past the long-book threshold", () => {
    expect(tocColumnCount("A4", 21)).toBe(3);
    expect(tocColumnCount("Letter", 40)).toBe(3);
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

  it("excludes headings inside a linked entity embed, a note, and a read-aloud box", () => {
    const html =
      '<nav data-type="toc"></nav><h1>Real Chapter</h1>' +
      '<div data-type="entity-embed"><h1>Owlbear</h1><h2>Actions</h2></div>' +
      '<div class="sc-note"><h2>Sidebar Title</h2></div>' +
      '<div class="sc-descriptive"><h2>Read-aloud Title</h2></div>';
    const out = expandTocPlaceholder(html, { showPageNumbers: true });
    const root = document.createElement("div");
    root.innerHTML = out;
    const toc = root.querySelector(".sc-toc");
    expect(toc?.textContent).toContain("Real Chapter");
    expect(toc?.textContent).not.toContain("Owlbear");
    expect(toc?.textContent).not.toContain("Actions");
    expect(toc?.textContent).not.toContain("Sidebar Title");
    expect(toc?.textContent).not.toContain("Read-aloud Title");
  });

  it("lists a monster entry's own name heading despite being inside an entity embed", () => {
    const html =
      '<nav data-type="toc"></nav><h1>Real Chapter</h1>' +
      '<div data-type="entity-embed"><h2 class="sc-statblock-entry-heading">Owlbear</h2></div>';
    const out = expandTocPlaceholder(html, { showPageNumbers: true });
    const root = document.createElement("div");
    root.innerHTML = out;
    expect(root.querySelector(".sc-toc")?.textContent).toContain("Owlbear");
  });

  it("still excludes an NPC embed's own sub-headings (Identity/Lore) inside an entity embed", () => {
    const html =
      '<nav data-type="toc"></nav><h1>Real Chapter</h1>' +
      '<div data-type="entity-embed"><h1>Aldric</h1><h2>Identity</h2></div>';
    const out = expandTocPlaceholder(html, { showPageNumbers: true });
    const root = document.createElement("div");
    root.innerHTML = out;
    const text = root.querySelector(".sc-toc")?.textContent ?? "";
    expect(text).not.toContain("Aldric");
    expect(text).not.toContain("Identity");
  });

  it("defaults to h1/h2 only — an h3 never reaches the TOC", () => {
    const html = '<nav data-type="toc"></nav><h1>Chapter</h1><h2>Section</h2><h3>Subsection</h3>';
    const out = expandTocPlaceholder(html, { showPageNumbers: true });
    const root = document.createElement("div");
    root.innerHTML = out;
    expect(root.querySelector(".sc-toc")?.textContent).not.toContain("Subsection");
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
