// Forgetting a sitting at the AI table (#1021): its conversation is deleted, and the voice clips made for it go
// with it. No Deno and no Supabase in here; everything with I/O comes in through `AgentForgetDeps`, so the rules
// are tested against an in-memory store (`handler.test.ts`) and `index.ts` only wires real dependencies to them.
//
// The clips live in a store of their own (`table-voice`), named by campaign and sitting, and nothing in the
// database points at them: deleting the row alone would leave them behind for good, where no listing by account
// can find them again. So the clips go first and the row second. A failure between the two leaves a sitting with no
// clips (its lines can be voiced again), never clips with no sitting.
//
// Two requests:
//   { campaignId, sessionId }        one sitting: its clips, then the conversation. The record of what happened in
//                                    it (story facts, the session note) is the campaign's and stays.
//   { campaignId, allClips: true }   the clips of every sitting of the caller's in that campaign, and no rows: asked
//                                    just before a campaign is deleted, which takes the rows itself.

import { UUID_RE } from "../_shared/agent/parse.ts";

export interface ForgetSession {
  id: string;
  user_id: string;
  campaign_id: string;
  /** When the player left the table; null while the sitting goes on. */
  left_at: string | null;
}

export interface AgentForgetDeps {
  /** By id alone: the handler decides whether it belongs to the caller. */
  loadSession(sessionId: string): Promise<ForgetSession | null>;
  /** The ids of the caller's own sittings in the campaign. */
  sessionIdsOf(campaignId: string, userId: string): Promise<string[]>;
  /** Removes every clip kept for the sitting. Throws when the store could not be read or written. */
  removeClips(at: { campaignId: string; sessionId: string }): Promise<void>;
  /** Deletes the conversation, which takes its messages. False when no row of that owner was there to delete. */
  deleteSession(sessionId: string, userId: string): Promise<boolean>;
}

export const FORGET_MESSAGES = {
  badBody: "The request is not valid.",
  notFound: "That conversation was not found.",
  stillOpen: "Leave the table before deleting the sitting.",
  clips: "The sitting's voice clips could not be removed, so nothing was deleted. Try again.",
} as const;


export type ForgetBody = { campaignId: string; sessionId: string } | { campaignId: string; allClips: true };

export function parseForgetBody(raw: unknown): ForgetBody | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.campaignId !== "string" || !UUID_RE.test(r.campaignId)) return null;
  const one = r.sessionId !== undefined;
  const all = r.allClips !== undefined;
  // Exactly one of the two: a request that names a sitting and asks for all of them means neither.
  if (one === all) return null;
  if (one) return typeof r.sessionId === "string" && UUID_RE.test(r.sessionId) ? { campaignId: r.campaignId, sessionId: r.sessionId } : null;
  return r.allClips === true ? { campaignId: r.campaignId, allClips: true } : null;
}

export async function forgetSitting(input: {
  userId: string;
  body: unknown;
  deps: AgentForgetDeps;
}): Promise<{ ok: true; deleted: number } | { ok: false; refusal: { status: number; error: string } }> {
  const { userId, deps } = input;
  const refuse = (status: number, error: string) => ({ ok: false as const, refusal: { status, error } });
  const body = parseForgetBody(input.body);
  if (!body) return refuse(400, FORGET_MESSAGES.badBody);

  if ("allClips" in body) {
    // Only the caller's own sittings are listed, so another account's clips are never named.
    const ids = await deps.sessionIdsOf(body.campaignId, userId);
    try {
      for (const sessionId of ids) await deps.removeClips({ campaignId: body.campaignId, sessionId });
    } catch (error) {
      console.error("agent-forget: removing a campaign's clips failed:", error);
      return refuse(502, FORGET_MESSAGES.clips);
    }
    return { ok: true, deleted: 0 };
  }

  // Someone else's conversation, or one in another campaign, is "not found": a 403 would say it exists.
  const session = await deps.loadSession(body.sessionId);
  if (!session || session.user_id !== userId || session.campaign_id !== body.campaignId) return refuse(404, FORGET_MESSAGES.notFound);
  // A sitting that goes on still holds a play session open and may be waiting on a fight: leaving ends those.
  if (session.left_at === null) return refuse(409, FORGET_MESSAGES.stillOpen);
  try {
    await deps.removeClips({ campaignId: session.campaign_id, sessionId: session.id });
  } catch (error) {
    console.error("agent-forget: removing the sitting's clips failed:", error);
    return refuse(502, FORGET_MESSAGES.clips);
  }
  const deleted = await deps.deleteSession(session.id, userId);
  return deleted ? { ok: true, deleted: 1 } : refuse(404, FORGET_MESSAGES.notFound);
}
