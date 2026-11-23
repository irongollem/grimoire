// Ask Grimoire's turn (#1253): its limits, its fixed sentences and the dependencies its handler is run with. Kept
// apart from the handler so each step (`askBody.ts`, `askBilling.ts`, `askTools.ts`) can name them without importing
// the module that calls it.

import type { AskEvent } from "./askContract.ts";
import type { AskRecordType } from "./askContract.ts";
import type { GateCampaign, GateDeps, GateMessages, GateSession, Refusal } from "./conversation/gates.ts";
import type { StoredTurn, TurnRow } from "./transcript.ts";
import type { AgentTool, AgentUsage, CallTool } from "./types.ts";
import type { JobLedger } from "../pipeline/creditHold.ts";

// Limits of one turn. An answer is a few reads and a few sentences; the DM waits on it.
/** A turn reads, searches and answers; six model calls stops a model that keeps calling tools. */
export const ASK_MAX_STEPS = 6;
/** A reply or a proposal is far below this; it stops one runaway answer. */
export const ASK_MAX_OUTPUT_TOKENS = 1500;
/** What a turn may spend in full-rate tokens (cache reads at a tenth, `budgetTokens`). Ask's reads are cheaper than a table turn's. */
export const ASK_TOKEN_BUDGET = 40_000;
/** The longest message Ask takes. */
export const ASK_MESSAGE_MAX = 4000;
/** Held when no free answer is left today, so an account with no credits is refused before any model call. */
export const ASK_RESERVE_CREDITS = 1;

export const ASK_MESSAGES = {
  badBody: "The request is not valid.",
  notFound: "That conversation was not found.",
  noCampaign: "Campaign not found.",
  aiOff: "AI is disabled for this campaign.",
  forbidden: "Only the campaign's DM can ask Grimoire.",
  rateLimited: "rate_limited",
  noProvider: "Ask Grimoire is not available right now.",
  noAdapter: "Ask Grimoire is not available on this provider yet.",
  noMetering: "Ask Grimoire cannot be metered right now.",
  flagged: "That message cannot be sent to Ask Grimoire.",
  conflict: "This conversation was continued somewhere else. Reload it and ask again.",
  providerBusy: "The AI provider is busy right now. Ask again in a moment.",
  failed: "Ask Grimoire ran into a problem. Ask again.",
  notSaved: "The answer could not be saved. Ask again.",
} as const satisfies GateMessages & Record<string, string>;

export interface AskCampaignRow extends GateCampaign {
  user_id: string;
  name: string;
  game_system: string | null;
}

export interface AskSessionRow extends GateSession {
  /** `agent_sessions.kind`: the gate refuses anything that is not 'ask'. */
  kind: string;
  summary: string | null;
  summary_through_seq: number;
}

/** The day's usage of one account, as `ask_usage` has it. */
export interface AskUsage {
  /** The UTC date the count is for, `YYYY-MM-DD`. */
  day: string;
  free_used: number;
}

/** What `charge_ask_answer` decided. */
export interface AskCharge {
  free: boolean;
  /** Whole credits to spend now. */
  credits: number;
  freeLeft: number;
}

/** A record the turn found through `find`, by meaning. */
export interface AskFound {
  type: AskRecordType;
  id: string;
  name: string;
  descriptor: string | null;
}

/** A record of the campaign by id: what a context record and a proposal's target are checked against. */
export interface AskRecordLookup {
  name: string;
}

export interface AskTurnDeps extends GateDeps<AskCampaignRow, AskSessionRow> {
  /** The UTC date now, `YYYY-MM-DD`: a dependency so a test can cross midnight. */
  today(): string;
  /** The account's row in `ask_usage`; null when it has never asked. */
  loadUsage(userId: string): Promise<AskUsage | null>;
  createSession(input: { userId: string; campaignId: string; provider: string; model: string }): Promise<AskSessionRow>;
  /** The stored rows in reach of a turn (`turnsInReach.ts`). */
  loadTurns(sessionId: string, summaryThroughSeq: number): Promise<StoredTurn[]>;
  /** Takes the hold (`withCreditHold`) and runs `work` under it; a refused hold answers its refusal without running `work`. */
  withHold(userId: string, credits: number, work: (hold: { handOff(): string[] }) => Promise<Response>): Promise<Response>;
  /** The stream's half of the hold (`settleHandedOff`). */
  settle(userId: string, ids: string[], work: (ledger: JobLedger) => Promise<void>): Promise<void>;
  appendTurns(sessionId: string, afterSeq: number, rows: TurnRow[], credits: number): Promise<{ due: number } | "conflict">;
  saveSummary(input: {
    sessionId: string;
    expectedThroughSeq: number;
    throughSeq: number;
    summary: string;
    usage: AgentUsage;
    credits: number;
  }): Promise<{ due: number } | "stale">;
  /** `charge_ask_answer`: decides, under the row lock, whether this answer is free and how many whole credits it costs. */
  chargeAnswer(userId: string, credits: number): Promise<AskCharge>;
  /** The MCP readers, bound to the allow list and pinned to the campaign; `tools` are the schemas the model is shown. */
  mcpTools: AgentTool[];
  callMcp(campaignId: string): CallTool;
  /** Search by meaning over the campaign; null when it is not available right now (no embedding provider, rate limited). */
  find(campaign: AskCampaignRow, query: string): Promise<AskFound[] | null>;
  /** A record of THIS campaign by kind and id, or null: an id from the browser or the model is never trusted. */
  loadRecord(campaignId: string, type: AskRecordType, id: string): Promise<AskRecordLookup | null>;
  newId(): string;
}

export interface BegunAsk {
  kind: "ready";
  /** Credits to hold before running: 0 while a free answer is left, and for own-key use. */
  reserve: number;
  run: (send: (event: AskEvent) => void, signal: AbortSignal | undefined, reservationIds: string[]) => Promise<void>;
}

export type AskBegin = { kind: "refused"; refusal: Refusal } | BegunAsk;
