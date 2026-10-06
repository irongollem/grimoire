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
    expect(a5).toMatch(
      /\.pagedjs_page_content img:not\(\.sc-cover-art\):not\(\.sc-entity-art\) \{[^}]*max-height: \d+px[^}]*object-fit: contain/,
    );
  });

  it("leaves a linked entity's art to its own caps (#917)", () => {
    // The blanket image cap outranked theme-base.css's smaller entity-art caps,
    // so a cutout printed past its limit; pagedEntryFit.ts sizes the art to
    // the room the page leaves instead.
    const css = buildPagedPreviewCss({ pageSize: "A4", inkFriendly: false });
    expect(css).toContain("img:not(.sc-cover-art):not(.sc-entity-art)");
  });

  it("lets an entry that cannot fit its page split rather than lose its tail (#915)", () => {
    const css = buildPagedPreviewCss(base);
    expect(css).toMatch(
      /\.sc-statblock-entry\.sc-statblock-entry--split,\s*\.sc-statblock-entry--split \.sc-statblock \{\s*break-inside: auto;/,
    );
    // Sections stay whole even in a split entry.
    expect(css).not.toContain(".sc-statblock-entry--split .sc-statblock-section");
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

  it("keeps boxed content (read-aloud, note, quote, stat block, a wrapped image's group, tables) in one column/page unless taller than one", () => {
    const css = buildPagedPreviewCss(base);
    const boxRule = css.match(/\.sc-descriptive,[\s\S]*?\{[\s\S]*?\}/)?.[0] ?? "";
    expect(boxRule).toContain(".sc-note");
    expect(boxRule).toContain(".sc-quote");
    expect(boxRule).toContain(".sc-statblock");
    expect(boxRule).toContain(".sc-statblock-entry");
    expect(boxRule).toContain(".sc-ability-table");
    expect(boxRule).toContain(".sc-float-group");
    expect(boxRule).toContain(".sc-item-entry");
    expect(boxRule).toContain("table");
    expect(boxRule).toContain("break-inside: avoid");
  });

  it("starts every cover on its own fresh page (#915 story 6 round 2 — two consecutive covers sharing a page name)", () => {
    const css = buildPagedPreviewCss(base);
    expect(css).toMatch(/\.sc-cover\s*\{[^}]*break-before:\s*page/);
  });

  it("never lets a table row split mid-cell", () => {
    const css = buildPagedPreviewCss(base);
    expect(css).toMatch(/\btr\s*\{\s*break-inside:\s*avoid;?\s*\}/);
  });

  it("lets a long box or table break after all, overriding the blanket avoid rule", () => {
    const css = buildPagedPreviewCss(base);
    const longRule = css.match(/\.sc-note\.sc-box--long[\s\S]*?\{[\s\S]*?\}/)?.[0] ?? "";
    expect(longRule).toContain(".sc-descriptive.sc-box--long");
    expect(longRule).toContain("table.sc-table--long");
    expect(longRule).toContain("break-inside: auto");
  });
});
