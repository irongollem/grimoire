import { describe, it, expect } from "vitest";
import { injectPagedToc, renderTocHtml } from "./pagedToc";

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

describe("injectPagedToc", () => {
  it("labels entries with the actual footer page numbers", () => {
    const c = makeContainer([
      '<nav data-type="toc" class="sc-toc-placeholder"></nav>',
      "<h1>Chapter One</h1><p>a</p>",
      "<h2>A Section</h2><p>b</p>",
    ]);
    injectPagedToc(c, { showPageNumbers: true, start: 1 });
    const toc = c.querySelector(".sc-toc");
    expect(toc?.textContent).toContain("Chapter One");
    expect(toc?.textContent).toContain("A Section");
    // The TOC page is itself page "1", so the chapter is "2" and section "3" —
    // matching the footers exactly (use a Skip# on the TOC page to unnumber it).
    const pages = Array.from(c.querySelectorAll(".sc-toc-page")).map((e) => e.textContent);
    expect(pages).toEqual(["2", "3"]);
  });

  it("body starts at 1 when the TOC page carries a skip marker", () => {
    const c = makeContainer([
      '<nav data-type="toc"></nav><div data-type="skip-counting"></div>',
      "<h1>Chapter One</h1>",
      "<h2>A Section</h2>",
    ]);
    injectPagedToc(c, { showPageNumbers: true, start: 1 });
    const pages = Array.from(c.querySelectorAll(".sc-toc-page")).map((e) => e.textContent);
    expect(pages).toEqual(["1", "2"]);
  });

  it("does not list the TOC's own heading", () => {
    const c = makeContainer(['<nav data-type="toc"></nav>', "<h1>Real Chapter</h1>"]);
    injectPagedToc(c, { showPageNumbers: true, start: 1 });
    const entries = Array.from(c.querySelectorAll(".sc-toc-item"));
    expect(entries).toHaveLength(1);
    expect(entries[0].textContent).toContain("Real Chapter");
  });

  it("is a no-op without a placeholder", () => {
    const c = makeContainer(["<h1>Chapter</h1>"]);
    injectPagedToc(c, { showPageNumbers: true, start: 1 });
    expect(c.querySelector(".sc-toc")).toBeNull();
  });

  it("omits page numbers when page numbering is off", () => {
    const c = makeContainer(['<nav data-type="toc"></nav>', "<h1>Chapter</h1>"]);
    injectPagedToc(c, { showPageNumbers: false, start: 1 });
    expect(c.querySelector(".sc-toc-page")).toBeNull();
    expect(c.querySelector(".sc-toc")?.textContent).toContain("Chapter");
  });
});
