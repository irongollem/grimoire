import { describe, it, expect, vi } from "vitest";

// buildPdfDocumentHtml is pure and never touches Paged.js, but importing
// the module still pulls in the real `pagedjs` package (used by
// exportPdf(), left untested here: it needs real layout and the network).
// Stub it so this file doesn't pay for or depend on its real behaviour.
vi.mock("pagedjs", () => ({ Previewer: class {}, Handler: class {}, registerHandlers: vi.fn() }));

import { buildPdfDocumentHtml, sanitizePdfFilename } from "./useScriptoriumPdf";

const BASE = {
  title: "My Adventure",
  theme: "onednd2024" as const,
  pageSize: "A4" as const,
  fontsCss: "@font-face { font-family: Test; }",
  themeCss: ".theme-css {}",
  pagedCss: ".paged-css {}",
  pagedStyles: ".injected {}",
  pagesHtml: "<div class=\"pagedjs_pages\"></div>",
};

describe("buildPdfDocumentHtml", () => {
  it("assembles a full HTML document with every stylesheet in order", () => {
    const html = buildPdfDocumentHtml(BASE);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<title>My Adventure</title>");
    const order = [".theme-css {}", ".paged-css {}", ".injected {}"].map((css) => html.indexOf(css));
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

  it("applies the onednd2024 theme class on the body by default", () => {
    const html = buildPdfDocumentHtml(BASE);
    expect(html).toContain('<body class="sc-theme theme-onednd2024">');
  });
});

describe("fontsCss", () => {
  it("lands in the first <style>", () => {
    const html = buildPdfDocumentHtml(BASE);
    expect(html).toContain("<style>@font-face { font-family: Test; }</style>");
    expect(html.indexOf("@font-face")).toBeLessThan(html.indexOf(".theme-css {}"));
  });
});

describe("sanitizePdfFilename", () => {
  it("appends .pdf", () => {
    expect(sanitizePdfFilename("My Adventure")).toBe("My Adventure.pdf");
  });

  it("strips characters illegal in filenames and collapses whitespace", () => {
    expect(sanitizePdfFilename('  The  "Lost" / Mine: <Part 1>?  ')).toBe("The Lost Mine Part 1.pdf");
  });

  it("falls back to Untitled", () => {
    expect(sanitizePdfFilename("")).toBe("Untitled.pdf");
    expect(sanitizePdfFilename("///")).toBe("Untitled.pdf");
  });

  it("names a file with campaign data", () => {
    expect(sanitizePdfFilename("Curse", true)).toBe("Curse (with campaign data).pdf");
  });
});
