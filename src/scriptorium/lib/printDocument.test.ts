import { describe, it, expect } from "vitest";
import { buildPdfDocumentHtml } from "./printDocument";
import { PAGE_CONTENT_SELECTOR } from "@/scriptorium/lib/pagedPreviewCss";

const BASE = {
  title: "My Adventure",
  theme: "onednd2024" as const,
  pageSize: "A4" as const,
  fontsCss: "@font-face { font-family: Test; }",
  themeCss: ".theme-css {}",
  pagedStyles: ".injected {}",
  pagesHtml: "<div class=\"pagedjs_pages\"></div>",
};

describe("buildPdfDocumentHtml", () => {
  it("assembles a full HTML document with every stylesheet in order", () => {
    const html = buildPdfDocumentHtml(BASE);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<title>My Adventure</title>");
    const order = [".theme-css {}", ".injected {}"].map((css) => html.indexOf(css));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain(BASE.pagesHtml);
  });

  it("escapes the title against HTML injection", () => {
    const html = buildPdfDocumentHtml({ ...BASE, title: '<script>alert(1)</script> & "quotes"' });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;quotes&quot;");
  });

  it("falls back to 'Untitled' when the title is empty", () => {
    const html = buildPdfDocumentHtml({ ...BASE, title: "" });
    expect(html).toContain("<title>Untitled</title>");
  });

  it.each([
    ["A4", "size: A4;"],
    ["A5", "size: A5;"],
    ["Letter", "size: letter;"],
  ] as const)("maps page size %s to the @page keyword %s", (pageSize, expected) => {
    const html = buildPdfDocumentHtml({ ...BASE, pageSize });
    expect(html).toContain(expected);
  });

  it("applies the phb2014 theme class on the body", () => {
    const html = buildPdfDocumentHtml({ ...BASE, theme: "phb2014" });
    expect(html).toContain('<body class="sc-theme theme-phb2014">');
  });

  it("prints the book's paper and ribbon footer, so the PDF is not white where the editor is grey", () => {
    const html = buildPdfDocumentHtml({ ...BASE, paperTone: "grey", footerStyle: "ribbon" });
    expect(html).toContain('<body class="sc-theme theme-onednd2024 sc-paper--grey sc-footer-style--ribbon">');
  });

  it("gives each page's text area back the slack it was fitted without, after every other sheet (#1115)", () => {
    const html = buildPdfDocumentHtml(BASE);
    const restore = `${PAGE_CONTENT_SELECTOR} { height: calc(100% - var(--pagedjs-footnotes-height)); }`;
    expect(html).toContain(restore);
    expect(html.indexOf(restore)).toBeGreaterThan(html.indexOf(".injected {}"));
  });

  it("prints a table's header once per piece, not again at a column break (#1115)", () => {
    expect(buildPdfDocumentHtml(BASE)).toContain("thead { display: table-row-group; }");
  });
});

describe("fontsCss", () => {
  it("lands in the first <style>", () => {
    const html = buildPdfDocumentHtml(BASE);
    expect(html).toContain("<style>@font-face { font-family: Test; }</style>");
    expect(html.indexOf("@font-face")).toBeLessThan(html.indexOf(".theme-css {}"));
  });
});
