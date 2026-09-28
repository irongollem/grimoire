import { describe, expect, it, vi } from "vitest";
import { generationRefusal, isAccountSuspended, isChildAccount } from "./accountGate";

/**
 * Stubs both tables `generationRefusal` reads: `user_subscriptions` (via
 * `isAccountSuspended`) and `child_accounts` (via `isChildAccount`). Each is
 * keyed by table name so a test can control them independently; a table left
 * out of `results` resolves to `{ data: null, error: null }` (not suspended,
 * not a child), matching an ordinary adult account with no ledger surprises.
 */
function stubClient(results: Partial<Record<"user_subscriptions" | "child_accounts", { data: unknown; error?: unknown }>>) {
  const from = vi.fn((table: string) => {
    const result = results[table as "user_subscriptions" | "child_accounts"] ?? { data: null, error: null };
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      gt: vi.fn(() => query),
      maybeSingle: vi.fn().mockResolvedValue({ data: result.data, error: result.error ?? null }),
    };
    return query;
  });
  return { from } as never;
}

describe("isAccountSuspended", () => {
  it("is true only when suspended_at is set", async () => {
    await expect(isAccountSuspended(stubClient({ user_subscriptions: { data: { suspended_at: "2026-01-01" } } }), "u1"))
      .resolves.toBe(true);
    await expect(isAccountSuspended(stubClient({ user_subscriptions: { data: { suspended_at: null } } }), "u1"))
      .resolves.toBe(false);
    await expect(isAccountSuspended(stubClient({ user_subscriptions: { data: null } }), "u1"))
      .resolves.toBe(false);
  });

  it("fails open on a query error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      isAccountSuspended(stubClient({ user_subscriptions: { data: null, error: { message: "offline" } } }), "u1"),
    ).resolves.toBe(false);
    spy.mockRestore();
  });
});

describe("isChildAccount", () => {
  it("is true for an active child (adult_on in the future)", async () => {
    await expect(
      isChildAccount(stubClient({ child_accounts: { data: { child_user_id: "u1" } } }), "u1"),
    ).resolves.toBe(true);
  });

  it("is false for an adult with no child_accounts row", async () => {
    await expect(isChildAccount(stubClient({ child_accounts: { data: null } }), "u1")).resolves.toBe(false);
  });

  it("is false once adult_on has passed — the row is filtered out by the query's own gt() rather than read and checked", async () => {
    // The stub can't express "adult_on in the past" via a real gt() filter,
    // so this exercises the same shape the query produces once that row no
    // longer matches: no row comes back.
    await expect(isChildAccount(stubClient({ child_accounts: { data: null } }), "u1")).resolves.toBe(false);
  });

  it("throws on a query error, leaving fail-open/fail-closed to the caller", async () => {
    await expect(
      isChildAccount(stubClient({ child_accounts: { data: null, error: { message: "offline" } } }), "u1"),
    ).rejects.toBeTruthy();
  });
});

describe("generationRefusal", () => {
  it("refuses a suspended account", async () => {
    const res = await generationRefusal(
      stubClient({ user_subscriptions: { data: { suspended_at: "2026-01-01" } }, child_accounts: { data: null } }),
      "u1",
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    await expect(res!.json()).resolves.toEqual({ error: "account_suspended" });
  });

  it("refuses an active child account", async () => {
    const res = await generationRefusal(
      stubClient({ user_subscriptions: { data: null }, child_accounts: { data: { child_user_id: "u1" } } }),
      "u1",
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    await expect(res!.json()).resolves.toEqual({ error: "child_account" });
  });

  it("lets an ordinary adult account through", async () => {
    const res = await generationRefusal(
      stubClient({ user_subscriptions: { data: null }, child_accounts: { data: null } }),
      "u1",
    );
    expect(res).toBeNull();
  });

  it("fails open when the child-account lookup errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await generationRefusal(
      stubClient({ user_subscriptions: { data: null }, child_accounts: { data: null, error: { message: "offline" } } }),
      "u1",
    );
    expect(res).toBeNull();
    spy.mockRestore();
  });
});
