// The gates every conversation with a model passes before it may stream (#1253): who is asking, whether this campaign
// may use AI, whether they run it, whether the conversation they name is theirs and of the right kind, the rate
// limit, the provider and what a credit is worth, and the moderation screen on what they sent.
//
// Extracted from the AI table's `admitTurn` so Ask Grimoire runs the same sequence, in the same order, with the same
// refusal codes. Pure: every lookup comes in through `GateDeps`, so the order is tested against an in-memory store.
// What belongs to one function alone (the table's sitting, a pending roll, its strikes) comes in as a hook that runs
// at a fixed point in the sequence, so the order the table had before the extraction is the order it still has.
//
// Every refusal here is an ordinary JSON status answered before a stream opens, and costs nothing.

import { usableCalibration, type CreditCalibration, type ModelPrice } from "../metering.ts";
import type { AgentProvider } from "../providerIo.ts";
import type { CallModel } from "../types.ts";

/** A refusal before the stream opened: an ordinary JSON response. */
export interface Refusal {
  status: number;
  error: string;
}

/** The kinds of conversation `agent_sessions.kind` allows. A function continues only a conversation of its own kind. */
export type SessionKind = "solo_table" | "ask";

/** The sentences (or codes) each gate refuses with; a function words them for itself. */
export interface GateMessages {
  notFound: string;
  noCampaign: string;
  aiOff: string;
  forbidden: string;
  rateLimited: string;
  noProvider: string;
  noAdapter: string;
  noMetering: string;
  flagged: string;
}

export interface GateCampaign {
  id: string;
  ai_enabled: boolean | null;
}

export interface GateSession {
  id: string;
  user_id: string;
  campaign_id: string;
}

export interface GateDeps<C extends GateCampaign, S extends GateSession> {
  /** Suspended or child accounts. */
  accountRefusal(userId: string): Promise<Refusal | null>;
  loadCampaign(campaignId: string): Promise<C | null>;
  /** The owner or a co-DM. */
  isDm(campaign: C, userId: string): Promise<boolean>;
  /** By id alone: the gate decides whether it belongs to the caller. */
  loadSession(sessionId: string): Promise<S | null>;
  rateLimit(userId: string): Promise<boolean>;
  resolveProvider(campaign: C): Promise<AgentProvider | null>;
  loadPrice(model: string): Promise<ModelPrice | null>;
  loadCalibration(): Promise<{ usdPerCredit: number | null; margin: number } | null>;
  /** True when the message must not be sent. A lookup that throws is logged and does not stop the turn. */
  isFlagged(message: string): Promise<boolean>;
}

export interface Admitted<C extends GateCampaign, S extends GateSession> {
  campaign: C;
  /** The conversation this turn continues; null for a new one. */
  existing: S | null;
  provider: AgentProvider;
  callModel: CallModel;
  /** What the model costs by the token. */
  price: ModelPrice;
  calibration: CreditCalibration;
}

export type GateResult<C extends GateCampaign, S extends GateSession> =
  | { kind: "refused"; refusal: Refusal }
  | { kind: "admitted"; admitted: Admitted<C, S> };

export interface GateInput<C extends GateCampaign, S extends GateSession> {
  userId: string;
  campaignId: string;
  /** The conversation the browser says it is continuing; undefined for a new one. */
  sessionId: string | undefined;
  /** What the user sent, screened last. An empty message has nothing to screen. */
  message: string;
  /** The kind this function runs: a session of any other kind is "not found" here. */
  kind: SessionKind;
  /** The kind of a loaded session. A function that reads the column passes `(s) => s.kind`. */
  kindOf(session: S): string;
  deps: GateDeps<C, S>;
  messages: GateMessages;
  /** The function's name, for its log lines ("agent-turn", "ask-turn"). */
  logName: string;
  /**
   * The function's own checks on the conversation it was given, run right after the ownership and kind checks and
   * before the rate limit: a sitting that was left, a roll nobody asked for, a place that is not the campaign's.
   */
  afterSession?(existing: S | null, campaign: C): Promise<Refusal | null>;
  /** The function's own checks once the provider and its prices are known and before the message is screened. */
  afterMetering?(): Promise<Refusal | null>;
}

export async function admitConversation<C extends GateCampaign, S extends GateSession>(
  input: GateInput<C, S>,
): Promise<GateResult<C, S>> {
  const { userId, deps, messages, logName } = input;
  const refuse = (status: number, error: string): GateResult<C, S> => ({ kind: "refused", refusal: { status, error } });

  const account = await deps.accountRefusal(userId);
  if (account) return { kind: "refused", refusal: account };

  const campaign = await deps.loadCampaign(input.campaignId);
  if (!campaign) return refuse(404, messages.noCampaign);
  if (campaign.ai_enabled !== true) return refuse(403, messages.aiOff);
  if (!(await deps.isDm(campaign, userId))) return refuse(403, messages.forbidden);

  // Someone else's conversation, one in another campaign, or one of another function's kind is "not found": a 403
  // would say it exists. The kind check is what keeps a table's conversation from being continued by Ask (and the
  // other way round), where the two would read each other's history with the wrong standing instructions.
  let existing: S | null = null;
  if (input.sessionId !== undefined) {
    existing = await deps.loadSession(input.sessionId);
    if (
      !existing || existing.user_id !== userId || existing.campaign_id !== campaign.id ||
      input.kindOf(existing) !== input.kind
    ) {
      return refuse(404, messages.notFound);
    }
  }
  if (input.afterSession) {
    const refusal = await input.afterSession(existing, campaign);
    if (refusal) return { kind: "refused", refusal };
  }

  if (!(await deps.rateLimit(userId))) return refuse(429, messages.rateLimited);

  const provider = await deps.resolveProvider(campaign);
  if (!provider) return refuse(503, messages.noProvider);
  if (!provider.callModel) return refuse(503, messages.noAdapter);
  const callModel = provider.callModel;

  // A conversation must never run unmetered.
  let price: ModelPrice | null;
  let calibration: CreditCalibration | null;
  try {
    price = await deps.loadPrice(provider.model);
    calibration = usableCalibration(await deps.loadCalibration());
  } catch (error) {
    console.error(`${logName}: metering lookup failed:`, error);
    return refuse(503, messages.noMetering);
  }
  if (!price || !calibration) return refuse(503, messages.noMetering);

  if (input.afterMetering) {
    const refusal = await input.afterMetering();
    if (refusal) return { kind: "refused", refusal };
  }

  let flagged = false;
  try {
    flagged = input.message === "" ? false : await deps.isFlagged(input.message);
  } catch (error) {
    // The screen is not the safety boundary for what a DM types into their own assistant, so an outage of it must
    // not stop play.
    console.error(`${logName}: moderation failed:`, error);
  }
  if (flagged) return refuse(400, messages.flagged);

  return { kind: "admitted", admitted: { campaign, existing, provider, callModel, price, calibration } };
}
