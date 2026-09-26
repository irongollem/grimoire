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

  it("caps images below the page's content height so Paged.js never repeats one on the next page", () => {
    // A4 is 1123px tall at 96dpi; minus the 109px of vertical @page margin,
    // 80% of the 1014px content box is 811px.
    expect(buildPagedPreviewCss({ pageSize: "A4", inkFriendly: false })).toContain("max-height: 811px");
    const a5 = buildPagedPreviewCss({ pageSize: "A5", inkFriendly: false });
    expect(a5).toMatch(/\.pagedjs_page_content img \{[^}]*max-height: \d+px[^}]*object-fit: contain/);
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

  it("keeps h2/h3 and a stat block's section titles with what follows them (#915 story 6)", () => {
    const css = buildPagedPreviewCss(base);
    expect(css).toMatch(/h2,\s*h3,\s*\.sc-statblock-section-title\s*\{[^}]*break-after:\s*avoid/);
  });

  it("starts a monster/NPC entry on a fresh page by default, moving the break to a directly-preceding family heading", () => {
    const css = buildPagedPreviewCss(base);
    expect(css).toMatch(/\.sc-entity-embed--startpage\s*\{[^}]*break-before:\s*page/);
    expect(css).toMatch(/h2:has\(\+ \.sc-entity-embed--startpage\)\s*\{[^}]*break-before:\s*page/);
    expect(css).toMatch(/h2 \+ \.sc-entity-embed--startpage\s*\{[^}]*break-before:\s*avoid/);
  });

  it("keeps boxed content (read-aloud, note, quote, stat block, tables) in one column/page unless taller than one", () => {
    const css = buildPagedPreviewCss(base);
    const boxRule = css.match(/\.sc-descriptive,[\s\S]*?\{[\s\S]*?\}/)?.[0] ?? "";
    expect(boxRule).toContain(".sc-note");
    expect(boxRule).toContain(".sc-quote");
    expect(boxRule).toContain(".sc-statblock");
    expect(boxRule).toContain(".sc-ability-table");
    expect(boxRule).toContain("table");
    expect(boxRule).toContain("break-inside: avoid");
  });
});
