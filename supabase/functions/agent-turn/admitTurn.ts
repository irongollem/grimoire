// Everything that must be true before a turn may stream (#1205): who may play, what the turn may cost, and what the
// player sent. Every refusal here is an ordinary JSON status, answered before the HTTP layer opens a stream, and
// costs nothing: the hold is taken after this (`withHold`), so nothing here needs to be given back.
//
// The sequence itself (account, campaign, AI switch, DM, the conversation's owner and kind, rate limit, provider,
// metering, moderation) is `conversation/gates.ts`, shared with Ask. What is left here is the table's own: the
// sitting, the roll, the place, the character and the strikes, run at the points the gate offers.

import { endedByPause } from "../_shared/agent/sittingEnd.ts";
import { tableClosed } from "../_shared/agent/conduct.ts";
import type { CreditCalibration, ModelPrice } from "../_shared/agent/metering.ts";
import { admitConversation } from "../_shared/agent/conversation/gates.ts";
import { scoreRoll, type PendingRoll } from "../_shared/agent/playerRoll.ts";
import type { AgentProvider } from "../_shared/agent/providerIo.ts";
import type { CallModel } from "../_shared/agent/types.ts";
import { parseBody, type AgentTurnBody } from "./turnBody.ts";
import { MESSAGES, type AgentTurnDeps, type CampaignRow, type Refusal, type SessionRow } from "./turnTypes.ts";

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
}

export type Admission = { kind: "refused"; refusal: Refusal } | { kind: "admitted"; admitted: Admitted };

export async function admitTurn(input: { userId: string; body: unknown; deps: AgentTurnDeps }): Promise<Admission> {
  const { userId, deps } = input;
  const refuse = (status: number, error: string): Refusal => ({ status, error });

  const parsed = parseBody(input.body);
  if (!parsed.ok) return { kind: "refused", refusal: refuse(400, MESSAGES.badBody) };
  const body = parsed.body;

  // What the gates leave for the table to decide, filled in by `afterSession` below.
  const asked: { pendingRoll: PendingRoll | null; scored: ReturnType<typeof scoreRoll> | null } = { pendingRoll: null, scored: null };

  const gated = await admitConversation({
    userId,
    campaignId: body.campaignId,
    sessionId: body.sessionId,
    message: body.message,
    kind: "solo_table",
    // The column's default is solo_table: only an in-memory fixture that never set a kind reaches the fallback.
    kindOf: (session) => session.kind ?? "solo_table",
    deps,
    messages: MESSAGES,
    logName: "agent-turn",
    afterSession: async (existing, campaign) => {
      if (existing) {
        // Before the rate limit and the reservation: a sitting that was left takes nothing more, and costs nothing to refuse.
        if (existing.left_at !== null) return refuse(409, MESSAGES.left);
        // A long pause ended it (`sittingEnd.ts`). Also before anything is held: the refusal costs nothing.
        if (endedByPause(existing.updated_at, deps.now())) return refuse(409, MESSAGES.sittingEnded);
      }
      // A roll answers a request: without one there is no DC to score it against, and a made-up roll must not reach the
      // narrator as if it had been asked for.
      asked.pendingRoll = existing === null ? null : existing.pending_roll;
      if (body.roll !== undefined && asked.pendingRoll === null) return refuse(400, MESSAGES.noRoll);
      asked.scored = body.roll !== undefined && asked.pendingRoll !== null ? scoreRoll(asked.pendingRoll, body.roll) : null;

      // Before anything is charged or streamed: a place of another campaign, or one that does not exist, is "not
      // found" either way. The id comes from the browser, so it is checked against the conversation's campaign here.
      if (body.startLocationId !== undefined && !(await deps.loadScene(campaign.id, body.startLocationId))) {
        return refuse(404, MESSAGES.noPlace);
      }
      // Same for the character: the id comes from the browser, so it is checked against the campaign before anything is held.
      if (body.characterId !== undefined && !(await deps.loadCharacter(campaign.id, body.characterId))) {
        return refuse(404, MESSAGES.noCharacter);
      }
      return null;
    },
    // An account that kept sending what the screen refuses finds the table closed, before anything is screened or
    // spent. Unreadable strikes do not close it: the count is a consequence, not the boundary.
    afterMetering: async () => {
      try {
        if (tableClosed(await deps.strikes(userId))) return refuse(403, MESSAGES.closed);
      } catch (error) {
        console.error("agent-turn: counting the account's refused messages failed:", error);
      }
      return null;
    },
  });
  if (gated.kind === "refused") return gated;
  const { campaign, existing, provider, callModel, price, calibration } = gated.admitted;

  return { kind: "admitted", admitted: { body, campaign, existing, pendingRoll: asked.pendingRoll, scored: asked.scored, provider, callModel, price, calibration } };
}
