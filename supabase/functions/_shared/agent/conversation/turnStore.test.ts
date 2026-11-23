import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAgentTurns, round6, saveAgentSummary, saveTurn, wholeCredits } from "./turnStore.ts";
import type { AgentMessage, AgentUsage } from "../types.ts";

const usage: AgentUsage = { provider: "openai", model: "m1", inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 };
const added: AgentMessage[] = [
  { role: "user", blocks: [{ type: "text", text: "hi" }] },
  { role: "assistant", blocks: [{ type: "text", text: "hello" }] },
];
const result = { added, steps: [usage], toolSteps: [] };
const base = { sessionId: "s-1", userId: "u-1", lastSeq: 4, result, credits: 0.25, logName: "test" };

function adminWith(rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string } | null }>) {
  return { rpc } as unknown as SupabaseClient;
}

describe("wholeCredits and round6", () => {
  it("a missing or non-numeric answer throws rather than billing nothing", () => {
    expect(() => wholeCredits(null)).toThrow();
    expect(() => wholeCredits("lots")).toThrow();
    expect(wholeCredits("3")).toBe(3);
  });
  it("accrues at the six decimals the column holds", () => {
    expect(round6(0.1234567891)).toBe(0.123457);
  });
});

describe("saveTurn", () => {
  it("numbers the rows after the last one it loaded and hands the accrual to the database", async () => {
    const appendTurns = vi.fn(async () => ({ due: 2 }));
    const saved = await saveTurn({ ...base, appendTurns });
    expect(saved.kind).toBe("kept");
    const [sessionId, afterSeq, rows, credits] = appendTurns.mock.calls[0] as unknown as [string, number, Array<{ seq: number }>, number];
    expect([sessionId, afterSeq, rows.map((r) => r.seq), credits]).toEqual(["s-1", 4, [5, 6], 0.25]);
    expect(saved).toMatchObject({ kind: "kept", due: 2 });
  });

  it("answers conflict when the conversation moved on, and failed (never a throw) when the save throws", async () => {
    expect(await saveTurn({ ...base, appendTurns: async () => "conflict" })).toEqual({ kind: "conflict" });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await saveTurn({ ...base, appendTurns: async () => { throw new Error("db down"); } })).toEqual({ kind: "failed" });
    quiet.mockRestore();
  });
});

describe("appendAgentTurns and saveAgentSummary", () => {
  it("reads SQLSTATE 40001 as a conflict and any other error as a throw", async () => {
    expect(await appendAgentTurns(adminWith(async () => ({ data: null, error: { code: "40001" } })), "s", 0, [], 0)).toBe("conflict");
    await expect(appendAgentTurns(adminWith(async () => ({ data: null, error: { code: "XX000" } })), "s", 0, [], 0)).rejects.toBeTruthy();
    expect(await appendAgentTurns(adminWith(async () => ({ data: 1, error: null })), "s", 0, [], 0)).toEqual({ due: 1 });
  });

  it("reads 40001 on a summary as stale, and sends the usage columns it was given", async () => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: 0, error: null }));
    await saveAgentSummary(adminWith(rpc), { sessionId: "s", expectedThroughSeq: 1, throughSeq: 5, summary: "x", usage, credits: 0.5 });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_input_tokens: 10, p_output_tokens: 5, p_credits: 0.5, p_through_seq: 5 });
    expect(await saveAgentSummary(adminWith(async () => ({ data: null, error: { code: "40001" } })), { sessionId: "s", expectedThroughSeq: 1, throughSeq: 5, summary: "x", usage, credits: 0 })).toBe("stale");
  });
});
