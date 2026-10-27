import { describe, expect, it } from "vitest";
import { buildBookDocumentHtml, bookPdfFilename, bookPdfPath } from "./bookDocument";

describe("buildBookDocumentHtml", () => {
  const html = buildBookDocumentHtml({
    title: 'The <Saltreach> & "Co"',
    leather: "oxblood",
    fontsCss: "@font-face{}",
    pagedStyles: ".pagedjs_page{}",
    coverHtml: '<section class="pb-cover"></section>',
    pagesHtml: '<div class="pagedjs_pages"></div>',
  });

  it("is a complete document, with the title escaped", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>The &lt;Saltreach&gt; &amp; &quot;Co&quot;</title>");
  });

  it("titles an untitled book Open Book", () => {
    const untitled = buildBookDocumentHtml({ title: "", leather: "oxblood", fontsCss: "", pagedStyles: "", coverHtml: "", pagesHtml: "" });
    expect(untitled).toContain("<title>Open Book</title>");
  });

  it("puts the cover sheet before the pages, on the hide's colour", () => {
    expect(html.indexOf("pb-cover-sheet")).toBeGreaterThan(-1);
    expect(html.indexOf('<section class="pb-cover">')).toBeLessThan(html.indexOf('<div class="pagedjs_pages">'));
    expect(html).toContain("background-color: #7a1f1a");
  });

  it("prints A5 with no sheet margin, and does not repeat the raw book stylesheet", () => {
    expect(html).toContain("@page { size: 148mm 210mm; margin: 0; }");
    expect(html).not.toContain("@page body");
  });
});

describe("bookPdfFilename", () => {
  it("strips what a file name cannot hold", () => {
    expect(bookPdfFilename('A/B: "C"?', 3)).toBe("AB C (release 3).pdf");
  });
  it("falls back to a name when the title leaves nothing", () => {
    expect(bookPdfFilename("///", 1)).toBe("Open Book (release 1).pdf");
  });
  it("collapses runs of whitespace and drops control characters and leading dots", () => {
    expect(bookPdfFilename("  The   Salt\u001freach ", 2)).toBe("The Saltreach (release 2).pdf");
    expect(bookPdfFilename("..hidden", 2)).toBe("hidden (release 2).pdf");
  });
});

describe("bookPdfPath", () => {
  it("is the owner's folder, the campaign, then the release and a fresh uuid", () => {
    expect(bookPdfPath("u", "c", "r", "x")).toBe("u/c/r-x.pdf");
  });
});
