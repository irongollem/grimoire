import { describe, it, expect, vi } from "vitest";

// buildPrintDocumentHtml is pure and never touches Paged.js, but importing
// the module still pulls in the real `pagedjs` package (used by
// printDocument(), left untested here per the story — see module doc).
// Stub it so this file doesn't pay for or depend on its real behaviour.
vi.mock("pagedjs", () => ({ Previewer: class {} }));

import { buildPrintDocumentHtml } from "./useScriptoriumPrint";

const BASE = {
  title: "My Adventure",
  theme: "onednd2024" as const,
  pageSize: "A4" as const,
  themeCss: ".theme-css {}",
  pagedCss: ".paged-css {}",
  pagedStyles: ".injected {}",
  pagesHtml: "<div class=\"pagedjs_pages\"></div>",
};

describe("buildPrintDocumentHtml", () => {
  it("assembles a full HTML document with every stylesheet in order", () => {
    const html = buildPrintDocumentHtml(BASE);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<title>My Adventure</title>");
    const order = [".theme-css {}", ".paged-css {}", ".injected {}"].map((css) => html.indexOf(css));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain(BASE.pagesHtml);
  });

  it("escapes the title against HTML injection", () => {
    const html = buildPrintDocumentHtml({ ...BASE, title: '<script>alert(1)</script> & "quotes"' });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;quotes&quot;");
  });

  it("falls back to 'Untitled' when the title is empty", () => {
    const html = buildPrintDocumentHtml({ ...BASE, title: "" });
    expect(html).toContain("<title>Untitled</title>");
  });

  it.each([
    ["A4", "size: A4;"],
    ["A5", "size: A5;"],
    ["Letter", "size: letter;"],
  ] as const)("maps page size %s to the @page keyword %s", (pageSize, expected) => {
    const html = buildPrintDocumentHtml({ ...BASE, pageSize });
    expect(html).toContain(expected);
  });

  it("applies the phb2014 theme class on the body", () => {
    const html = buildPrintDocumentHtml({ ...BASE, theme: "phb2014" });
    expect(html).toContain('<body class="sc-theme theme-phb2014">');
  });

  it("applies the onednd2024 theme class on the body by default", () => {
    const html = buildPrintDocumentHtml(BASE);
    expect(html).toContain('<body class="sc-theme theme-onednd2024">');
  });
});
