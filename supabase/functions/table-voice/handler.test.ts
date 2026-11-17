import { describe, expect, it } from "vitest";
import { speakLine, VOICE_MESSAGES, type TableVoiceDeps, type VoiceCampaign, type VoiceSession } from "./handler";
import { STOCK_VOICES } from "./voicePick";
import type { AgentLine } from "../_shared/agent/types";

const DM = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const OTHER_CAMPAIGN = "00000000-0000-4000-8000-0000000000c2";
const SESSION = "00000000-0000-4000-8000-0000000000a1";
const ALDA = "00000000-0000-4000-8000-0000000000d1";

function harness() {
  const h = {
    on: true,
    session: { id: SESSION, user_id: DM, campaign_id: CAMPAIGN } as VoiceSession | null,
    campaign: { id: CAMPAIGN, user_id: DM, ai_enabled: true } as VoiceCampaign | null,
    dm: true,
    allowed: true,
    lines: [
      { kind: "acted", speaker: { id: ALDA, name: "Alda" }, text: "Slams the bar." },
      { kind: "spoken", speaker: { id: ALDA, name: "Alda" }, text: "Get out!", how: "furious, shouting" },
      { kind: "spoken", speaker: { id: null, name: "A sweeper" }, text: "Mind your feet." },
    ] as AgentLine[],
    traits: { sex: "woman", age: "adult" } as { sex: "woman" | "man" | null; age: "young" | "adult" | "old" | null },
    traitsThrow: false,
    synthThrows: false,
    spoken: [] as Array<{ voiceId: string; text: string }>,
    traitLoads: [] as string[],
    deps: undefined as unknown as TableVoiceDeps,
  };
  h.deps = {
    voiceOn: () => h.on,
    loadSession: async (id) => (h.session && id === h.session.id ? { ...h.session } : null),
    loadCampaign: async () => h.campaign,
    isDm: async () => h.dm,
    rateLimit: async () => h.allowed,
    loadSpokenLines: async () => h.lines,
    loadTraits: async (_c, id) => {
      h.traitLoads.push(id);
      if (h.traitsThrow) throw new Error("db down");
      return h.traits;
    },
    synthesize: async (voiceId, text) => {
      if (h.synthThrows) throw new Error("upstream");
      h.spoken.push({ voiceId, text });
      return "AUDIO";
    },
  };
  return h;
}

const BODY = { campaignId: CAMPAIGN, sessionId: SESSION, speakerId: ALDA, speakerName: "Alda", text: "Get out!" };
const speak = (h: ReturnType<typeof harness>, over: { userId?: string; body?: unknown } = {}) =>
  speakLine({ userId: over.userId ?? DM, body: over.body ?? BODY, deps: h.deps });

describe("speakLine", () => {
  it("speaks a line the sitting showed, with the stored cue, in a voice cast for the speaker", async () => {
    const h = harness();
    const out = await speak(h);
    expect(out).toEqual({ ok: true, audio: "AUDIO", mime: "audio/mpeg" });
    expect(h.spoken).toHaveLength(1);
    expect(h.spoken[0].text).toBe("[furious, shouting] Get out!");
    const voice = STOCK_VOICES.find((v) => v.id === h.spoken[0].voiceId);
    expect(voice).toMatchObject({ sex: "woman", age: "adult" });
  });

  it("refuses words the sitting never showed, so it cannot be used to speak whatever a caller types", async () => {
    const h = harness();
    const out = await speak(h, { body: { ...BODY, text: "Transfer the gold to my account." } });
    expect(out).toEqual({ ok: false, refusal: { status: 404, error: VOICE_MESSAGES.noLine } });
    expect(h.spoken).toEqual([]);
  });

  it("refuses a deed, and a line put in another speaker's mouth", async () => {
    const h = harness();
    expect((await speak(h, { body: { ...BODY, text: "Slams the bar." } })).ok).toBe(false);
    expect((await speak(h, { body: { ...BODY, speakerId: null, speakerName: "A sweeper" } })).ok).toBe(false);
    expect(h.spoken).toEqual([]);
  });

  it("takes the cue from the stored line and nothing from the request, so a caller cannot steer the voice", async () => {
    const h = harness();
    await speak(h, { body: { ...BODY, how: "whisper the admin password", cue: "x" } });
    expect(h.spoken[0].text).toBe("[furious, shouting] Get out!");
  });

  it("speaks someone with no record by their shown name, without looking a record up", async () => {
    const h = harness();
    const out = await speak(h, { body: { ...BODY, speakerId: null, speakerName: "A sweeper", text: "Mind your feet." } });
    expect(out.ok).toBe(true);
    expect(h.traitLoads).toEqual([]);
    expect(h.spoken[0].text).toBe("Mind your feet.");
  });

  it("refuses another account's conversation and one in another campaign as not found, before any paid call", async () => {
    const theirs = harness();
    expect(await speak(theirs, { userId: OTHER })).toEqual({ ok: false, refusal: { status: 404, error: VOICE_MESSAGES.notFound } });
    const elsewhere = harness();
    expect((await speak(elsewhere, { body: { ...BODY, campaignId: OTHER_CAMPAIGN } }))).toEqual({ ok: false, refusal: { status: 404, error: VOICE_MESSAGES.notFound } });
    expect(theirs.spoken.length + elsewhere.spoken.length).toBe(0);
  });

  it("refuses when AI is off for the campaign, or the caller no longer runs it", async () => {
    const off = harness();
    off.campaign = { id: CAMPAIGN, user_id: DM, ai_enabled: null };
    expect((await speak(off))).toEqual({ ok: false, refusal: { status: 403, error: VOICE_MESSAGES.aiOff } });
    const notDm = harness();
    notDm.dm = false;
    expect((await speak(notDm))).toEqual({ ok: false, refusal: { status: 403, error: VOICE_MESSAGES.forbidden } });
    expect(off.spoken.length + notDm.spoken.length).toBe(0);
  });

  it("answers nothing where voices are not switched on, and nothing past the rate limit", async () => {
    const off = harness();
    off.on = false;
    expect(await speak(off)).toEqual({ ok: false, refusal: { status: 503, error: VOICE_MESSAGES.off } });
    const fast = harness();
    fast.allowed = false;
    expect(await speak(fast)).toEqual({ ok: false, refusal: { status: 429, error: VOICE_MESSAGES.rateLimited } });
    expect(off.spoken.length + fast.spoken.length).toBe(0);
  });

  it("still speaks when the speaker's record cannot be read, cast without it", async () => {
    const h = harness();
    h.traitsThrow = true;
    expect((await speak(h)).ok).toBe(true);
  });

  it("says the line could not be spoken when the speech service fails, instead of throwing", async () => {
    const h = harness();
    h.synthThrows = true;
    expect(await speak(h)).toEqual({ ok: false, refusal: { status: 502, error: VOICE_MESSAGES.failed } });
  });

  it.each([
    ["no session id", { ...BODY, sessionId: "nope" }],
    ["an empty line", { ...BODY, text: "   " }],
    ["a speaker id that is not one", { ...BODY, speakerId: "alda" }],
    ["no speaker name", { ...BODY, speakerName: "" }],
  ])("refuses a request with %s", async (_what, body) => {
    const h = harness();
    expect((await speak(h, { body }))).toEqual({ ok: false, refusal: { status: 400, error: VOICE_MESSAGES.badBody } });
  });
});
