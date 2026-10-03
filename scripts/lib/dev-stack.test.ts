import { describe, expect, it } from "vitest";
import { assertRemoteUrl } from "./dev-stack";

describe("assertRemoteUrl", () => {
  it("accepts the hosted project over https", () => {
    expect(assertRemoteUrl("https://abcd.supabase.co").hostname).toBe("abcd.supabase.co");
  });

  it("refuses the local stack, so the script can never pull from what it writes to", () => {
    expect(() => assertRemoteUrl("http://127.0.0.1:54321")).toThrow(/Refusing/);
    expect(() => assertRemoteUrl("https://localhost:54321")).toThrow(/Refusing/);
  });

  it("refuses plain http and a missing value", () => {
    expect(() => assertRemoteUrl("http://abcd.supabase.co")).toThrow(/Refusing/);
    expect(() => assertRemoteUrl(undefined)).toThrow(/VITE_SUPABASE_URL/);
  });
});
