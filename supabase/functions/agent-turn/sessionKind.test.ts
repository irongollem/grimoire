// The table continues only conversations of its own kind (#1253): a session Ask opened is "not found" here, so the
// table never reads Ask's history under the narrator's instructions. The same check guards ask-turn
// (`ask-turn/handler.test.ts`), so neither function can continue the other's conversation.
import { describe, expect, it } from "vitest";
import { admitTurn } from "./admitTurn.ts";
import { MESSAGES, type AgentTurnDeps, type SessionRow } from "./turnTypes.ts";

const DM = "00000000-0000-4000-8000-0000000000d1";
const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const SESSION = "00000000-0000-4000-8000-0000000000a1";

function session(kind: string | undefined): SessionRow {
  return {
    id: SESSION, user_id: DM, campaign_id: CAMPAIGN, ...(kind === undefined ? {} : { kind }), summary: null, summary_through_seq: 0,
    scene_location_id: null, campaign_session_id: null, pressure_clock_id: null, party_member_id: null, opened_play_session: false,
    left_at: null, updated_at: new Date(Date.now() - 60_000).toISOString(), pending_roll: null, fight_encounter_id: null,
  };
}

function depsWith(stored: SessionRow): AgentTurnDeps {
  const deps: Partial<AgentTurnDeps> = {
    accountRefusal: async () => null,
    loadCampaign: async () => ({ id: CAMPAIGN, user_id: DM, name: "c", game_system: null, ai_enabled: true, table_violence: "moderate" } as never),
    isDm: async () => true,
    loadSession: async () => stored,
    now: () => Date.now(),
    rateLimit: async () => true,
    resolveProvider: async () => ({ provider: "openai", model: "m1", isByok: true, callModel: async () => { throw new Error("not called"); } }),
    strikes: async () => 0,
    isFlagged: async () => false,
  };
  return deps as AgentTurnDeps;
}

const body = { campaignId: CAMPAIGN, sessionId: SESSION, message: "I open the door.", mode: "say" };

describe("agent-turn refuses a conversation of another kind", () => {
  it("answers an Ask conversation as not found", async () => {
    const admission = await admitTurn({ userId: DM, body, deps: depsWith(session("ask")) });
    expect(admission).toEqual({ kind: "refused", refusal: { status: 404, error: MESSAGES.notFound } });
  });

  it("still continues the table's own conversation", async () => {
    expect((await admitTurn({ userId: DM, body, deps: depsWith(session("solo_table")) })).kind).toBe("admitted");
  });
});
