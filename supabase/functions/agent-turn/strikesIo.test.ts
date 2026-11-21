import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake } from "@/test/supabaseFake";
import { countStrikes } from "./strikesIo";

const NOW = Date.parse("2026-11-21T12:00:00Z");
const U = "player";
const day = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

const refusal = (daysAgo: number, user = U, over: Record<string, unknown> = {}) => ({
  user_id: user, generation_type: "agent_turn", blocked: true, created_at: day(daysAgo), ...over,
});
const reopen = (daysAgo: number, target = U) => ({ action: "table_reopen", target_user_id: target, created_at: day(daysAgo) });

function count(fake: ReturnType<typeof createSupabaseFake>) {
  return countStrikes(fake.client as unknown as SupabaseClient, U, NOW);
}

describe("countStrikes", () => {
  // Bug caught: the window or the filters loosened, counting another account's or another feature's refusals.
  it("counts this account's blocked agent-turn refusals inside the thirty days, and nothing else", async () => {
    const fake = createSupabaseFake();
    fake.seed("admin_audit_log", []);
    fake.seed("prompt_screenings", [
      refusal(1), refusal(29), refusal(31), refusal(1, "someone-else"), refusal(1, U, { generation_type: "image" }), refusal(1, U, { blocked: false }),
    ]);
    expect(await count(fake)).toBe(2);
  });

  // Bug caught: a reopened account keeping its five strikes inside the window, so the table closes again on its next message.
  it("ignores refusals from before the newest reopening and counts those after it", async () => {
    const fake = createSupabaseFake();
    fake.seed("admin_audit_log", [reopen(10), reopen(5)]);
    fake.seed("prompt_screenings", [refusal(12), refusal(8), refusal(6), refusal(2), refusal(1)]);
    expect(await count(fake)).toBe(2);
  });

  // Bug caught: another account's reopening (or another audit action) clearing this account's strikes.
  it("is not cleared by someone else's reopening or by another action on this account", async () => {
    const fake = createSupabaseFake();
    fake.seed("admin_audit_log", [reopen(1, "someone-else"), { action: "account_unfreeze", target_user_id: U, created_at: day(1) }]);
    fake.seed("prompt_screenings", [refusal(3), refusal(2)]);
    expect(await count(fake)).toBe(2);
  });

  // Bug caught: an old reopening, from before the window, shortening the window it should only ever narrow.
  it("keeps the thirty-day window when the reopening is older than it", async () => {
    const fake = createSupabaseFake();
    fake.seed("admin_audit_log", [reopen(90)]);
    fake.seed("prompt_screenings", [refusal(40), refusal(3)]);
    expect(await count(fake)).toBe(1);
  });

  // Bug caught: a failed audit read answered by counting every refusal, closing a table the admin had reopened.
  it("throws when the audit log cannot be read, so the caller leaves the table open", async () => {
    const fake = createSupabaseFake();
    fake.seed("prompt_screenings", [refusal(1), refusal(2), refusal(3), refusal(4), refusal(5)]);
    fake.failNext("admin_audit_log", { message: "db down" });
    await expect(count(fake)).rejects.toThrow();
  });
});
