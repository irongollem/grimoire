import { describe, it, expect } from "vitest";
import { buildPagedPreviewCss } from "./pagedPreviewCss";

const base = { pageSize: "A4" as const, inkFriendly: false };

describe("buildPagedPreviewCss", () => {
  it("sets @page size per page size", () => {
    expect(buildPagedPreviewCss(base)).toContain("size: A4;");
    expect(buildPagedPreviewCss({ ...base, pageSize: "Letter" })).toContain("size: letter;");
    expect(buildPagedPreviewCss({ ...base, pageSize: "A5" })).toContain("size: A5;");
  });

  it("includes break-before rules for hr and pageBreak (Paged.js reads these)", () => {
    const css = buildPagedPreviewCss(base);
    expect(css).toMatch(/hr,\s*\.sc-page-break/);
    expect(css).toContain("break-before: page");
  });

  it("drops the page background in ink-friendly mode", () => {
    expect(buildPagedPreviewCss(base)).toContain("page-background.webp");
    const ink = buildPagedPreviewCss({ ...base, inkFriendly: true });
    expect(ink).not.toContain("page-background.webp");
    expect(ink).toContain("background: #fff;");
  });

  it("styles the page chrome containers and footer position context", () => {
    const css = buildPagedPreviewCss(base);
    expect(css).toContain(".pagedjs_page");
    expect(css).toContain(".pagedjs_pages");
    expect(css).toContain(".pagedjs_pagebox { position: relative; }");
  });

  it("no longer emits @page footer boxes (injection handles footers)", () => {
    const css = buildPagedPreviewCss(base);
    expect(css).not.toContain("counter(page)");
    expect(css).not.toContain("@bottom-center");
  });
});
