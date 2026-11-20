// Everything that must be true before a turn may stream (#1205): who may play, what the turn may cost, and what the
// player sent. Every refusal here is an ordinary JSON status, answered before the HTTP layer opens a stream, and
// costs nothing: the reservation is the last thing taken, so nothing before it needs to be given back.

import { endedByPause } from "../_shared/agent/sittingEnd.ts";
import { tableClosed } from "../_shared/agent/conduct.ts";
import { usableCalibration, type CreditCalibration, type ModelPrice } from "../_shared/agent/metering.ts";
import { scoreRoll, type PendingRoll } from "../_shared/agent/playerRoll.ts";
import type { AgentProvider } from "../_shared/agent/providerIo.ts";
import type { CallModel } from "../_shared/agent/types.ts";
import { parseBody, type AgentTurnBody } from "./turnBody.ts";
import { MESSAGES, RESERVE_CREDITS, type AgentTurnDeps, type CampaignRow, type Refusal, type SessionRow } from "./turnTypes.ts";

/** What the run needs from the gates it passed. */
export interface Admitted {
  body: AgentTurnBody;
  campaign: CampaignRow;
  /** The conversation this turn continues; null for a new one. */
  existing: SessionRow | null;
  /** The roll the last turn asked for, as it stood when this turn began. */
  pendingRoll: PendingRoll | null;
  /** The player's roll scored against that request; null when no roll came with the message. */
  scored: ReturnType<typeof scoreRoll> | null;
  provider: AgentProvider;
  callModel: CallModel;
  price: ModelPrice | null;
  calibration: CreditCalibration | null;
  /** Held credits, released by the run whatever happens; empty for own-key play. */
  reservationIds: string[];
}

export type Admission = { kind: "refused"; refusal: Refusal } | { kind: "admitted"; admitted: Admitted };

export async function admitTurn(input: { userId: string; body: unknown; deps: AgentTurnDeps }): Promise<Admission> {
  const { userId, deps } = input;
  const refuse = (status: number, error: string): Admission => ({ kind: "refused", refusal: { status, error } });

  const parsed = parseBody(input.body);
  if (!parsed.ok) return refuse(400, MESSAGES.badBody);
  const body = parsed.body;

  const account = await deps.accountRefusal(userId);
  if (account) return { kind: "refused", refusal: account };

  const campaign = await deps.loadCampaign(body.campaignId);
  if (!campaign) return refuse(404, MESSAGES.noCampaign);
  if (campaign.ai_enabled !== true) return refuse(403, MESSAGES.aiOff);
  if (!(await deps.isDm(campaign, userId))) return refuse(403, MESSAGES.forbidden);

  // Someone else's conversation, or one in another campaign, is "not found": a 403 would say it exists.
  let existing: SessionRow | null = null;
  if (body.sessionId !== undefined) {
    existing = await deps.loadSession(body.sessionId);
    if (!existing || existing.user_id !== userId || existing.campaign_id !== campaign.id) {
      return refuse(404, MESSAGES.notFound);
    }
    // Before the rate limit and the reservation: a sitting that was left takes nothing more, and costs nothing to refuse.
    if (existing.left_at !== null) return refuse(409, MESSAGES.left);
    // A long pause ended it (`sittingEnd.ts`). Also before anything is reserved: the refusal costs nothing.
    if (endedByPause(existing.updated_at, deps.now())) return refuse(409, MESSAGES.sittingEnded);
  }
  // A roll answers a request: without one there is no DC to score it against, and a made-up roll must not reach the
  // narrator as if it had been asked for.
  const pendingRoll = existing === null ? null : existing.pending_roll;
  if (body.roll !== undefined && pendingRoll === null) return refuse(400, MESSAGES.noRoll);
  const scored = body.roll !== undefined && pendingRoll !== null ? scoreRoll(pendingRoll, body.roll) : null;

  // Before anything is charged or streamed: a place of another campaign, or one that does not exist, is "not
  // found" either way. The id comes from the browser, so it is checked against the conversation's campaign here.
  if (body.startLocationId !== undefined && !(await deps.loadScene(campaign.id, body.startLocationId))) {
    return refuse(404, MESSAGES.noPlace);
  }

  // Same for the character: the id comes from the browser, so it is checked against the campaign before anything is reserved.
  if (body.characterId !== undefined && !(await deps.loadCharacter(campaign.id, body.characterId))) {
    return refuse(404, MESSAGES.noCharacter);
  }

  if (!(await deps.rateLimit(userId))) return refuse(429, MESSAGES.rateLimited);

  const provider = await deps.resolveProvider(campaign);
  if (!provider) return refuse(503, MESSAGES.noProvider);
  if (!provider.callModel) return refuse(503, MESSAGES.noAdapter);
  const callModel = provider.callModel;

  // Play must never run unmetered. Own-key play is not charged, so it needs neither number.
  let price: ModelPrice | null = null;
  let calibration: CreditCalibration | null = null;
  if (!provider.isByok) {
    try {
      price = await deps.loadPrice(provider.model);
      const found = await deps.loadCalibration();
      calibration = usableCalibration(found);
    } catch (error) {
      console.error("agent-turn: metering lookup failed:", error);
      return refuse(503, MESSAGES.noMetering);
    }
    if (!price || !calibration) return refuse(503, MESSAGES.noMetering);
  }

  // An account that kept sending what the screen refuses finds the table closed, before anything is screened or
  // spent. Unreadable strikes do not close it: the count is a consequence, not the boundary.
  try {
    if (tableClosed(await deps.strikes(userId))) return refuse(403, MESSAGES.closed);
  } catch (error) {
    console.error("agent-turn: counting the account's refused messages failed:", error);
  }

  let flagged = false;
  try {
    // A roll sent without words has nothing to screen.
    flagged = body.message === "" ? false : await deps.isFlagged(body.message);
  } catch (error) {
    // Same stance as the image screen: it is not the safety boundary, so an outage of it must not stop play.
    console.error("agent-turn: moderation failed:", error);
  }
  if (flagged) return refuse(400, MESSAGES.flagged);

  let reservationIds: string[] = [];
  if (!provider.isByok) {
    const reservation = await deps.reserve(userId, RESERVE_CREDITS);
    if (!reservation.ok) return { kind: "refused", refusal: reservation.refusal };
    reservationIds = reservation.ids;
  }

  return { kind: "admitted", admitted: { body, campaign, existing, pendingRoll, scored, provider, callModel, price, calibration, reservationIds } };
}
