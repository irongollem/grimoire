import { describe, expect, it } from "vitest";
import { admitConversation, type GateCampaign, type GateDeps, type GateMessages, type GateSession } from "./gates.ts";
import type { AgentProvider } from "../providerIo.ts";

const ME = "u-me";
const CAMPAIGN = "c-1";
const MESSAGES: GateMessages = {
  notFound: "not found", noCampaign: "no campaign", aiOff: "ai off", forbidden: "forbidden", rateLimited: "rate_limited",
  noProvider: "no provider", noAdapter: "no adapter", noMetering: "no metering", flagged: "flagged",
};

interface Session extends GateSession { kind: string }

function harness(over: Partial<GateDeps<GateCampaign, Session>> = {}, session: Session | null = null) {
  const calls: string[] = [];
  const provider: AgentProvider = { provider: "openai", model: "m1", isByok: false, callModel: async () => { throw new Error("not called"); } };
  const deps: GateDeps<GateCampaign, Session> = {
    accountRefusal: async () => { calls.push("account"); return null; },
    loadCampaign: async () => { calls.push("campaign"); return { id: CAMPAIGN, ai_enabled: true }; },
    isDm: async () => { calls.push("dm"); return true; },
    loadSession: async () => { calls.push("session"); return session; },
    rateLimit: async () => { calls.push("rate"); return true; },
    resolveProvider: async () => { calls.push("provider"); return provider; },
    loadPrice: async () => { calls.push("price"); return { inputPerMillion: 1, outputPerMillion: 1, cachedInputPerMillion: null }; },
    loadCalibration: async () => { calls.push("calibration"); return { usdPerCredit: 0.01, margin: 1 }; },
    isFlagged: async () => { calls.push("flagged"); return false; },
    ...over,
  };
  const run = (extra: Partial<Parameters<typeof admitConversation<GateCampaign, Session>>[0]> = {}) =>
    admitConversation<GateCampaign, Session>({
      userId: ME, campaignId: CAMPAIGN, sessionId: undefined, message: "hi", kind: "ask", kindOf: (s) => s.kind,
      deps, messages: MESSAGES, logName: "test", ...extra,
    });
  return { run, calls, deps, provider };
}

const mine = (kind: string): Session => ({ id: "s-1", user_id: ME, campaign_id: CAMPAIGN, kind });

describe("admitConversation", () => {
  it("runs the gates in the documented order, the hooks at their places", async () => {
    const h = harness({}, mine("ask"));
    const result = await h.run({
      sessionId: "s-1",
      afterSession: async () => { h.calls.push("hook:session"); return null; },
      afterMetering: async () => { h.calls.push("hook:metering"); return null; },
    });
    expect(result.kind).toBe("admitted");
    expect(h.calls).toEqual(["account", "campaign", "dm", "session", "hook:session", "rate", "provider", "price", "calibration", "hook:metering", "flagged"]);
  });

  it("refuses a conversation of the other kind as not found, so one function cannot continue the other's (the kind guard)", async () => {
    for (const [expected, stored] of [["ask", "solo_table"], ["solo_table", "ask"]] as const) {
      const h = harness({}, mine(stored));
      const result = await h.run({ sessionId: "s-1", kind: expected });
      expect(result).toEqual({ kind: "refused", refusal: { status: 404, error: "not found" } });
      // Refused before the rate limit and the provider: nothing was spent.
      expect(h.calls).not.toContain("rate");
    }
  });

  it("refuses someone else's conversation and one in another campaign as not found, never as forbidden", async () => {
    const theirs = harness({}, { ...mine("ask"), user_id: "u-other" });
    expect(await theirs.run({ sessionId: "s-1" })).toEqual({ kind: "refused", refusal: { status: 404, error: "not found" } });
    const elsewhere = harness({}, { ...mine("ask"), campaign_id: "c-2" });
    expect(await elsewhere.run({ sessionId: "s-1" })).toEqual({ kind: "refused", refusal: { status: 404, error: "not found" } });
  });

  it("refuses a campaign with AI off, and a caller who is not its DM", async () => {
    const off = harness({ loadCampaign: async () => ({ id: CAMPAIGN, ai_enabled: false }) });
    expect(await off.run()).toEqual({ kind: "refused", refusal: { status: 403, error: "ai off" } });
    const player = harness({ isDm: async () => false });
    expect(await player.run()).toEqual({ kind: "refused", refusal: { status: 403, error: "forbidden" } });
  });

  it("stops at the account's own refusal before reading the campaign", async () => {
    const h = harness({ accountRefusal: async () => ({ status: 403, error: "suspended" }) });
    expect(await h.run()).toEqual({ kind: "refused", refusal: { status: 403, error: "suspended" } });
    expect(h.calls).toEqual([]);
  });

  it("stops at a hook's refusal before the rate limit is spent", async () => {
    const h = harness({}, mine("ask"));
    const result = await h.run({ sessionId: "s-1", afterSession: async () => ({ status: 409, error: "left" }) });
    expect(result).toEqual({ kind: "refused", refusal: { status: 409, error: "left" } });
    expect(h.calls).not.toContain("rate");
  });

  it("does not meter an own-key conversation, and refuses a metered one with no usable price", async () => {
    const own = harness();
    own.deps.resolveProvider = async () => ({ ...own.provider, isByok: true });
    expect((await own.run()).kind).toBe("admitted");
    expect(own.calls).not.toContain("price");

    const broken = harness({ loadCalibration: async () => ({ usdPerCredit: null, margin: 1 }) });
    expect(await broken.run()).toEqual({ kind: "refused", refusal: { status: 503, error: "no metering" } });
  });

  it("refuses a flagged message, lets an outage of the screen through, and screens nothing for an empty one", async () => {
    expect(await harness({ isFlagged: async () => true }).run()).toEqual({ kind: "refused", refusal: { status: 400, error: "flagged" } });
    const down = harness({ isFlagged: async () => { throw new Error("down"); } });
    expect((await down.run()).kind).toBe("admitted");
    const empty = harness();
    await empty.run({ message: "" });
    expect(empty.calls).not.toContain("flagged");
  });

  it("answers 429 when the rate limit is spent, before any provider is resolved", async () => {
    const h = harness({ rateLimit: async () => false });
    expect(await h.run()).toEqual({ kind: "refused", refusal: { status: 429, error: "rate_limited" } });
    expect(h.calls).not.toContain("provider");
  });
});
