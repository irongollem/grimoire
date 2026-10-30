// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { injectPagedFooters } from "./pagedFooters";

/** Build a container of fake Paged.js pages from per-page inner HTML. */
function makeContainer(pageHtml: string[]): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = pageHtml
    .map((h) => `<div class="pagedjs_page"><div class="pagedjs_pagebox">${h}</div></div>`)
    .join("");
  return container;
}

function footerTexts(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".pagedjs_page")).map((p) => {
    const f = p.querySelector(".sc-footer");
    if (!f) return null;
    return Array.from(f.querySelectorAll(".sc-footer-num"))[0]?.textContent ?? "";
  });
}

describe("injectPagedFooters", () => {
  it("numbers plain pages and rides footer text on numbered pages", () => {
    const c = makeContainer(["<p>a</p>", "<p>b</p>"]);
    injectPagedFooters(c, { showPageNumbers: true, footerText: "Icewind Dale", start: 1 });
    expect(footerTexts(c)).toEqual(["1", "2"]);
    expect(c.querySelector(".sc-footer-text")?.textContent).toBe("Icewind Dale");
    // The number is printed on both sides of the footer text.
    const nums = Array.from(c.querySelector(".sc-footer")!.querySelectorAll(".sc-footer-num")).map((e) => e.textContent);
    expect(nums).toEqual(["1", "1"]);
  });

  it("injects no footer when page numbers are off", () => {
    const c = makeContainer(["<p>a</p>", "<p>b</p>"]);
    injectPagedFooters(c, { showPageNumbers: false, footerText: "X", start: 1 });
    expect(c.querySelectorAll(".sc-footer")).toHaveLength(0);
  });

  it("prints no footer on the cover, which still counts as page 1", () => {
    const c = makeContainer([
      '<div data-type="coverPage" data-variant="front"></div>',
      "<p>a</p>",
    ]);
    injectPagedFooters(c, { showPageNumbers: true, footerText: "", start: 1 });
    expect(footerTexts(c)).toEqual([null, "2"]);
  });

  it("honours skip and reset markers", () => {
    const c = makeContainer([
      "<p>a</p>",
      '<div data-type="skip-counting"></div><p>b</p>',
      '<div data-type="reset-counting"></div><p>c</p>',
    ]);
    injectPagedFooters(c, { showPageNumbers: true, footerText: "", start: 1 });
    expect(footerTexts(c)).toEqual(["1", null, "1"]);
  });

  it("applies the start offset", () => {
    const c = makeContainer(["<p>a</p>", "<p>b</p>"]);
    injectPagedFooters(c, { showPageNumbers: true, footerText: "", start: 7 });
    expect(footerTexts(c)).toEqual(["7", "8"]);
  });

  it("is idempotent (re-injection does not stack footers)", () => {
    const c = makeContainer(["<p>a</p>"]);
    injectPagedFooters(c, { showPageNumbers: true, footerText: "", start: 1 });
    injectPagedFooters(c, { showPageNumbers: true, footerText: "", start: 1 });
    expect(c.querySelectorAll(".sc-footer")).toHaveLength(1);
  });

  it("alternates recto/verso by page index", () => {
    const c = makeContainer(["<p>a</p>", "<p>b</p>"]);
    injectPagedFooters(c, { showPageNumbers: true, footerText: "", start: 1 });
    const footers = c.querySelectorAll(".sc-footer");
    expect(footers[0].classList.contains("sc-footer--recto")).toBe(true);
    expect(footers[1].classList.contains("sc-footer--verso")).toBe(true);
  });
});

describe("injectPagedFooters with blank pages", () => {
  it("puts no footer on a blank page, keeps counting through it, and keeps recto/verso by physical page", () => {
    const c = document.createElement("div");
    c.innerHTML =
      '<div class="pagedjs_page"><div class="pagedjs_pagebox">a</div></div>' +
      '<div class="pagedjs_page" data-blank-page=""><div class="pagedjs_pagebox"></div></div>' +
      '<div class="pagedjs_page"><div class="pagedjs_pagebox">b</div></div>';
    injectPagedFooters(c, { showPageNumbers: true, footerText: "T", start: 1 });
    expect(footerTexts(c)).toEqual(["1", null, "3"]);
    const feet = Array.from(c.querySelectorAll(".sc-footer"));
    expect(feet.map((f) => f.classList.contains("sc-footer--recto"))).toEqual([true, true]);
  });

  it("uses labels it is handed instead of working them out again", () => {
    const c = makeContainer(["a", "b"]);
    injectPagedFooters(c, { showPageNumbers: true, footerText: "", start: 1, labels: ["7", null] });
    expect(footerTexts(c)).toEqual(["7", null]);
  });
});
