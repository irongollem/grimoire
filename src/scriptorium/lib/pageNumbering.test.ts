// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { flagsFromHtml, flagsFromPage, computePageLabels, type PageNumberFlags } from "./pageNumbering";

const plain: PageNumberFlags = { isUnnumberedCover: false, hasSkip: false, hasReset: false };

describe("flagsFromHtml", () => {
  it("detects front/back covers as unnumbered", () => {
    expect(flagsFromHtml('<div data-type="coverPage" data-variant="front"></div>').isUnnumberedCover).toBe(true);
    expect(flagsFromHtml('<div data-type="coverPage" data-variant="back"></div>').isUnnumberedCover).toBe(true);
  });
  it("does not treat inner/part covers as unnumbered", () => {
    expect(flagsFromHtml('<div data-type="coverPage" data-variant="part"></div>').isUnnumberedCover).toBe(false);
  });
  it("detects skip and reset markers", () => {
    expect(flagsFromHtml('<div data-type="skip-counting"></div>').hasSkip).toBe(true);
    expect(flagsFromHtml('<div data-type="reset-counting"></div>').hasReset).toBe(true);
  });
});

describe("computePageLabels", () => {
  it("returns all null when page numbers are off", () => {
    expect(computePageLabels([plain, plain], { showPageNumbers: false, start: 1 })).toEqual([null, null]);
  });

  it("numbers sequentially from the start value", () => {
    expect(computePageLabels([plain, plain, plain], { showPageNumbers: true, start: 1 })).toEqual(["1", "2", "3"]);
    expect(computePageLabels([plain, plain], { showPageNumbers: true, start: 5 })).toEqual(["5", "6"]);
  });

  // #1115 (Jeffrey, 30 Oct 2026): the cover is page 1 without a number, so the
  // first number falls on a left-hand page and every chapter opens on an odd one.
  it("counts the front cover as page 1 but prints no number on it", () => {
    const flags = [{ ...plain, isUnnumberedCover: true }, plain, plain];
    expect(computePageLabels(flags, { showPageNumbers: true, start: 1 })).toEqual([null, "2", "3"]);
  });

  it("skips a page without advancing", () => {
    const flags = [plain, { ...plain, hasSkip: true }, plain];
    expect(computePageLabels(flags, { showPageNumbers: true, start: 1 })).toEqual(["1", null, "2"]);
  });

  it("resets the counter to start", () => {
    const flags = [plain, plain, { ...plain, hasReset: true }, plain];
    expect(computePageLabels(flags, { showPageNumbers: true, start: 1 })).toEqual(["1", "2", "1", "2"]);
  });

  it("applies reset then skip on the same page (reset wins the counter, skip blanks the label)", () => {
    const flags = [plain, plain, { ...plain, hasReset: true, hasSkip: true }, plain];
    expect(computePageLabels(flags, { showPageNumbers: true, start: 1 })).toEqual(["1", "2", null, "1"]);
  });
});

describe("blank pages", () => {
  const blank: PageNumberFlags = { ...plain, isBlank: true };

  it("counts a blank page but prints no number on it (the next chapter's number must not fall back by one)", () => {
    expect(computePageLabels([plain, plain, plain, blank, plain], { showPageNumbers: true, start: 1 })).toEqual([
      "1", "2", "3", null, "5",
    ]);
  });

  it("is read from the page's marker, not its (empty) markup", () => {
    const page = document.createElement("div");
    page.setAttribute("data-blank-page", "");
    expect(flagsFromPage(page).isBlank).toBe(true);
    expect(flagsFromPage(document.createElement("div")).isBlank).toBeUndefined();
  });
});
