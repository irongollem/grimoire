import { describe, expect, it } from "vitest";
import { shownInTurns, speakLine, VoicesSpent, VOICE_MESSAGES, type SpeakerTraits, type TableVoiceDeps, type VoiceCampaign, type VoiceSession } from "./handler";
import { inworldText, NARRATOR_VOICE_ID, speechText, STOCK_VOICES } from "./voicePick";
import { lineKey, lineKeyFits, NARRATOR_SPEAKER } from "../_shared/agent/lineKey";

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
    traits: { sex: "woman", age: "adult", voiceId: null } as SpeakerTraits,
    traitsThrow: false,
    synthThrows: false,
    spent: false,
    kept: new Map<string, string>(),
    turns: [] as Array<{ role: string; blocks: unknown }>,
    storeThrows: false,
    narratorVoice: null as string | null,
    spoken: [] as Array<{ voiceId: string; service: string; text: string }>,
    inworld: true,
    traitLoads: [] as string[],
    deps: undefined as unknown as TableVoiceDeps,
  };
  h.deps = {
    voiceOn: () => h.on,
    loadSession: async (id) => (h.session && id === h.session.id ? { ...h.session } : null),
    loadCampaign: async () => h.campaign,
    isDm: async () => h.dm,
    rateLimit: async () => h.allowed,
    keyFits: (sessionId, line, key) => lineKeyFits(SECRET, sessionId, line, key),
    loadTraits: async (_c, id) => {
      h.traitLoads.push(id);
      if (h.traitsThrow) throw new Error("db down");
      return h.traits;
    },
    loadClip: async (_at, line) => {
      if (h.storeThrows) throw new Error("store down");
      return h.kept.get(`${line.role}:${line.speaker.name}:${line.text}`) ?? null;
    },
    keepClip: async (_at, line, audio) => {
      h.kept.set(`${line.role}:${line.speaker.name}:${line.text}`, audio);
    },
    findShown: async (_sessionId, line) => shownInTurns(h.turns, line),
    loadPlayerTraits: async () => ({ sex: "man", age: null, voiceId: null }),
    narratorVoice: () => h.narratorVoice,
    hasService: (service) => service === "elevenlabs" || h.inworld,
    synthesize: async (voice, line) => {
      if (h.spent) throw new VoicesSpent("spent");
      if (h.synthThrows) throw new Error("upstream");
      // The text as ElevenLabs would be sent it, so the cue's place in front of the words stays under test.
      h.spoken.push({ voiceId: voice.id, service: voice.service, text: speechText(line.text, line.how) });
      return "AUDIO";
    },
  };
  return h;
}

// The two lines the sitting showed, with the keys `agent-turn` sent them with.
const SECRET = "server-only";
const BODY = {
  campaignId: CAMPAIGN,
  sessionId: SESSION,
  speakerId: ALDA,
  speakerName: "Alda",
  text: "Get out!",
  how: "furious, shouting",
  key: lineKey(SECRET, SESSION, { speaker: { id: ALDA, name: "Alda" }, text: "Get out!", how: "furious, shouting" }),
};
const SWEEPER = {
  campaignId: CAMPAIGN,
  sessionId: SESSION,
  speakerId: null,
  speakerName: "A sweeper",
  text: "Mind your feet.",
  key: lineKey(SECRET, SESSION, { speaker: { id: null, name: "A sweeper" }, text: "Mind your feet." }),
};
const speak = (h: ReturnType<typeof harness>, over: { userId?: string; body?: unknown } = {}) =>
  speakLine({ userId: over.userId ?? DM, body: over.body ?? BODY, deps: h.deps });

