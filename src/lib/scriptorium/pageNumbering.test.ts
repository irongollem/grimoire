import { describe, it, expect } from "vitest";
import { flagsFromHtml, computePageLabels, type PageNumberFlags } from "./pageNumbering";

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

  it("leaves covers unnumbered without advancing the counter", () => {
    const flags = [{ ...plain, isUnnumberedCover: true }, plain, plain];
    expect(computePageLabels(flags, { showPageNumbers: true, start: 1 })).toEqual([null, "1", "2"]);
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
