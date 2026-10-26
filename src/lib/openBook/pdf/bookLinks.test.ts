// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { prepareSectionHtml, rewriteBookHref, type LinkContext } from "./bookLinks";

const ctx: LinkContext = { slug: "saltreach", origin: "https://app.example", entryIds: new Set(["abc", "def"]) };

describe("rewriteBookHref", () => {
  it("points a page the book holds at its anchor", () => {
    expect(rewriteBookHref("/w/saltreach/atlas/abc", ctx)).toBe("#e-abc");
  });

  it("falls back to the public address for a page the book does not hold", () => {
    expect(rewriteBookHref("/w/saltreach/atlas/gone", ctx)).toBe("https://app.example/w/saltreach/atlas/gone");
  });

  it("maps the book's own pages: contents, index, almanac and chapters", () => {
    expect(rewriteBookHref("/w/saltreach/contents", ctx)).toBe("#contents");
    expect(rewriteBookHref("/w/saltreach/index", ctx)).toBe("#index");
    expect(rewriteBookHref("/w/saltreach/chronicle", ctx)).toBe("#almanac");
    expect(rewriteBookHref("/w/saltreach/folk", ctx)).toBe("#chapter-folk");
  });

  it("makes the cover a public address, since the PDF's own cover has no anchor", () => {
    expect(rewriteBookHref("/w/saltreach", ctx)).toBe("https://app.example/w/saltreach");
  });

  it("leaves other books and other sites alone", () => {
    expect(rewriteBookHref("/w/elsewhere/atlas/abc", ctx)).toBe("/w/elsewhere/atlas/abc");
    expect(rewriteBookHref("https://example.org/page", ctx)).toBe("https://example.org/page");
  });
});

describe("prepareSectionHtml", () => {
  const html = `<a href="/w/saltreach/atlas/abc">A</a><img src="x.webp" loading="lazy"><button class="book-step">next</button>`;

  it("rewrites links, loads pictures at once and drops the almanac's buttons", () => {
    const out = prepareSectionHtml(html, ctx);
    expect(out).toContain('href="#e-abc"');
    expect(out).not.toContain("loading=");
    expect(out).not.toContain("<button");
    expect(out).toContain("<span></span>");
  });

  it("gives each index row a page-number link when asked", () => {
    const row = `<div class="book-ref"><a class="book-xref" href="/w/saltreach/atlas/def">D</a><span class="book-ref-note">Atlas</span></div>`;
    expect(prepareSectionHtml(row, ctx, { pageRefs: true })).toContain('<a class="pb-pg" href="#e-def"></a>');
    expect(prepareSectionHtml(row, ctx)).not.toContain("pb-pg");
  });

  it("skips a row whose name is not a page of the book", () => {
    const row = `<div class="book-ref"><span class="book-name">Nobody</span></div>`;
    expect(prepareSectionHtml(row, ctx, { pageRefs: true })).not.toContain("pb-pg");
  });

  it("gives each connection line a page-number link, wherever it sits", () => {
    const row = `<div class="book-conn"><span class="book-conn-text"><a class="book-xref" href="/w/saltreach/atlas/def">D</a></span><span class="book-conn-lead"></span></div>`;
    expect(prepareSectionHtml(row, ctx)).toContain('<a class="pb-pg" href="#e-def"></a>');
  });
});