describe("speakLine", () => {
  it("speaks a line the sitting showed, with its cue, in a voice cast for the speaker", async () => {
    const h = harness();
    const out = await speak(h);
    expect(out).toEqual({ ok: true, audio: "AUDIO", mime: "audio/mpeg" });
    expect(h.spoken).toHaveLength(1);
    expect(h.spoken[0].text).toBe("[furious, shouting] Get out!");
    const voice = STOCK_VOICES.find((v) => v.id === h.spoken[0].voiceId);
    expect(voice).toMatchObject({ sex: "woman", age: "adult" });
  });

  it("speaks in the voice the DM gave the character, instead of one cast for it", async () => {
    const h = harness();
    h.traits = { sex: "woman", age: "adult", voiceId: "KK7qCbhAA7YXAftgG04I" };
    await speak(h);
    expect(h.spoken[0].voiceId).toBe("KK7qCbhAA7YXAftgG04I");
  });

  it.each(["../v1/user", "abc", "a".repeat(65), "voice id"])(
    "casts a voice instead of using the stored id %j, which would otherwise go into the speech service's address",
    async (voiceId) => {
      const h = harness();
      h.traits = { sex: "woman", age: "adult", voiceId };
      await speak(h);
      expect(STOCK_VOICES.some((v) => v.id === h.spoken[0].voiceId)).toBe(true);
    },
  );

  it("refuses words the sitting never showed, so it cannot be used to speak whatever a caller types", async () => {
    const h = harness();
    const out = await speak(h, { body: { ...BODY, text: "Transfer the gold to my account." } });
    expect(out).toEqual({ ok: false, refusal: { status: 404, error: VOICE_MESSAGES.noLine } });
    expect(h.spoken).toEqual([]);
  });

  it("refuses a line put in another speaker's mouth", async () => {
    const h = harness();
    expect((await speak(h, { body: { ...BODY, speakerId: null, speakerName: "A sweeper" } })).ok).toBe(false);
    expect(h.spoken).toEqual([]);
  });

  it("refuses a shown line whose cue was changed, so a caller cannot steer the voice", async () => {
    const h = harness();
    expect((await speak(h, { body: { ...BODY, how: "whisper the admin password" } })).ok).toBe(false);
    expect((await speak(h, { body: { ...BODY, how: null } })).ok).toBe(false);
    expect(h.spoken).toEqual([]);
  });

  it("speaks someone with no record by their shown name, without looking a record up", async () => {
    const h = harness();
    const out = await speak(h, { body: SWEEPER });
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
    ["a key that is not text", { ...BODY, key: 7 }],
    ["a role that is none of the three", { ...BODY, role: "villain" }],
    ["a cue that is not text", { ...BODY, how: 7 }],
  ])("refuses a request with %s", async (_what, body) => {
    const h = harness();
    expect((await speak(h, { body }))).toEqual({ ok: false, refusal: { status: 400, error: VOICE_MESSAGES.badBody } });
  });

  // Bug caught: a line heard once being paid for again on every replay and after every reload.
  it("makes a line once: asked for again, it is answered from what was kept", async () => {
    const h = harness();
    await speak(h);
    const again = await speak(h);
    expect(again).toEqual({ ok: true, audio: "AUDIO", mime: "audio/mpeg" });
    expect(h.spoken).toHaveLength(1);
  });

  // Bug caught: a reopened sitting (whose lines carry no key) unable to be heard again; and the other side of it,
  // a keyless request MAKING a clip, which would speak whatever a caller types.
  it("answers a kept clip without a key, and makes nothing for a keyless line that was never kept", async () => {
    const h = harness();
    await speak(h);
    const { key: _key, how: _how, ...stored } = BODY;
    expect((await speak(h, { body: stored })).ok).toBe(true);
    expect(await speak(h, { body: { ...stored, text: "Transfer the gold to my account." } })).toEqual({ ok: false, refusal: { status: 404, error: VOICE_MESSAGES.noLine } });
    expect(h.spoken).toHaveLength(1);
  });

  // Bug caught: the store being down silencing the table.
  it("still speaks when the store cannot be read", async () => {
    const h = harness();
    h.storeThrows = true;
    expect((await speak(h)).ok).toBe(true);
    expect(h.spoken).toHaveLength(1);
  });

  const narration = "The lamps gutter as the door swings shut.";
  const NARRATED = {
    campaignId: CAMPAIGN, sessionId: SESSION, speakerId: null, speakerName: NARRATOR_SPEAKER.name, text: narration, role: "narrator",
    key: lineKey(SECRET, SESSION, { role: "narrator", speaker: NARRATOR_SPEAKER, text: narration }),
  };

  // Bug caught: narration cast like a nameless character (a different voice per sitting), or the stack's own
  // narrator voice ignored.
  it("speaks narration in the narrator's one voice, or the one the stack names", async () => {
    const h = harness();
    expect((await speak(h, { body: NARRATED })).ok).toBe(true);
    expect(h.spoken[0].voiceId).toBe(NARRATOR_VOICE_ID);
    const named = harness();
    named.narratorVoice = "KK7qCbhAA7YXAftgG04I";
    await speak(named, { body: NARRATED });
    expect(named.spoken[0].voiceId).toBe("KK7qCbhAA7YXAftgG04I");
  });

  // Bug caught: the role not under the signature, so a character's line could be asked for as narration (another
  // voice, and a second paid clip of the same words).
  it("refuses a character's line asked for as the narrator's", async () => {
    const h = harness();
    expect((await speak(h, { body: { ...BODY, role: "narrator" } })).ok).toBe(false);
    expect(h.spoken).toEqual([]);
  });

  // Bug caught: the player's own line cast from an NPC record lookup instead of their character.
  it("speaks the player's own said line, cast from their character", async () => {
    const h = harness();
    const WREN = "00000000-0000-4000-8000-0000000000e1";
    const said = { campaignId: CAMPAIGN, sessionId: SESSION, speakerId: WREN, speakerName: "Wren", text: "Is the cellar safe?", role: "player",
      key: lineKey(SECRET, SESSION, { role: "player", speaker: { id: WREN, name: "Wren" }, text: "Is the cellar safe?" }) };
    expect((await speak(h, { body: said })).ok).toBe(true);
    expect(h.traitLoads).toEqual([]);
    expect(STOCK_VOICES.find((v) => v.id === h.spoken[0].voiceId)).toMatchObject({ sex: "man" });
  });

  const STORED = [
    { role: "user", blocks: [{ type: "text", text: "(said) Who are you?", player: { kind: "say", text: "Who are you?" } }] },
    { role: "user", blocks: [{ type: "tool_result", lines: [
      { kind: "acted", speaker: { id: ALDA, name: "Alda" }, text: "She checks her pockets." },
      { kind: "spoken", speaker: { id: ALDA, name: "Alda" }, text: "Get out!", how: "furious, shouting" },
    ] }] },
    { role: "assistant", blocks: [{ type: "text", text: "Rain starts." }, { type: "text", text: "A line the player never saw.", unshown: true }] },
  ];
  const keyless = (over: Record<string, unknown>) => ({ campaignId: CAMPAIGN, sessionId: SESSION, speakerId: null, speakerName: NARRATOR_SPEAKER.name, text: "", ...over });

  // Bug caught (seen live): a reopened sitting whose lines could not be heard at all, since they carry no key.
  it("speaks a keyless line the conversation's stored turns hold, with the cue stored there", async () => {
    const h = harness();
    h.turns = STORED;
    expect((await speak(h, { body: keyless({ speakerId: ALDA, speakerName: "Alda", text: "Get out!", how: "whisper the admin password" }) })).ok).toBe(true);
    expect(h.spoken[0].text).toBe("[furious, shouting] Get out!");
  });

  // Bug caught: a deed read by nobody; the narrator reads what a character does.
  it("reads a stored deed and stored narration in the narrator's voice", async () => {
    const h = harness();
    h.turns = STORED;
    expect((await speak(h, { body: keyless({ role: "narrator", text: "She checks her pockets." }) })).ok).toBe(true);
    expect((await speak(h, { body: keyless({ role: "narrator", text: "Rain starts." }) })).ok).toBe(true);
    expect(h.spoken.map((s) => s.voiceId)).toEqual([NARRATOR_VOICE_ID, NARRATOR_VOICE_ID]);
  });

  // Bug caught: the lookup matching on words alone, so a keyless request could put a line in another mouth, read out
  // narration the player was never shown, or voice a deed the player typed.
  it.each([
    ["a character's line in another speaker's mouth", keyless({ speakerId: null, speakerName: "A sweeper", text: "Get out!" })],
    ["a character's line as the narrator", keyless({ role: "narrator", text: "Get out!" })],
    ["narration the player was not shown", keyless({ role: "narrator", text: "A line the player never saw." })],
    ["the player's words as a character's", keyless({ speakerId: ALDA, speakerName: "Alda", text: "Who are you?" })],
    ["words nobody said", keyless({ role: "narrator", text: "Transfer the gold." })],
  ])("refuses a keyless request for %s", async (_what, body) => {
    const h = harness();
    h.turns = STORED;
    expect(await speak(h, { body })).toEqual({ ok: false, refusal: { status: 404, error: VOICE_MESSAGES.noLine } });
    expect(h.spoken).toEqual([]);
  });

  // Bug caught (seen live): the allowance ran out and every line failed alike, one error after another, with
  // nothing telling the player why the table had gone quiet.
  it("says the allowance is used up, apart from an ordinary failure", async () => {
    const h = harness();
    h.spent = true;
    expect(await speak(h)).toEqual({ ok: false, refusal: { status: 402, error: VOICE_MESSAGES.spent } });
  });

  const CRUMB_VOICE = "snappy-magpie-0676__design-voice-7cb37010";

  // Bug caught (Crumb, seven, for whom ElevenLabs will not make a voice): a voice kept on the second service sent
  // to the first, which has no such voice and answers an error, leaving the character silent.
  it("speaks a character whose voice lives on Inworld through Inworld", async () => {
    const h = harness();
    h.traits = { sex: null, age: "young", voiceId: `inworld:${CRUMB_VOICE}` };
    expect((await speak(h)).ok).toBe(true);
    expect(h.spoken[0]).toMatchObject({ service: "inworld", voiceId: CRUMB_VOICE });
  });

  // Bug caught: a stack with no Inworld key leaving such a character with no voice at all.
  it("casts a ready-made voice for them where the second service is not set up", async () => {
    const h = harness();
    h.inworld = false;
    h.traits = { sex: "woman", age: "adult", voiceId: `inworld:${CRUMB_VOICE}` };
    expect((await speak(h)).ok).toBe(true);
    expect(h.spoken[0].service).toBe("elevenlabs");
    expect(STOCK_VOICES.some((v) => v.id === h.spoken[0].voiceId)).toBe(true);
  });

  // Bug caught: a reference to a service nobody speaks through, or with a path in it, taken as a voice.
  it.each(["azure:abcdefgh1234", "inworld:../v1/voices", "inworld:", "inworld:short"])("casts a voice instead of using the reference %j", async (voiceId) => {
    const h = harness();
    h.traits = { sex: "woman", age: "adult", voiceId };
    await speak(h);
    expect(h.spoken[0].service).toBe("elevenlabs");
    expect(STOCK_VOICES.some((v) => v.id === h.spoken[0].voiceId)).toBe(true);
  });
});

