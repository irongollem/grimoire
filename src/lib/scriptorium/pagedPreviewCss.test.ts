import { describe, it, expect } from "vitest";
import { buildPagedPreviewCss, escapeCssString } from "./pagedPreviewCss";

const base = {
  pageSize: "A4" as const,
  theme: "onednd2024" as const,
  showPageNumbers: true,
  footerText: "Icewind Dale",
  inkFriendly: false,
};

describe("escapeCssString", () => {
  it("escapes double quotes and backslashes", () => {
    expect(escapeCssString('a"b\\c')).toBe('a\\"b\\\\c');
  });
});

describe("buildPagedPreviewCss", () => {
  it("sets @page size per page size", () => {
    expect(buildPagedPreviewCss(base)).toContain("size: A4;");
    expect(buildPagedPreviewCss({ ...base, pageSize: "Letter" })).toContain("size: letter;");
    expect(buildPagedPreviewCss({ ...base, pageSize: "A5" })).toContain("size: A5;");
  });

  it("emits page-number margin boxes only when enabled", () => {
    expect(buildPagedPreviewCss(base)).toContain("counter(page)");
    expect(buildPagedPreviewCss({ ...base, showPageNumbers: false })).not.toContain("counter(page)");
  });

  it("alternates page number to the outer edge (recto/verso)", () => {
    const css = buildPagedPreviewCss(base);
    expect(css).toContain("@page :right");
    expect(css).toContain("@page :left");
  });

  it("includes footer text when present, omits the box when empty", () => {
    expect(buildPagedPreviewCss(base)).toContain('content: "Icewind Dale"');
    const noFooter = buildPagedPreviewCss({ ...base, footerText: "" });
    expect(noFooter).not.toContain("@bottom-center");
  });

  it("escapes footer text", () => {
    const css = buildPagedPreviewCss({ ...base, footerText: 'The "Frozen" Gate' });
    expect(css).toContain('content: "The \\"Frozen\\" Gate"');
  });

  it("drops the page background in ink-friendly mode", () => {
    expect(buildPagedPreviewCss(base)).toContain("page-background.webp");
    const ink = buildPagedPreviewCss({ ...base, inkFriendly: true });
    expect(ink).not.toContain("page-background.webp");
    expect(ink).toContain("background: #fff;");
  });

  it("always styles the page chrome container", () => {
    expect(buildPagedPreviewCss(base)).toContain(".pagedjs_page");
    expect(buildPagedPreviewCss(base)).toContain(".pagedjs_pages");
  });

  it("includes break-before rules for hr and pageBreak (Paged.js reads these)", () => {
    const css = buildPagedPreviewCss(base);
    expect(css).toMatch(/hr,\s*\.sc-page-break/);
    expect(css).toContain("break-before: page");
  });
});
