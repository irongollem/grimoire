// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createBlankPage, needsBlankPageAfter } from "./blankPages";

describe("needsBlankPageAfter", () => {
  it("adds a blank after a chapter of odd length so the next one opens on a right-hand page", () => {
    expect(needsBlankPageAfter(3, false)).toBe(true);
    expect(needsBlankPageAfter(1, false)).toBe(true);
  });

  it("adds none after a chapter of even length", () => {
    expect(needsBlankPageAfter(4, false)).toBe(false);
    expect(needsBlankPageAfter(2, false)).toBe(false);
  });

  it("never adds one after the last chapter, whatever its length (nothing opens after it)", () => {
    expect(needsBlankPageAfter(3, true)).toBe(false);
  });

  it("adds none for an empty chapter", () => {
    expect(needsBlankPageAfter(0, false)).toBe(false);
  });
});

describe("createBlankPage", () => {
  function model(): HTMLElement {
    const page = document.createElement("div");
    page.id = "page-3";
    page.className = "pagedjs_page pagedjs_sc-cover_page pagedjs_first_page pagedjs_right_page";
    page.setAttribute("data-chapter-id", "a");
    page.setAttribute("data-chapter-page", "3");
    page.innerHTML =
      '<div class="pagedjs_pagebox"><div class="pagedjs_area"><div class="pagedjs_page_content"><p>text</p></div></div>' +
      '<div class="sc-footer">3</div><div class="sc-furniture"></div></div>';
    return page;
  }

  it("keeps the page's box but none of its content, footer or furniture", () => {
    const blank = createBlankPage(model(), "a", 3);
    expect(blank.querySelector(".pagedjs_pagebox")).not.toBeNull();
    expect(blank.querySelector("p")).toBeNull();
    expect(blank.querySelector(".sc-footer")).toBeNull();
    expect(blank.querySelector(".sc-furniture")).toBeNull();
  });

  it("is marked blank, belongs to no page number of its chapter, and drops a cover's page variant", () => {
    const blank = createBlankPage(model(), "a", 3);
    expect(blank.hasAttribute("data-blank-page")).toBe(true);
    expect(blank.hasAttribute("data-chapter-page")).toBe(false);
    expect(blank.id).toBe("");
    expect(blank.classList.contains("pagedjs_sc-cover_page")).toBe(false);
    expect(blank.classList.contains("pagedjs_first_page")).toBe(false);
  });

  it("is a left-hand page when it sits at an odd physical index", () => {
    expect(createBlankPage(model(), "a", 3).classList.contains("pagedjs_left_page")).toBe(true);
    expect(createBlankPage(model(), "a", 3).classList.contains("pagedjs_right_page")).toBe(false);
  });
});