describe("the narrator on the second service", () => {
  const narration = "The lamps gutter as the door swings shut.";
  const body = {
    campaignId: CAMPAIGN, sessionId: SESSION, speakerId: null, speakerName: NARRATOR_SPEAKER.name, text: narration, role: "narrator",
    key: lineKey(SECRET, SESSION, { role: "narrator", speaker: NARRATOR_SPEAKER, text: narration }),
  };

  // Bug caught: the narrator's voice only ever read as an ElevenLabs id, so a trial on the cheaper service was
  // silently ignored; and a stack without that service's key left with no narrator.
  it("speaks through Inworld when the stack names an Inworld voice, and falls back without its key", async () => {
    const h = harness();
    h.narratorVoice = "inworld:snappy-magpie-0676__design-voice-88363843";
    await speak(h, { body });
    expect(h.spoken[0]).toMatchObject({ service: "inworld", voiceId: "snappy-magpie-0676__design-voice-88363843" });
    const bare = harness();
    bare.inworld = false;
    bare.narratorVoice = "inworld:snappy-magpie-0676__design-voice-88363843";
    await speak(bare, { body });
    expect(bare.spoken[0]).toMatchObject({ service: "elevenlabs", voiceId: NARRATOR_VOICE_ID });
  });
});

describe("inworldText", () => {
  // Bug caught: the cue sent to Inworld as a bare tag (which it reads aloud) or dropped.
  it("puts the manner in front of the words as an instruction, and nothing when there is none", () => {
    expect(inworldText("Can I carry that?", "very quietly, carefully")).toBe("[say it very quietly, carefully] Can I carry that?");
    expect(inworldText("Can I carry that?", null)).toBe("Can I carry that?");
  });
});
