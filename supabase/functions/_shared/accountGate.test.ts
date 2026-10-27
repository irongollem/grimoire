import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake, type SupabaseFake } from "@/test/supabaseFake";
import { generationRefusal, isAccountSuspended, isChildAccount } from "./accountGate";

// A fake that holds rows and honours the filters, so a read that forgets to scope
// to the caller (or to compare adult_on) returns the wrong answer instead of
// passing on a stub that answers the same whatever it was asked.
let fake: SupabaseFake;
const admin = () => fake.client as unknown as SupabaseClient;

const TODAY = "2026-10-27";

beforeEach(() => {
  fake = createSupabaseFake();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const quiet = () => vi.spyOn(console, "error").mockImplementation(() => undefined);

describe("isAccountSuspended", () => {
  it("is true only for the caller's own frozen row, never another account's", async () => {
    fake.seed("user_subscriptions", [
      { user_id: "frozen", suspended_at: "2026-01-01T00:00:00Z" },
      { user_id: "active", suspended_at: null },
    ]);
    await expect(isAccountSuspended(admin(), "frozen")).resolves.toBe(true);
    await expect(isAccountSuspended(admin(), "active")).resolves.toBe(false);
    await expect(isAccountSuspended(admin(), "no-row")).resolves.toBe(false);
  });

  it("fails open on a query error", async () => {
    quiet();
    fake.failNext("user_subscriptions", { message: "offline" });
    await expect(isAccountSuspended(admin(), "u1")).resolves.toBe(false);
  });
});

describe("isChildAccount", () => {
  it("is true only for the caller's own row, and only while adult_on is still ahead", async () => {
    fake.seed("child_accounts", [
      { child_user_id: "kid", adult_on: "2027-04-01" },
      { child_user_id: "grown", adult_on: "2026-01-01" },
    ]);
    await expect(isChildAccount(admin(), "kid")).resolves.toBe(true);
    await expect(isChildAccount(admin(), "grown")).resolves.toBe(false);
    // Someone else's child row must not make an unrelated adult a child.
    await expect(isChildAccount(admin(), "adult")).resolves.toBe(false);
  });

  it("is an adult on the very day adult_on arrives", async () => {
    fake.seed("child_accounts", [
      { child_user_id: "turns-today", adult_on: TODAY },
      { child_user_id: "turns-tomorrow", adult_on: "2026-10-28" },
    ]);
    await expect(isChildAccount(admin(), "turns-today")).resolves.toBe(false);
    await expect(isChildAccount(admin(), "turns-tomorrow")).resolves.toBe(true);
  });

  it("throws on a query error, leaving fail-open/fail-closed to the caller", async () => {
    fake.failNext("child_accounts", { message: "offline" });
    await expect(isChildAccount(admin(), "u1")).rejects.toMatchObject({ message: "offline" });
  });
});

describe("generationRefusal", () => {
  const kid = { child_user_id: "u1", adult_on: "2027-04-01" };
  const frozen = { user_id: "u1", suspended_at: "2026-01-01T00:00:00Z" };

  it("refuses a suspended account", async () => {
    fake.seed("user_subscriptions", [frozen]);
    const res = await generationRefusal(admin(), "u1");
    expect(res?.status).toBe(403);
    await expect(res?.json()).resolves.toEqual({ error: "account_suspended" });
  });

  it("refuses an active child account", async () => {
    fake.seed("child_accounts", [kid]);
    const res = await generationRefusal(admin(), "u1");
    expect(res?.status).toBe(403);
    await expect(res?.json()).resolves.toEqual({ error: "child_account" });
  });

  it("answers a frozen child with the freeze, not the child refusal", async () => {
    fake.seed("user_subscriptions", [frozen]);
    fake.seed("child_accounts", [kid]);
    const res = await generationRefusal(admin(), "u1");
    await expect(res?.json()).resolves.toEqual({ error: "account_suspended" });
  });

  it("lets an adult through even when another account is frozen or a child", async () => {
    fake.seed("user_subscriptions", [{ user_id: "someone-else", suspended_at: "2026-01-01T00:00:00Z" }]);
    fake.seed("child_accounts", [{ child_user_id: "someone-else", adult_on: "2027-04-01" }]);
    await expect(generationRefusal(admin(), "u1")).resolves.toBeNull();
  });

  it("fails open when the child-account lookup errors", async () => {
    quiet();
    fake.failNext("child_accounts", { message: "offline" });
    await expect(generationRefusal(admin(), "u1")).resolves.toBeNull();
  });

  it("refuses with 503 on a lookup error when the caller asks to fail closed", async () => {
    quiet();
    fake.failNext("child_accounts", { message: "offline" });
    const res = await generationRefusal(admin(), "u1", { failClosed: true });
    expect(res?.status).toBe(503);
    await expect(res?.json()).resolves.toEqual({ error: "account_check_failed" });
  });
});
