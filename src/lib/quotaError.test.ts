import { describe, expect, it } from "vitest";
import { isQuotaExceeded } from "./quotaError";

// The server-side shape, verified against the source: enforce_quota() (the
// BEFORE INSERT trigger every quota-capped table carries — see
// supabase/migrations/20260731000001_transfer_campaign_ownership.sql) does
//
//   raise exception 'quota_exceeded'
//     using detail = TG_TABLE_NAME,
//           hint   = 'Upgrade to Pro DM to create more ' || TG_TABLE_NAME;
//
// PostgREST reflects a raised exception's MESSAGE verbatim into the response
// body's `message` field, and supabase-js's PostgrestError constructor sets
// `this.message` to exactly that (see
// node_modules/@supabase/postgrest-js/src/PostgrestError.ts). Every create
// path in this repo throws that error object unwrapped (`if (error) throw
// error`), so `error.message` reaching the client is always the literal
// string "quota_exceeded" — never a longer sentence around it. Equality is
// therefore the correct check, not a substring match.
describe("isQuotaExceeded", () => {
  it("matches the exact message the enforce_quota trigger raises", () => {
    expect(isQuotaExceeded({ message: "quota_exceeded" })).toBe(true);
  });

  it("matches a caught PostgrestError-shaped object with the sibling detail/hint fields", () => {
    expect(
      isQuotaExceeded({
        message: "quota_exceeded",
        details: "npcs",
        hint: "Upgrade to Pro DM to create more npcs",
        code: "P0001",
      }),
    ).toBe(true);
  });

  it("matches a plain Error carrying the same message (e.g. in tests)", () => {
    expect(isQuotaExceeded(new Error("quota_exceeded"))).toBe(true);
  });

  it("does not match a message that merely contains the string as a substring", () => {
    expect(isQuotaExceeded({ message: "Failed to save: quota_exceeded" })).toBe(false);
    expect(isQuotaExceeded(new Error("quota_exceeded_ish"))).toBe(false);
  });

  it("does not match an unrelated error", () => {
    expect(isQuotaExceeded(new Error("network error"))).toBe(false);
    expect(isQuotaExceeded({ message: "permission denied" })).toBe(false);
  });

  it("handles non-object and empty input without throwing", () => {
    expect(isQuotaExceeded(null)).toBe(false);
    expect(isQuotaExceeded(undefined)).toBe(false);
    expect(isQuotaExceeded("quota_exceeded")).toBe(false);
    expect(isQuotaExceeded({})).toBe(false);
  });
});
