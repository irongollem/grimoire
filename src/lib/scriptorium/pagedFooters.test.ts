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
  });

  it("injects no footer when page numbers are off", () => {
    const c = makeContainer(["<p>a</p>", "<p>b</p>"]);
    injectPagedFooters(c, { showPageNumbers: false, footerText: "X", start: 1 });
    expect(c.querySelectorAll(".sc-footer")).toHaveLength(0);
  });

  it("suppresses footer on cover pages and does not advance", () => {
    const c = makeContainer([
      '<div data-type="coverPage" data-variant="front"></div>',
      "<p>a</p>",
    ]);
    injectPagedFooters(c, { showPageNumbers: true, footerText: "", start: 1 });
    expect(footerTexts(c)).toEqual([null, "1"]);
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
