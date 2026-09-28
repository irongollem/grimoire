import { describe, expect, it } from "vitest";
import { CHILD_LOGIN_DOMAIN } from "../_shared/childAccount";
import { asString, isValidParentEmail } from "./validation";

describe("isValidParentEmail", () => {
  it("accepts a plausible address", () => {
    expect(isValidParentEmail("parent@example.com")).toBe(true);
  });

  it("refuses an empty, malformed, or over-length address", () => {
    expect(isValidParentEmail("")).toBe(false);
    expect(isValidParentEmail("not-an-email")).toBe(false);
    expect(isValidParentEmail("missing-at-sign.com")).toBe(false);
    expect(isValidParentEmail(`a${"a".repeat(320)}@example.com`)).toBe(false);
  });

  it("refuses a child login address, which can never receive mail", () => {
    expect(isValidParentEmail(`mira@${CHILD_LOGIN_DOMAIN}`)).toBe(false);
  });
});

describe("asString", () => {
  it("passes through a string and refuses everything else", () => {
    expect(asString("parent@example.com")).toBe("parent@example.com");
    expect(asString(null)).toBeNull();
    expect(asString(42)).toBeNull();
  });
});
