import { describe, expect, it } from "vitest";
import { FORGET_MESSAGES, forgetSitting, type AgentForgetDeps, type ForgetSession } from "./handler";

const ME = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const OTHER_CAMPAIGN = "00000000-0000-4000-8000-0000000000c2";
const SITTING = "00000000-0000-4000-8000-0000000000a1";
const SECOND = "00000000-0000-4000-8000-0000000000a2";

function harness() {
  const h = {
    sessions: [
      { id: SITTING, user_id: ME, campaign_id: CAMPAIGN, left_at: "2026-11-17T20:00:00Z" },
      { id: SECOND, user_id: ME, campaign_id: CAMPAIGN, left_at: null },
    ] as ForgetSession[],
    storeDown: false,
    clipsRemoved: [] as string[],
    deps: undefined as unknown as AgentForgetDeps,
  };
  h.deps = {
    loadSession: async (id) => h.sessions.find((s) => s.id === id) ?? null,
    sessionIdsOf: async (campaignId, userId) => h.sessions.filter((s) => s.campaign_id === campaignId && s.user_id === userId).map((s) => s.id),
    removeClips: async (at) => {
      if (h.storeDown) throw new Error("store down");
      h.clipsRemoved.push(`${at.campaignId}/${at.sessionId}`);
    },
    deleteSession: async (id, userId) => {
      const before = h.sessions.length;
      h.sessions = h.sessions.filter((s) => !(s.id === id && s.user_id === userId));
      return h.sessions.length < before;
    },
  };
  return h;
}
const forget = (h: ReturnType<typeof harness>, body: unknown, userId = ME) => forgetSitting({ userId, body, deps: h.deps });

describe("forgetSitting", () => {
  it("removes a left sitting's clips, then the conversation", async () => {
    const h = harness();
    expect(await forget(h, { campaignId: CAMPAIGN, sessionId: SITTING })).toEqual({ ok: true, deleted: 1 });
    expect(h.clipsRemoved).toEqual([`${CAMPAIGN}/${SITTING}`]);
    expect(h.sessions.map((s) => s.id)).toEqual([SECOND]);
  });

  // Bug caught: the row deleted while its clips could not be removed, leaving clips that nothing points at and no
  // listing by account can find again.
  it("deletes nothing when the clips could not be removed", async () => {
    const h = harness();
    h.storeDown = true;
    expect(await forget(h, { campaignId: CAMPAIGN, sessionId: SITTING })).toEqual({ ok: false, refusal: { status: 502, error: FORGET_MESSAGES.clips } });
    expect(h.sessions).toHaveLength(2);
  });

  // Bug caught: one account deleting another's sitting by its id, or a sitting named under the wrong campaign.
  it.each([
    ["another account's sitting", { campaignId: CAMPAIGN, sessionId: SITTING }, OTHER],
    ["a sitting named under another campaign", { campaignId: OTHER_CAMPAIGN, sessionId: SITTING }, ME],
    ["a sitting that does not exist", { campaignId: CAMPAIGN, sessionId: "00000000-0000-4000-8000-0000000000ff" }, ME],
  ])("answers not found for %s, and touches nothing", async (_what, body, userId) => {
    const h = harness();
    expect(await forget(h, body, userId)).toEqual({ ok: false, refusal: { status: 404, error: FORGET_MESSAGES.notFound } });
    expect(h.clipsRemoved).toEqual([]);
    expect(h.sessions).toHaveLength(2);
  });

  // Bug caught: a sitting deleted while it still holds a play session open, which then stays live with nothing to end it.
  it("refuses a sitting that was not left", async () => {
    const h = harness();
    expect(await forget(h, { campaignId: CAMPAIGN, sessionId: SECOND })).toEqual({ ok: false, refusal: { status: 409, error: FORGET_MESSAGES.stillOpen } });
    expect(h.clipsRemoved).toEqual([]);
  });

  // Bug caught: a campaign's clips left behind when the campaign is deleted; or another account's sittings in the
  // same campaign swept along; or the rows deleted here, ahead of the campaign's own delete.
  it("removes the clips of the caller's own sittings in a campaign, and no rows", async () => {
    const h = harness();
    h.sessions.push({ id: "00000000-0000-4000-8000-0000000000a3", user_id: OTHER, campaign_id: CAMPAIGN, left_at: null });
    expect(await forget(h, { campaignId: CAMPAIGN, allClips: true })).toEqual({ ok: true, deleted: 0 });
    expect(h.clipsRemoved).toEqual([`${CAMPAIGN}/${SITTING}`, `${CAMPAIGN}/${SECOND}`]);
    expect(h.sessions).toHaveLength(3);
  });

  // Bug caught: a request that is neither shape (or both) read as "all of them".
  it.each([{}, { campaignId: "nope", sessionId: SITTING }, { campaignId: CAMPAIGN }, { campaignId: CAMPAIGN, sessionId: SITTING, allClips: true }, { campaignId: CAMPAIGN, allClips: "yes" }])(
    "refuses a request that is not one of the two shapes: %j",
    async (body) => {
      const h = harness();
      expect(await forget(h, body)).toEqual({ ok: false, refusal: { status: 400, error: FORGET_MESSAGES.badBody } });
      expect(h.clipsRemoved).toEqual([]);
    },
  );
});
