// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { closePagedStrings, isOpenString } from "./layoutBook";

describe("isOpenString", () => {
  it("tells a closed string from one Paged.js left open", () => {
    expect(isOpenString('"I · The Atlas')).toBe(true);
    expect(isOpenString('"I · The Atlas"')).toBe(false);
    expect(isOpenString('"')).toBe(true);
    expect(isOpenString('"say \\"hi\\"')).toBe(true);
    // An escaped quote does not close the string it sits in.
    expect(isOpenString('"a\\"b"')).toBe(false);
    expect(isOpenString("none")).toBe(false);
  });
});

describe("closePagedStrings", () => {
  it("closes the running-head strings and touches nothing else", () => {
    const page = document.createElement("div");
    page.style.setProperty("--pagedjs-string-first-chapter", '"I · The Atlas');
    page.style.setProperty("--pagedjs-string-first-except-entry", '"');
    page.style.setProperty("--ob-folio", '"4"');
    page.style.setProperty("--other-string", '"left open');
    closePagedStrings([page]);
    expect(page.style.getPropertyValue("--other-string")).toBe('"left open');
    expect(page.style.getPropertyValue("--pagedjs-string-first-chapter")).toBe('"I · The Atlas"');
    expect(page.style.getPropertyValue("--pagedjs-string-first-except-entry")).toBe('""');
    expect(page.style.getPropertyValue("--ob-folio")).toBe('"4"');
  });
});
