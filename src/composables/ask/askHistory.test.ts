import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ filters: [] as Array<[string, string, unknown]> }));

vi.mock("@/lib/supabase", () => {
  // A chain that records each filter and answers no conversation: what the cutoff asked for is what is under test.
  const chain: Record<string, unknown> = {};
  for (const op of ["select", "order", "limit"]) chain[op] = () => chain;
  for (const op of ["eq", "gte"]) chain[op] = (column: string, value: unknown) => (calls.filters.push([op, column, value]), chain);
  chain.maybeSingle = async () => ({ data: null, error: null });
  return { supabase: { from: () => chain } };
});

import { ASK_CONTINUE_MS, loadLastAskConversation } from "./askHistory";

describe("loadLastAskConversation", () => {
  // Bug caught: yesterday's conversation brought back the next day, every new question paying for its whole history;
  // or "my last conversation" read without naming the caller, so a wider policy hands back another account's.
  it("asks only for the caller's own conversation from the last six hours", async () => {
    const now = new Date("2026-11-25T12:00:00Z");
    expect(await loadLastAskConversation("u1", "c1", now)).toBeNull();
    expect(calls.filters).toContainEqual(["eq", "user_id", "u1"]);
    expect(calls.filters).toContainEqual(["gte", "updated_at", new Date(now.getTime() - ASK_CONTINUE_MS).toISOString()]);
    expect(ASK_CONTINUE_MS).toBe(6 * 60 * 60 * 1000);
  });
});
