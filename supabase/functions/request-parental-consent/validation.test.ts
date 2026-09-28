import { describe, expect, it } from "vitest";
import { CHILD_LOGIN_DOMAIN } from "../_shared/childAccount";
import { addressRateLimitKey, asString, bearerSubject, isValidParentEmail } from "./validation";

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

function jwt(payload: Record<string, unknown>): string {
  const b64 = (v: unknown) => btoa(JSON.stringify(v)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.signature`;
}

describe("bearerSubject", () => {
  it("reads the user id from a session token", () => {
    expect(bearerSubject(`Bearer ${jwt({ sub: "u-1", role: "authenticated" })}`)).toBe("u-1");
  });

  it("treats the anon key, a publishable key, garbage or no header as anonymous", () => {
    expect(bearerSubject(`Bearer ${jwt({ role: "anon" })}`)).toBeNull();
    expect(bearerSubject("Bearer sb_publishable_abc123")).toBeNull();
    expect(bearerSubject("Bearer not.a.jwt")).toBeNull();
    expect(bearerSubject(null)).toBeNull();
  });
});

describe("addressRateLimitKey", () => {
  it("is a uuid, stable across case and whitespace", async () => {
    const a = await addressRateLimitKey("Parent@Example.com ");
    const b = await addressRateLimitKey("parent@example.com");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("differs between addresses", async () => {
    expect(await addressRateLimitKey("a@example.com")).not.toBe(await addressRateLimitKey("b@example.com"));
  });
});
