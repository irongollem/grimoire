// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { markChapterOpener, preparePagedBody } from "./pagedPrepare";

const opts = { showPageNumbers: true, pageSize: "A4" as const, isTwoColumn: false };

describe("preparePagedBody", () => {
  it("wraps the body in the two-column flow only when asked", () => {
    expect(preparePagedBody("<p>Hi</p>", { ...opts, isTwoColumn: true })).toBe('<div class="phb-two-col"><p>Hi</p></div>');
    expect(preparePagedBody("<p>Hi</p>", opts)).toBe("<p>Hi</p>");
  });

  it("drops trailing empty paragraphs, and builds the contents list for the page size and numbering it is given", () => {
    const html = '<nav data-type="toc"></nav><h1>Chapter</h1><p>x</p><p></p>';
    const a5 = preparePagedBody(html, { ...opts, pageSize: "A5" });
    expect(a5).toContain("sc-toc-cols-1");
    expect(a5).toContain("sc-toc-page");
    expect(a5.endsWith("<p>x</p>")).toBe(true);
    expect(preparePagedBody(html, { ...opts, showPageNumbers: false })).not.toContain("sc-toc-page");
  });

  it("runs every pre-layout step: long boxes, table headers and wrapped-image groups", () => {
    const html =
      `<div class="sc-note"><p>${"x".repeat(900)}</p></div>` +
      "<table><tbody><tr><th>Item</th><th>Value</th></tr><tr><td>Swan</td><td>Keepsake</td></tr></tbody></table>" +
      '<h2>Rosie</h2><div class="sc-img-wrap sc-img-wrap--wrapLeft"><img src="r.webp"></div><p>Fighter.</p>';
    const out = document.createElement("div");
    out.innerHTML = preparePagedBody(html, opts);
    expect(out.querySelector(".sc-note")?.classList.contains("sc-box--long")).toBe(true);
    expect(out.querySelector("thead th")?.textContent).toBe("Item");
    expect(out.querySelector(".sc-float-group h2")?.textContent).toBe("Rosie");
  });
});

describe("markChapterOpener", () => {
  it("marks the first title of the chapter and no other (the look hangs a ribbon on exactly one heading)", () => {
    const out = document.createElement("div");
    out.innerHTML = markChapterOpener("<p>Intro</p><h1>One</h1><h1>Two</h1>");
    const titles = out.querySelectorAll("h1");
    expect(titles[0].classList.contains("sc-chapter-opener")).toBe(true);
    expect(titles[1].classList.contains("sc-chapter-opener")).toBe(false);
  });

  it("skips a heading that sits in a cover or a box (a sidebar's title is not the chapter's)", () => {
    const out = document.createElement("div");
    out.innerHTML = markChapterOpener('<div class="sc-cover"><h1>Cover</h1></div><div class="sc-note"><h1>Aside</h1></div><h1>Real</h1>');
    expect(out.querySelector(".sc-chapter-opener")?.textContent).toBe("Real");
  });

  it("leaves a chapter with no title exactly as it was", () => {
    expect(markChapterOpener("<h2>Only</h2><p>x</p>")).toBe("<h2>Only</h2><p>x</p>");
  });

  it("is applied by the pre-layout pass for both preview and print", () => {
    expect(preparePagedBody("<h1>Ch</h1><p>x</p>", opts)).toContain('class="sc-chapter-opener"');
  });
});
