import { paperById } from "@/scriptorium/papers/papers";
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
  it("carries the page dressing's stylesheet in the head once, and only when the book has one", () => {
    // Fails on: the mask pictures missing from the document the renderer prints, or repeated on every page.
    const css = ".sc-dressing{position:absolute}";
    const html = buildPdfDocumentHtml({ ...BASE, dressingCss: css });
    expect(html.split(css)).toHaveLength(2);
    expect(html.indexOf(css)).toBeLessThan(html.indexOf("<body"));
    expect(buildPdfDocumentHtml(BASE)).not.toContain(".sc-dressing");
  });

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
    const grey = paperById("grey");
    expect(html).toMatch(/<body class="sc-theme theme-onednd2024 sc-paper sc-footer-style--ribbon" style="--sc-paper-image: url\([^"]+grey[^"]*\); --sc-paper-veil: [^;]+; --sc-paper-size: [\d.]+mm [\d.]+mm; --sc-page-bg: #[0-9a-f]{6}">/);
    expect(html).toContain(`--sc-paper-veil: rgb(255 255 255 / ${grey.veil})`);
    expect(html).toContain(`--sc-page-bg: ${grey.tint}`);
  });

  it("prints a handout's paper and no paper at all when ink-friendly", () => {
    // Fails on: a handout paper dropped from the PDF, or a paper that spends ink in ink-friendly mode.
    expect(buildPdfDocumentHtml({ ...BASE, theme: "letter", paperTone: "kraft" })).toContain('class="sc-theme theme-letter sc-paper"');
    const ink = buildPdfDocumentHtml({ ...BASE, theme: "letter", paperTone: "kraft", inkFriendly: true });
    expect(ink).toContain('<body class="sc-theme theme-letter">');
    expect(ink).not.toContain("--sc-paper-image");
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
