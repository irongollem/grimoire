// Saving a finished turn (#1253): the rows a turn adds, written in one call with the credits it accrued, and what
// the database answers with. Shared by the AI table and Ask; each decides what to do with the `due` it gets back.

import type { SupabaseClient } from "@supabase/supabase-js";
import { rowsFor, type TurnRow } from "../transcript.ts";
import type { TurnResult } from "../turn.ts";

/** The database answers with the whole credits to bill. A value that is not a number must never become "bill nothing". */
export function wholeCredits(data: unknown): number {
  const due = Number(data);
  if (data === null || data === undefined || !Number.isFinite(due)) throw new Error("the database did not say what is due");
  return due;
}

/** The session's credits hold six decimals; accruing at the same precision keeps what is sent equal to what is stored. */
export function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/**
 * `append_agent_turns`. `due` is the whole credits the conversation's running total newly crossed, decided in SQL
 * under the row lock. "conflict" is SQLSTATE 40001: the conversation moved on. Any other failure throws.
 */
export async function appendAgentTurns(
  admin: SupabaseClient,
  sessionId: string,
  afterSeq: number,
  rows: TurnRow[],
  credits: number,
): Promise<{ due: number } | "conflict"> {
  const { data, error } = await admin.rpc("append_agent_turns", {
    p_session_id: sessionId,
    p_after_seq: afterSeq,
    p_rows: rows,
    p_credits: credits,
  });
  if (error) {
    if (error.code === "40001") return "conflict";
    throw error;
  }
  return { due: wholeCredits(data) };
}

/**
 * `summarise_agent_session`: stores the summary and the seq it covers and answers with the whole credits newly
 * crossed. "stale" is SQLSTATE 40001: another summary got there first. Any other failure throws.
 */
export async function saveAgentSummary(
  admin: SupabaseClient,
  input: {
    sessionId: string;
    expectedThroughSeq: number;
    throughSeq: number;
    summary: string;
    usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
    credits: number;
  },
): Promise<{ due: number } | "stale"> {
  const { data, error } = await admin.rpc("summarise_agent_session", {
    p_session_id: input.sessionId,
    p_expected_through_seq: input.expectedThroughSeq,
    p_through_seq: input.throughSeq,
    p_summary: input.summary,
    p_input_tokens: input.usage.inputTokens,
    p_output_tokens: input.usage.outputTokens,
    p_cache_read_tokens: input.usage.cacheReadTokens,
    p_cache_write_tokens: input.usage.cacheWriteTokens,
    p_credits: input.credits,
  });
  if (error) {
    if (error.code === "40001") return "stale";
    throw error;
  }
  return { due: wholeCredits(data) };
}

export type SavedTurn = { kind: "kept"; due: number; rows: TurnRow[] } | { kind: "conflict" } | { kind: "failed" };

/**
 * Turns a finished loop into rows and saves them. Save first, then charge: a turn that was not kept is not billed,
 * so the caller charges only on "kept". A save that throws is "failed" (logged), never an exception.
 */
export async function saveTurn(input: {
  appendTurns(sessionId: string, afterSeq: number, rows: TurnRow[], credits: number): Promise<{ due: number } | "conflict">;
  sessionId: string;
  userId: string;
  lastSeq: number;
  result: Pick<TurnResult, "added" | "steps" | "toolSteps">;
  /** What the turn accrued, exact. */
  credits: number;
  logName: string;
}): Promise<SavedTurn> {
  const rows = rowsFor({
    sessionId: input.sessionId,
    userId: input.userId,
    lastSeq: input.lastSeq,
    added: input.result.added,
    steps: input.result.steps,
    toolSteps: input.result.toolSteps,
  });
  try {
    const saved = await input.appendTurns(input.sessionId, input.lastSeq, rows, input.credits);
    return saved === "conflict" ? { kind: "conflict" } : { kind: "kept", due: saved.due, rows };
  } catch (error) {
    console.error(`${input.logName}: saving the turn failed:`, error);
    return { kind: "failed" };
  }
}
