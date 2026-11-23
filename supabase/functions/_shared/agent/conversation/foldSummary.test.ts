import { describe, expect, it, vi } from "vitest";
import { foldIntoSummary } from "./foldSummary.ts";
import type { JobLedger } from "../../pipeline/creditHold.ts";
import type { StoredTurn } from "../transcript.ts";
import type { AgentUsage, CallModel } from "../types.ts";

const usage: AgentUsage = { provider: "openai", model: "m1", inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 };
const callModel: CallModel = async () => ({ blocks: [{ type: "text", text: "The party is in the mine." }], stop: "end", usage });
/** 20 rows of 1,000 tokens: well past the 12,000 that triggers a fold. */
const stored: StoredTurn[] = Array.from({ length: 20 }, (_, i) => ({ seq: i + 1, role: i % 2 === 0 ? "user" : "assistant", blocks: [{ type: "text", text: "a".repeat(4000) }] }));
const session = { id: "s-1", summary: null, summary_through_seq: 0 };
const price = { inputPerMillion: 1, outputPerMillion: 1, cachedInputPerMillion: null };
const calibration = { usdPerCredit: 0.0001, margin: 1 };

function run(over: { billed: boolean; due: number }) {
  const charged: Array<{ reason: string; cost: number }> = [];
  const ledger: JobLedger = { charge: (reason, line) => { charged.push({ reason, cost: line.cost }); }, free: () => undefined };
  const saveSummary = vi.fn(async () => ({ due: over.due }));
  return foldIntoSummary({ saveSummary, ledger, session, storedNow: stored, callModel, isByok: false, price, calibration, reason: "ask_summary", billed: over.billed, logName: "test" })
    .then(() => ({ charged, saveSummary }));
}

describe("foldIntoSummary", () => {
  it("charges the whole credits the database says are due when the function bills summaries (the table)", async () => {
    const { charged, saveSummary } = await run({ billed: true, due: 2 });
    expect(saveSummary).toHaveBeenCalledOnce();
    expect(charged).toEqual([{ reason: "ask_summary", cost: 2 }]);
  });

  it("logs the summary's tokens but charges nothing when the function bills elsewhere (Ask), however much is due", async () => {
    const { charged } = await run({ billed: false, due: 2 });
    expect(charged).toEqual([{ reason: "ask_summary", cost: 0 }]);
  });

  it("leaves a conversation that is still short alone", async () => {
    const saveSummary = vi.fn();
    await foldIntoSummary({
      saveSummary, ledger: { charge: () => undefined, free: () => undefined }, session, storedNow: stored.slice(0, 2),
      callModel, isByok: false, price, calibration, reason: "r", billed: true, logName: "test",
    });
    expect(saveSummary).not.toHaveBeenCalled();
  });
});
