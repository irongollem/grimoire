import { describe, expect, it } from "vitest";
import {
  asString,
  isDuplicateEmailError,
  isLoginNameUniqueViolation,
  isValidDisplayName,
  isValidPassword,
  parseBirth,
} from "./validation";

describe("asString", () => {
  it("passes through a string and refuses everything else", () => {
    expect(asString("mira")).toBe("mira");
    expect(asString(7)).toBeNull();
    expect(asString(null)).toBeNull();
    expect(asString(undefined)).toBeNull();
    expect(asString({ month: 3 })).toBeNull();
  });
});

describe("parseBirth", () => {
  it("accepts a { month, year } object of numbers", () => {
    expect(parseBirth({ month: 3, year: 2011 })).toEqual({ month: 3, year: 2011 });
  });

  it("refuses anything malformed, without ever throwing", () => {
    expect(parseBirth(null)).toBeNull();
    expect(parseBirth(undefined)).toBeNull();
    expect(parseBirth("2011-03")).toBeNull();
    expect(parseBirth({ month: "3", year: 2011 })).toBeNull();
    expect(parseBirth({ month: 3 })).toBeNull();
    expect(parseBirth({})).toBeNull();
  });
});

describe("isValidDisplayName", () => {
  it("accepts 1 to 40 characters", () => {
    expect(isValidDisplayName("Mira")).toBe(true);
    expect(isValidDisplayName("a")).toBe(true);
    expect(isValidDisplayName("a".repeat(40))).toBe(true);
  });

  it("refuses empty or over-length names", () => {
    expect(isValidDisplayName("")).toBe(false);
    expect(isValidDisplayName("a".repeat(41))).toBe(false);
  });
});

describe("isValidPassword", () => {
  it("requires at least 8 characters", () => {
    expect(isValidPassword("short")).toBe(false);
    expect(isValidPassword("longenough")).toBe(true);
    expect(isValidPassword("exactly8")).toBe(true);
  });
});

describe("isDuplicateEmailError", () => {
  it("recognizes Supabase auth's duplicate-email shapes", () => {
    expect(isDuplicateEmailError({ code: "email_exists" })).toBe(true);
    expect(isDuplicateEmailError({ message: "A user with this email address has already been registered" })).toBe(true);
    expect(isDuplicateEmailError({ message: "User already registered" })).toBe(true);
  });

  it("refuses unrelated errors and non-error values", () => {
    expect(isDuplicateEmailError({ message: "Invalid password" })).toBe(false);
    expect(isDuplicateEmailError(null)).toBe(false);
    expect(isDuplicateEmailError("boom")).toBe(false);
    expect(isDuplicateEmailError(undefined)).toBe(false);
  });
});

describe("isLoginNameUniqueViolation", () => {
  it("matches a 23505 whose message names login_name", () => {
    expect(
      isLoginNameUniqueViolation({
        code: "23505",
        message: 'duplicate key value violates unique constraint "child_accounts_login_name_key"',
      }),
    ).toBe(true);
  });

  it("refuses a 23505 on a different constraint, and non-23505 errors", () => {
    expect(
      isLoginNameUniqueViolation({
        code: "23505",
        message: 'duplicate key value violates unique constraint "child_accounts_pkey"',
      }),
    ).toBe(false);
    expect(isLoginNameUniqueViolation({ code: "23503", message: "login_name" })).toBe(false);
    expect(isLoginNameUniqueViolation(null)).toBe(false);
  });
});
