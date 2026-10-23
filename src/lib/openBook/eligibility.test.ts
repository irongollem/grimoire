import { describe, expect, it } from "vitest";
import { isInBook, wholeParty } from "./eligibility";

describe("wholeParty", () => {
  it("is false for an empty party, whatever the entry holds", () => {
    expect(wholeParty(["a"], [])).toBe(false);
    expect(wholeParty(null, [])).toBe(false);
  });
  it("is false when the entry is visible to nobody", () => {
    expect(wholeParty(null, ["a"])).toBe(false);
    expect(wholeParty(undefined, ["a"])).toBe(false);
    expect(wholeParty([], ["a"])).toBe(false);
  });
  it("needs every member, and allows extras", () => {
    expect(wholeParty(["a"], ["a", "b"])).toBe(false);
    expect(wholeParty(["a", "b"], ["a", "b"])).toBe(true);
    expect(wholeParty(["b", "a", "gone"], ["a", "b"])).toBe(true);
  });
});

describe("isInBook", () => {
  it("never takes an ineligible entry", () => {
    expect(isInBook(false, true, true)).toBe(false);
  });
  it("lets the DM's choice beat the default", () => {
    expect(isInBook(true, false, true)).toBe(false);
    expect(isInBook(true, true, false)).toBe(true);
  });
  it("falls back to the default without a choice", () => {
    expect(isInBook(true, undefined, true)).toBe(true);
    expect(isInBook(true, undefined, false)).toBe(false);
  });
});
