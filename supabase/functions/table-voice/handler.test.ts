import { describe, expect, it } from "vitest";
import { jsonError } from "../_shared/pipeline/respond";
import { familiarShown, shownInTurns, spokenFromMarkdown, speakLine, voiceRates, VoicesSpent, type SpeakerTraits, type TableVoiceDeps, type VoiceHold, type VoiceSession } from "./handler";
import { inworldText, NARRATOR_VOICES, speechText, STOCK_VOICES } from "./voicePick";
import { lineKey, lineKeyFits, NARRATOR_SPEAKER } from "../_shared/agent/lineKey";
import { FAMILIAR_VOICE } from "../_shared/narratorVoice";

const DM = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const OTHER_CAMPAIGN = "00000000-0000-4000-8000-0000000000c2";
const SESSION = "00000000-0000-4000-8000-0000000000a1";
const ALDA = "00000000-0000-4000-8000-0000000000d1";

function harness() {
  const h = {
    on: true,
    session: { id: SESSION, user_id: DM, campaign_id: CAMPAIGN, narrator_voice: "male", kind: "solo_table" } as VoiceSession | null,
    campaignRefusal: null as Response | null,
    allowed: true,
    traits: { sex: "woman", age: "adult", voiceId: null } as SpeakerTraits,
    traitsThrow: false,
    synthThrows: false,
    spent: false,
    kept: new Map<string, string>(),
    turns: [] as Array<{ role: string; blocks: unknown }>,
    storeThrows: false,
    spoken: [] as Array<{ voiceId: string; service: string; text: string }>,
    // 40 USD per million characters on ElevenLabs, 10 on Inworld; a credit worth 0.0066 USD at a margin of 2.
    rates: { elevenlabs: 40, inworld: 10 } as Record<string, number | null>,
    refuseHold: null as Response | null,
    /** What `accrue_agent_voice` answers: the whole credits the running total newly crossed. */
    due: 1,
    accrued: [] as number[],
    accrueThrows: false,
    forbidden: null as string | null,
    screenDown: false,
    held: [] as number[],
    reasons: [] as string[],
    switches: [] as string[],
    elevenlabs: true,
    charged: [] as Array<{ cost: number; provider: string }>,
    inworld: true,
    traitLoads: [] as string[],
    deps: undefined as unknown as TableVoiceDeps,
  };
  h.deps = {
    voiceOn: () => h.on,
    loadSession: async (id) => (h.session && id === h.session.id ? { ...h.session } : null),
    // DM-only and AI-on are `loadAiCampaign`'s rules (its own test); here only that its refusal is passed through.
    loadCampaign: async (_c, _u, aiSwitch) => (h.switches.push(aiSwitch), h.campaignRefusal ? { ok: false, response: h.campaignRefusal } : { ok: true, campaign: { id: CAMPAIGN, user_id: DM, ai_enabled: true } }),
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
    hasService: (service) => (service === "elevenlabs" ? h.elevenlabs : h.inworld),
    isFlagged: async (text) => {
      if (h.screenDown) throw new Error("moderation down");
      return h.forbidden !== null && text.includes(h.forbidden);
    },
    loadRate: async (service) => (h.rates[service] === null ? null : { usdPerMillionChars: h.rates[service] as number, calibration: { usdPerCredit: 0.0066, margin: 2 } }),
    modelOf: () => "model-1",
    // The release-once and charge-after-release rules are `withCreditHold`'s (its own test); this records what was
    // held and charged, and answers a refused hold the way the real one does.
    withHold: async (_userId, credits, reason, work) => {
      if (h.refuseHold) return h.refuseHold;
      h.held.push(credits);
      h.reasons.push(reason);
      const hold: VoiceHold = { charge: (_reason, line) => void h.charged.push({ cost: line.cost, provider: line.log?.provider ?? "" }), free: () => {} };
      return work(hold);
    },
    accrue: async (_sessionId, credits) => {
      if (h.accrueThrows) throw new Error("rpc down");
      h.accrued.push(credits);
      return h.due;
    },
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
const speak = async (h: ReturnType<typeof harness>, over: { userId?: string; body?: unknown } = {}) => {
  const response = await speakLine({ userId: over.userId ?? DM, body: over.body ?? BODY, deps: h.deps });
  return { ok: response.ok, status: response.status, ...((await response.json()) as { audio?: string; mime?: string; error?: string }) };
};

describe("speakLine", () => {
  it("speaks a line the sitting showed, with its cue, in a voice cast for the speaker", async () => {
    const h = harness();
    const out = await speak(h);
    expect(out).toEqual({ ok: true, status: 200, audio: "AUDIO", mime: "audio/mpeg" });
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
    expect(out).toMatchObject({ ok: false, status: 404 });
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
    expect(await speak(theirs, { userId: OTHER })).toMatchObject({ ok: false, status: 404 });
    const elsewhere = harness();
    expect((await speak(elsewhere, { body: { ...BODY, campaignId: OTHER_CAMPAIGN } }))).toMatchObject({ ok: false, status: 404 });
    expect(theirs.spoken.length + elsewhere.spoken.length).toBe(0);
  });

  it("passes on the refusal when the campaign is not the caller's to run or has AI off, before any paid call", async () => {
    const h = harness();
    h.campaignRefusal = jsonError(403, "ai_disabled", "AI is turned off for this campaign.");
    expect(await speak(h)).toMatchObject({ ok: false, status: 403, error: "ai_disabled" });
    expect(h.spoken).toEqual([]);
    expect(h.held).toEqual([]);
  });

  it("answers nothing where voices are not switched on, and nothing past the rate limit", async () => {
    const off = harness();
    off.on = false;
    expect(await speak(off)).toMatchObject({ ok: false, status: 503 });
    const fast = harness();
    fast.allowed = false;
    expect(await speak(fast)).toMatchObject({ ok: false, status: 429 });
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
    expect(await speak(h)).toMatchObject({ ok: false, status: 502 });
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
    expect((await speak(h, { body }))).toMatchObject({ ok: false, status: 400 });
  });

  // Bug caught: a line heard once being paid for again on every replay and after every reload.
  it("makes a line once: asked for again, it is answered from what was kept", async () => {
    const h = harness();
    await speak(h);
    const again = await speak(h);
    expect(again).toEqual({ ok: true, status: 200, audio: "AUDIO", mime: "audio/mpeg" });
    expect(h.spoken).toHaveLength(1);
  });

  // Bug caught: a reopened sitting (whose lines carry no key) unable to be heard again; and the other side of it,
  // a keyless request MAKING a clip, which would speak whatever a caller types.
  it("answers a kept clip without a key, and makes nothing for a keyless line that was never kept", async () => {
    const h = harness();
    await speak(h);
    const { key: _key, how: _how, ...stored } = BODY;
    expect((await speak(h, { body: stored })).ok).toBe(true);
    expect(await speak(h, { body: { ...stored, text: "Transfer the gold to my account." } })).toMatchObject({ ok: false, status: 404 });
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

  // Bug caught: narration cast like a nameless character (a different voice per sitting), or the table's choice
  // of voice ignored (every table narrated by the man, whatever its host chose).
  it("speaks narration in the voice the table chose", async () => {
    // The man narrates on ElevenLabs, told as a storyteller; the woman his Inworld design.
    const h = harness();
    expect((await speak(h, { body: NARRATED })).ok).toBe(true);
    expect(h.spoken[0]).toMatchObject({ service: "elevenlabs", voiceId: NARRATOR_VOICES.male.elevenlabs });
    expect(h.spoken[0].text.startsWith("[an old storyteller")).toBe(true);
    const hers = harness();
    if (hers.session) hers.session.narrator_voice = "female";
    await speak(hers, { body: NARRATED });
    expect(hers.spoken[0]).toMatchObject({ service: "inworld", voiceId: NARRATOR_VOICES.female.inworld });
    // Inworld was not found to act on a cue, so none is sent (it would be read out, and paid for).
    expect(hers.spoken[0].text).toBe(narration);
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
    expect(h.spoken.map((s) => s.voiceId)).toEqual([NARRATOR_VOICES.male.elevenlabs, NARRATOR_VOICES.male.elevenlabs]);
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
    expect(await speak(h, { body })).toMatchObject({ ok: false, status: 404 });
    expect(h.spoken).toEqual([]);
  });

  // Bug caught (seen live): the allowance ran out and every line failed alike, one error after another, with
  // nothing telling the player why the table had gone quiet.
  it("says the allowance is used up, apart from an ordinary failure", async () => {
    const h = harness();
    h.spent = true;
    expect(await speak(h)).toMatchObject({ ok: false, status: 402 });
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

  // Bug caught: a stack with only one speech service left with no narrator, or a table that chose one voice
  // answered by the other choice's when it falls back.
  it("narrates in the same choice on the other service when the stack lacks the choice's own", async () => {
    const noInworld = harness();
    noInworld.inworld = false;
    if (noInworld.session) noInworld.session.narrator_voice = "female";
    await speak(noInworld, { body });
    expect(noInworld.spoken[0]).toMatchObject({ service: "elevenlabs", voiceId: NARRATOR_VOICES.female.elevenlabs });
    const noEleven = harness();
    noEleven.deps.hasService = (service) => service === "inworld";
    await speak(noEleven, { body });
    expect(noEleven.spoken[0]).toMatchObject({ service: "inworld", voiceId: NARRATOR_VOICES.male.inworld });
    expect(NARRATOR_VOICES.female.elevenlabs).not.toBe(NARRATOR_VOICES.male.elevenlabs);
  });
});

describe("inworldText", () => {
  // Bug caught: the cue sent to Inworld as a bare tag (which it reads aloud) or dropped.
  it("puts the manner in front of the words as an instruction, and nothing when there is none", () => {
    expect(inworldText("Can I carry that?", "very quietly, carefully")).toBe("[say it very quietly, carefully] Can I carry that?");
    expect(inworldText("Can I carry that?", null)).toBe("Can I carry that?");
  });
});

describe("what a voiced line costs", () => {
  // "[furious, shouting] Get out!": 8 characters of words and 17 + 3 of cue, 28 in all. At 40 USD per million,
  // doubled, over 0.0066 USD a credit: 28 * 40 / 1e6 * 2 / 0.0066 = 0.3394 credits.
  it("accrues what a line cost on the sitting, holds a credit while it is made, and bills only what accrual says is due", async () => {
    const h = harness();
    await speak(h);
    expect(h.accrued).toHaveLength(1);
    expect(h.accrued[0]).toBeCloseTo(0.3394, 3);
    expect(h.charged).toEqual([{ cost: 1, provider: "elevenlabs" }]);
    expect(h.held).toEqual([1]);
    // Nothing newly crossed a whole credit: nothing is billed (a zero charge would be a free ledger line).
    const part = harness();
    part.due = 0;
    await speak(part);
    expect(part.charged).toEqual([]);
  });

  // Bug caught: a failed accrual turning a line that was spoken and kept into an error.
  it("still answers the line when accruing its cost fails", async () => {
    const h = harness();
    h.accrueThrows = true;
    expect(await speak(h)).toMatchObject({ ok: true, audio: "AUDIO" });
    expect(h.charged).toEqual([]);
  });

  // Bug caught: hearing a line again charged a second time, though nothing was made.
  it("charges nothing for a line answered from the kept clip", async () => {
    const h = harness();
    await speak(h);
    await speak(h);
    expect(h.spoken).toHaveLength(1);
    expect(h.accrued).toHaveLength(1);
    expect(h.held).toHaveLength(1);
  });

  // Bug caught: speech made for an account that cannot pay for it.
  it("makes nothing for an account that cannot pay, and says why", async () => {
    const h = harness();
    h.refuseHold = jsonError(402, "insufficient_credits");
    expect(await speak(h)).toMatchObject({ ok: false, status: 402, error: "insufficient_credits" });
    expect(h.spoken).toEqual([]);
    expect(h.charged).toEqual([]);
  });

  // Bug caught: a service with no price on file speaking for free.
  it("makes nothing when the service's price is not on file", async () => {
    const h = harness();
    h.rates.elevenlabs = null;
    expect(await speak(h)).toMatchObject({ ok: false, status: 503 });
    expect(h.spoken).toEqual([]);
  });

  // Bug caught: a line that could not be made accrued or charged.
  it("accrues and charges nothing when the line could not be made", async () => {
    const h = harness();
    h.synthThrows = true;
    expect((await speak(h)).ok).toBe(false);
    expect(h.accrued).toEqual([]);
    expect(h.charged).toEqual([]);
  });

  // Bug caught: a child's voice on the cheaper service charged at the dearer service's rate.
  it("charges a line on the cheaper service the cheaper rate", async () => {
    const h = harness();
    h.traits = { sex: null, age: null, voiceId: "inworld:snappy-magpie-0676__design-voice-7cb37010" };
    await speak(h);
    expect(h.charged[0].provider).toBe("inworld");
    expect(h.accrued[0]).toBeCloseTo(0.3394 / 4, 3);
  });
});

describe("voiceRates", () => {
  // 900 characters a minute: 10.909 credits on ElevenLabs (shown as 11), 2.727 on Inworld (2.8).
  it("says what a minute costs on each service the stack speaks through", async () => {
    const h = harness();
    expect(await voiceRates(h.deps)).toEqual({ on: true, perMinute: { elevenlabs: 11, inworld: 2.8 } });
  });

  // Bug caught: a rate shown for voices that are switched off, or for a service with no key or no price.
  it("shows nothing for what cannot speak", async () => {
    const h = harness();
    h.inworld = false;
    expect((await voiceRates(h.deps)).perMinute).toEqual({ elevenlabs: 11, inworld: null });
    h.on = false;
    expect(await voiceRates(h.deps)).toEqual({ on: false, perMinute: { elevenlabs: null, inworld: null } });
  });
});

describe("a line the table may not tell", () => {
  // Bug caught: a line voiced the moment it arrives, before its turn was screened, read aloud although the turn is
  // then withheld; and paid for.
  it("is never spoken, kept or charged", async () => {
    const h = harness();
    h.forbidden = "Get out";
    expect(await speak(h)).toMatchObject({ ok: false, status: 422 });
    expect(h.spoken).toEqual([]);
    expect(h.charged).toEqual([]);
    expect(h.kept.size).toBe(0);
  });

  // Bug caught: an outage of the screen silencing every voice at the table.
  it("is still spoken when the screen cannot run", async () => {
    const h = harness();
    h.screenDown = true;
    expect((await speak(h)).ok).toBe(true);
  });
});

describe("Oolu, the Familiar's voice (Ask)", () => {
  const REPLY = "**Brindle** keeps the ledger.";
  const ASK_TURNS = [
    { role: "user", blocks: [{ type: "text", text: "Who keeps the ledger?" }] },
    { role: "assistant", blocks: [{ type: "text", text: "Let me look. " }, { type: "tool_use", id: "t1", name: "search" }] },
    { role: "user", blocks: [{ type: "tool_result", tool_use_id: "t1", content: "Brindle" }] },
    { role: "assistant", blocks: [{ type: "text", text: REPLY }] },
  ];
  const asked = (h: ReturnType<typeof harness>) => {
    h.session = { id: SESSION, user_id: DM, campaign_id: CAMPAIGN, narrator_voice: "male", kind: "ask" };
    h.turns = ASK_TURNS;
  };
  const OOLU = { campaignId: CAMPAIGN, sessionId: SESSION, speakerId: null, speakerName: "Oolu", role: "familiar", text: REPLY };

  // Bug caught: Oolu usable on the AI table, or the table's voices usable in Ask (a table session's DM streaming
  // arbitrary text through the owl); answered like a missing conversation so nothing is revealed.
  it.each([
    ["Oolu on a table session", "solo_table", OOLU],
    ["a table role on an Ask session", "ask", { ...OOLU, role: "narrator", speakerName: "The Narrator" }],
  ])("refuses %s as a conversation not found", async (_what, kind, body) => {
    const h = harness();
    h.session = { id: SESSION, user_id: DM, campaign_id: CAMPAIGN, narrator_voice: "male", kind };
    h.turns = ASK_TURNS;
    expect(await speak(h, { body })).toMatchObject({ ok: false, status: 404, error: "conversation_not_found" });
    expect(h.spoken).toEqual([]);
    expect(h.held).toEqual([]);
  });

  // Bug caught: Ask following the table's AI switch (Ask dead wherever the table is off), or the table following the
  // looser one (the AI table open to a campaign that never granted it).
  it("applies the campaign's AI switch for Oolu and the table's switch for the table", async () => {
    const h = harness();
    asked(h);
    await speak(h, { body: OOLU });
    const t = harness();
    await speak(t);
    expect([h.switches, t.switches]).toEqual([["campaign"], ["table"]]);
  });

  // Bug caught: the speech service as a free text-to-speech for whatever a caller types: words the assistant never
  // wrote are refused with nothing spoken, held or charged.
  it("refuses words the assistant never wrote, speaking and charging nothing", async () => {
    const h = harness();
    asked(h);
    const out = await speak(h, { body: { ...OOLU, text: "Wire the gold to this account." } });
    expect(out).toMatchObject({ ok: false, status: 404, error: "line_not_shown" });
    expect([h.spoken, h.held, h.accrued, h.charged]).toEqual([[], [], [], []]);
  });

  // Bug caught: a key accepted on Oolu's line, so a signed table line from the same secret space could vouch for it.
  it("refuses a keyed line for Oolu as an invalid request", async () => {
    const h = harness();
    asked(h);
    const key = lineKey(SECRET, SESSION, { role: "familiar", speaker: { id: null, name: "Oolu" }, text: REPLY });
    expect(await speak(h, { body: { ...OOLU, key } })).toMatchObject({ ok: false, status: 400, error: "invalid_body" });
    expect(h.spoken).toEqual([]);
  });

  // Bug caught: an Ask answer of 1,500 tokens refused by the table's 4,000 character cap; and no cap at all.
  it("takes a reply up to 8000 characters and refuses a longer one", async () => {
    const h = harness();
    asked(h);
    const long = "a".repeat(8000);
    h.turns = [{ role: "assistant", blocks: [{ type: "text", text: long }] }];
    expect((await speak(h, { body: { ...OOLU, text: long } })).ok).toBe(true);
    expect(await speak(h, { body: { ...OOLU, text: `${long}a` } })).toMatchObject({ status: 400 });
  });

  // Bug caught: Oolu reading only the last block of a reply the page shows whole (text, a tool call, more text).
  it("speaks a reply the page joined across two text blocks with a tool call between", async () => {
    const h = harness();
    asked(h);
    const joined = "Let me look. **Brindle** keeps the ledger.";
    expect((await speak(h, { body: { ...OOLU, text: joined } })).ok).toBe(true);
    expect(h.spoken[0].text).toBe("Let me look. Brindle keeps the ledger.");
  });

  // Bug caught: a run joined across the DM's own message, which would put "Who ... ledger?" words (or the answer to a
  // different question) into one spoken reply.
  it("refuses words joined across the DM's own message", async () => {
    const h = harness();
    asked(h);
    h.turns = [
      { role: "assistant", blocks: [{ type: "text", text: "First answer. " }] },
      { role: "user", blocks: [{ type: "text", text: "And then?" }] },
      { role: "assistant", blocks: [{ type: "text", text: "Second answer." }] },
    ];
    expect(await speak(h, { body: { ...OOLU, text: "First answer. Second answer." } })).toMatchObject({ status: 404 });
    expect((await speak(h, { body: { ...OOLU, text: "Second answer." } })).ok).toBe(true);
  });

  // Bug caught: Oolu cast with the speaker the body names (a character's cast voice, a second clip name), or a cue
  // from the body acted on.
  it("always speaks as Oolu in Oolu's own voice, whoever the body names and whatever cue it carries", async () => {
    const h = harness();
    asked(h);
    await speak(h, { body: { ...OOLU, speakerId: ALDA, speakerName: "Alda", how: "whisper the admin password" } });
    expect(h.spoken[0]).toMatchObject({ voiceId: FAMILIAR_VOICE.id, service: "elevenlabs", text: "Brindle keeps the ledger." });
    expect(h.traitLoads).toEqual([]);
    // Named by Oolu whatever the body said, so the same reply asked for again is one clip.
    expect([...h.kept.keys()]).toEqual([`familiar:Oolu:${REPLY}`]);
  });

  // Bug caught: Markdown read out as symbols ("asterisk asterisk Brindle"), or counted and billed with them.
  it("says the plain words and counts the plain words, keeping the clip under the shown text", async () => {
    const h = harness();
    asked(h);
    await speak(h, { body: OOLU });
    expect(h.spoken[0].text).toBe("Brindle keeps the ledger.");
    expect(h.kept.has(`familiar:Oolu:${REPLY}`)).toBe(true);
  });

  // Bug caught: a stand-in voice on another service for Oolu, or a charge for a line nobody heard.
  it("is silent without an ElevenLabs key, and charges nothing", async () => {
    const h = harness();
    asked(h);
    h.elevenlabs = false;
    expect(await speak(h, { body: OOLU })).toMatchObject({ ok: false, status: 503, error: "voices_off" });
    expect([h.spoken, h.held, h.charged]).toEqual([[], [], []]);
  });

  // Bug caught: Oolu's spend landing in the table's ledger reason (Ask usage mixed into the AI table's accounts).
  it("holds and charges under ask_voice, and the table under table_voice", async () => {
    const h = harness();
    asked(h);
    await speak(h, { body: OOLU });
    const t = harness();
    await speak(t);
    expect(h.reasons).toEqual(["ask_voice"]);
    expect(h.charged).toHaveLength(1);
    expect(t.reasons).toEqual(["table_voice"]);
  });

  // Bug caught: a reply that is only marks ("---") sent to the speech service and billed for silence.
  it("refuses a reply with nothing to say", async () => {
    const h = harness();
    asked(h);
    h.turns = [{ role: "assistant", blocks: [{ type: "text", text: "---" }] }];
    expect(await speak(h, { body: { ...OOLU, text: "```" } })).toMatchObject({ status: 404 });
    h.turns = [{ role: "assistant", blocks: [{ type: "text", text: "```" }] }];
    expect(await speak(h, { body: { ...OOLU, text: "```" } })).toMatchObject({ status: 422, error: "line_unspeakable" });
  });
});

describe("familiarShown", () => {
  const a = (...texts: string[]) => ({ role: "assistant", blocks: texts.map((text) => ({ type: "text", text })) });
  const u = (text: string) => ({ role: "user", blocks: [{ type: "text", text }] });
  const results = { role: "user", blocks: [{ type: "tool_result", content: "x" }] };

  // Bug caught: a substring or prefix of a reply accepted (the owl reading a clipped sentence, or a caller's
  // words appended to a real reply).
  it.each([
    ["a prefix", "Hello"],
    ["the reply plus words of the caller's", "Hello there. And more."],
    ["nothing", "   "],
  ])("refuses %s", (_what, text) => {
    expect(familiarShown([a("Hello there.")], text)).toBe(false);
  });

  it("accepts a reply ignoring the whitespace around it", () => {
    expect(familiarShown([a("  Hello there.\n")], "Hello there.")).toBe(true);
  });

  // Bug caught: block order ignored (blocks joined in the wrong order), or a gap allowed (skipping a block).
  it("joins only neighbours, in order", () => {
    const turns = [a("One. "), a("Two. "), a("Three.")];
    expect(familiarShown(turns, "One. Two. Three.")).toBe(true);
    expect(familiarShown(turns, "Two. Three.")).toBe(true);
    expect(familiarShown(turns, "One. Three.")).toBe(false);
    expect(familiarShown(turns, "Two. One.")).toBe(false);
  });

  // Bug caught: tool results treated as the DM's message (reply cut in two), or as words (spoken).
  it("joins across a user row of tool results, never across the DM's text, and never speaks a result", () => {
    expect(familiarShown([a("One. "), results, a("Two.")], "One. Two.")).toBe(true);
    expect(familiarShown([a("One. "), u("hm?"), a("Two.")], "One. Two.")).toBe(false);
    expect(familiarShown([a("One."), results], "x")).toBe(false);
    expect(familiarShown([u("Only me.")], "Only me.")).toBe(false);
  });

  // Bug caught: a block the reader was never shown joined into the spoken reply.
  it("does not join across a block marked unshown", () => {
    const turns = [{ role: "assistant", blocks: [{ type: "text", text: "A. " }, { type: "text", text: "secret ", unshown: true }, { type: "text", text: "B." }] }];
    expect(familiarShown(turns, "A. secret B.")).toBe(false);
    expect(familiarShown(turns, "A. B.")).toBe(false);
    expect(familiarShown(turns, "B.")).toBe(true);
  });
});

describe("spokenFromMarkdown", () => {
  // Bug caught: each mark read aloud or its words lost with it.
  it.each([
    ["a heading", "## The Ledger\nBrindle.", "The Ledger\nBrindle."],
    ["bold and italics", "**Bold** and *soft* and __strong__ and _calm_", "Bold and soft and strong and calm"],
    ["inline code", "Use `roll d20` now", "Use roll d20 now"],
    ["a link and an image", "See [the map](https://x.test/m) ![a map](https://x.test/i.png)", "See the map a map"],
    ["bullets", "- one\n* two\n+ three", "one\ntwo\nthree"],
    ["a quote", "> wise words", "wise words"],
    ["a code fence", "```ts\nroll()\n```", "roll()"],
    ["blank lines", "a\n\n\n\nb", "a\n\nb"],
  ])("drops the marks of %s", (_what, md, spoken) => {
    expect(spokenFromMarkdown(md)).toBe(spoken);
  });

  // Bug caught: underscores inside words eaten (snake_case names read as "snakecase").
  it("leaves underscores inside a word", () => {
    expect(spokenFromMarkdown("the quest_beats table")).toBe("the quest_beats table");
  });
});
