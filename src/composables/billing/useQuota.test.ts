import { describe, expect, it } from "vitest";
import { isOverQuota } from "./useQuota";

describe("isOverQuota", () => {
  it("is false until the quota has loaded", () => {
    expect(isOverQuota(undefined)).toBe(false);
  });

  it("is false for an unlimited quota whatever the count", () => {
    expect(isOverQuota({ allowed: true, current: 9, limit: -1, unlimited: true })).toBe(false);
  });

  it("is false at the limit", () => {
    expect(isOverQuota({ allowed: false, current: 1, limit: 1, unlimited: false })).toBe(false);
  });

  it("is true over the limit", () => {
    expect(isOverQuota({ allowed: false, current: 2, limit: 1, unlimited: false })).toBe(true);
  });
});
