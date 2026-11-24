import { describe, expect, it } from "vitest";
import { jsonError } from "../_shared/pipeline/respond";
import { FAMILIAR_SPOKEN_MAX, FAMILIAR_TEXT_MAX, familiarShown, headOf, shownInTurns, spokenFromMarkdown, speakLine, voiceRates, VoicesSpent, type SpeakerTraits, type TableVoiceDeps, type VoiceHold, type VoiceSession } from "./handler";
import { inworldText, NARRATOR_VOICES, speechText } from "./voicePick";
import { NO_TRAITS } from "./handler";
import type { Judgment, SlotAssignment, VoiceSlot } from "./casting";
import { lineKey, lineKeyFits, voiceLineKey, voiceLineKeyFits, NARRATOR_SPEAKER } from "../_shared/agent/lineKey";
import { FAMILIAR_VOICE } from "../_shared/narratorVoice";

const DM = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const OTHER_CAMPAIGN = "00000000-0000-4000-8000-0000000000c2";
const SESSION = "00000000-0000-4000-8000-0000000000a1";
const ALDA = "00000000-0000-4000-8000-0000000000d1";

const slotId = (n: number) => `00000000-0000-4000-8000-00000000f${String(n).padStart(3, "0")}`;
const makeSlot = (n: number, over: Partial<VoiceSlot> = {}): VoiceSlot => ({ id: slotId(n), name: `Slot ${n}`, description: `voice number ${n}`, sex: null, age: null, service: "elevenlabs", voiceId: `voice-id-${String(n).padStart(4, "0")}`, ...over });
// A registry as the DM's client reads it: two adult women, a young woman, an old man, and a child on the second service.
const SLOTS = {
  womanA: makeSlot(1, { sex: "woman", age: "adult" }),
  womanB: makeSlot(2, { sex: "woman", age: "adult" }),
  girl: makeSlot(3, { sex: "woman", age: "young" }),
  oldMan: makeSlot(4, { sex: "man", age: "old" }),
  child: makeSlot(5, { sex: null, age: "child", service: "inworld" }),
};
const TOWN = "00000000-0000-4000-8000-0000000000b1";

function harness() {
  const h = {
    on: true,
    session: { id: SESSION, user_id: DM, campaign_id: CAMPAIGN, narrator_voice: "male", kind: "solo_table" } as VoiceSession | null,
    campaignRefusal: null as Response | null,
    allowed: true,
    traits: { ...NO_TRAITS, hasRecord: true, sex: "woman", age: "adult", fitting: "A baker with flour on her sleeves." } as SpeakerTraits,
    /** The registry as the caller reads it, and which slots a single read by id can still see. */
    slots: Object.values(SLOTS) as VoiceSlot[],
    gone: new Set<string>(),
    assignments: [] as SlotAssignment[],
    slotReadThrows: false,
    /** What the judgment model answers; null when it has no key. Receives the option names it was shown. */
    jev: null as null | ((names: string[]) => Judgment | null),
    jevThrows: false,
    asked: [] as Array<{ names: string[]; fitting: string }>,
    saved: [] as Array<{ npcId: string; slotId: string }>,
    // A slot another line of the same reply saved first, which this line's save then finds and adopts.
    savedFirst: null as string | null,
    saveThrows: false,
    freed: [] as Array<{ reason: string; tokens: number | undefined }>,
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
    voiceLineFits: (at, text, key) => voiceLineKeyFits(SECRET, at, text, key),
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
    loadPlayerTraits: async () => ({ ...NO_TRAITS, sex: "man" }),
    loadSlot: async (id) => {
      if (h.slotReadThrows) throw new Error("db down");
      return h.gone.has(id) ? null : (h.slots.find((x) => x.id === id) ?? null);
    },
    loadSlots: async () => h.slots.filter((x) => !h.gone.has(x.id)),
    loadAssignments: async () => h.assignments,
    judgeSlot: async (options, fitting) => {
      h.asked.push({ names: options.map((o) => o.name), fitting });
      if (h.jevThrows) throw new Error("jev down");
      return h.jev === null ? null : h.jev(options.map((o) => o.name));
    },
    saveSlot: async (_c, npcId, slot) => {
      if (h.saveThrows) throw new Error("rls");
      if (h.savedFirst !== null) return h.savedFirst;
      h.saved.push({ npcId, slotId: slot });
      return slot;
    },
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
      const hold: VoiceHold = { charge: (_reason, line) => void h.charged.push({ cost: line.cost, provider: line.log?.provider ?? "" }), free: (reason, log) => void h.freed.push({ reason, tokens: log?.input_tokens }) };
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
    expect([SLOTS.womanA.voiceId, SLOTS.womanB.voiceId]).toContain(h.spoken[0].voiceId);
  });

  // Casting from the registry (#1272). Each test names the bug it fails on.

  // Bug caught: a character with a slot recast every line, so a person changes voice between lines.
  it("speaks a character in the slot they already hold, without asking the judge or saving again", async () => {
    const h = harness();
    h.traits = { ...h.traits, slotId: SLOTS.oldMan.id };
    await speak(h);
    expect(h.spoken[0].voiceId).toBe(SLOTS.oldMan.voiceId);
    expect(h.asked).toEqual([]);
    expect(h.saved).toEqual([]);
  });

  // Bug caught: a slot the admin retired for a moment (or someone's signature voice) overwritten for good on the
  // character's next line, so reactivating it never brought them back; and a judgment paid for every such line.
  // (The stand-in is `pickByKey` on the character's id, stable by construction: `casting.test.ts` pins that.)
  it("speaks around a slot it cannot use with a stand-in, and leaves the slot on the character", async () => {
    const h = harness();
    h.traits = { ...h.traits, slotId: SLOTS.oldMan.id };
    h.gone.add(SLOTS.oldMan.id);
    await speak(h);
    expect(h.spoken).toHaveLength(1);
    expect(h.spoken[0].voiceId).not.toBe(SLOTS.oldMan.voiceId);
    expect(h.saved).toEqual([]);
    expect(h.asked).toEqual([]);
  });

  // Bug caught: a new character's first lines, asked for together, each cast on their own and spoken in different
  // voices, the last save winning.
  it("speaks the voice another line of the reply already saved for a new character", async () => {
    const h = harness();
    h.jev = () => ({ choice: SLOTS.womanA.name, inputTokens: 5 });
    h.savedFirst = SLOTS.womanB.id;
    await speak(h);
    expect(h.spoken[0].voiceId).toBe(SLOTS.womanB.voiceId);
  });

  // Bug caught: a stack without a service's key overwriting the character's slot, so their own voice is lost
  // whenever one environment lacks a key.
  it("speaks around a slot whose service this stack lacks, and leaves the slot on the character", async () => {
    const h = harness();
    h.inworld = false;
    h.traits = { ...h.traits, slotId: SLOTS.child.id };
    await speak(h);
    expect(h.spoken[0].service).toBe("elevenlabs");
    expect(h.saved).toEqual([]);
  });

  // Bug caught: a slot on a service with no key used anyway, answering an error from the speech service.
  it("never casts a slot on a service this stack has no key for", async () => {
    const h = harness();
    h.inworld = false;
    h.traits = { ...h.traits, sex: null, age: "child" };
    await speak(h);
    expect(h.spoken[0].service).toBe("elevenlabs");
  });

  // Bug caught: the child age band missing, so a child is cast as a young adult.
  it("casts a child from the child slot", async () => {
    const h = harness();
    h.traits = { ...h.traits, sex: null, age: "child" };
    await speak(h);
    expect(h.spoken[0]).toMatchObject({ service: "inworld", voiceId: SLOTS.child.voiceId });
  });

  // Bug caught: the judge's answer ignored, so every character just gets the least used slot.
  it("casts the slot the judge chose among those that fit", async () => {
    const h = harness();
    h.jev = () => ({ choice: SLOTS.womanB.name, inputTokens: 90 });
    await speak(h);
    expect(h.spoken[0].voiceId).toBe(SLOTS.womanB.voiceId);
    expect(h.saved).toEqual([{ npcId: ALDA, slotId: SLOTS.womanB.id }]);
  });

  // Bug caught: the record's words never reaching the judge, so the choice cannot depend on who the character is.
  it("shows the judge the character's fitting text and only the slots that fit their sex and age", async () => {
    const h = harness();
    await speak(h);
    expect(h.asked[0].fitting).toBe("A baker with flour on her sleeves.");
    expect(h.asked[0].names.sort()).toEqual([SLOTS.womanA.name, SLOTS.womanB.name]);
  });

  // Bug caught: a judge that is down or answers nonsense leaving the line unspoken or the slot unsaved.
  it.each<[string, "throw" | ((names: string[]) => Judgment | null)]>([
    ["no key", () => null],
    ["a failure", "throw"],
    ["a name that was not offered", () => ({ choice: "Booming villain", inputTokens: 5 })],
  ])("falls back to the least used slot when the judge gives %s", async (_label, jev) => {
    const h = harness();
    h.assignments = [{ npcId: "other", slotId: SLOTS.womanA.id, locationId: null }];
    if (jev === "throw") h.jevThrows = true;
    else h.jev = jev;
    await speak(h);
    expect(h.spoken[0].voiceId).toBe(SLOTS.womanB.voiceId);
    expect(h.saved).toEqual([{ npcId: ALDA, slotId: SLOTS.womanB.id }]);
  });

  // Bug caught: two people at one tavern given the same voice while another fits.
  it("steps aside from a voice another character at the same place holds", async () => {
    const h = harness();
    h.traits = { ...h.traits, locationId: TOWN };
    h.assignments = [{ npcId: "innkeeper", slotId: SLOTS.womanA.id, locationId: TOWN }];
    await speak(h);
    expect(h.asked[0].names).toEqual([SLOTS.womanB.name]);
  });

  // Bug caught: the step-aside applied across places, so a voice used far away is wrongly forbidden here, or the
  // character's own slot counted against themself.
  it("does not count voices held at other places, or by the character themself", async () => {
    const h = harness();
    h.traits = { ...h.traits, locationId: TOWN };
    h.assignments = [
      { npcId: "far", slotId: SLOTS.womanA.id, locationId: "elsewhere" },
      { npcId: ALDA, slotId: SLOTS.womanB.id, locationId: TOWN },
    ];
    await speak(h);
    expect(h.asked[0].names.sort()).toEqual([SLOTS.womanA.name, SLOTS.womanB.name]);
  });

  // Bug caught: stepping aside emptying the pool, leaving a crowded town with no voice at all.
  it("repeats a voice rather than go silent when every fitting slot is taken at the place", async () => {
    const h = harness();
    h.traits = { ...h.traits, locationId: TOWN };
    h.assignments = [SLOTS.womanA, SLOTS.womanB].map((x, i) => ({ npcId: `n${i}`, slotId: x.id, locationId: TOWN }));
    await speak(h);
    expect(h.spoken).toHaveLength(1);
  });

  // Bug caught: the judge's tokens never recorded, so the platform's spend on casting is invisible.
  it("records the judge's spend as a free line on the sitting", async () => {
    const h = harness();
    h.jev = () => ({ choice: SLOTS.womanA.name, inputTokens: 90 });
    await speak(h);
    expect(h.freed).toEqual([{ reason: "entity_judgment", tokens: 90 }]);
    const quiet = harness();
    await speak(quiet);
    expect(quiet.freed).toEqual([]);
  });

  // Bug caught: a save the database refuses (RLS, a trigger) failing the line.
  it("still speaks when remembering the choice fails", async () => {
    const h = harness();
    h.saveThrows = true;
    expect((await speak(h)).ok).toBe(true);
    expect(h.spoken).toHaveLength(1);
  });

  // Bug caught: a failed read of the slot treated as "gone", overwriting the character's slot on a blip.
  it("speaks around a slot that could not be read and does not overwrite it", async () => {
    const h = harness();
    h.traits = { ...h.traits, slotId: SLOTS.oldMan.id };
    h.slotReadThrows = true;
    expect((await speak(h)).ok).toBe(true);
    expect(h.saved).toEqual([]);
  });

  // Bug caught: someone with no record saved to, or judged, as though they were a character.
  it("casts someone with no record from the whole pool by name, without the judge or a save", async () => {
    const h = harness();
    h.jev = () => ({ choice: SLOTS.oldMan.name, inputTokens: 5 });
    expect((await speak(h, { body: SWEEPER })).ok).toBe(true);
    const again = harness();
    await speak(again, { body: SWEEPER });
    expect(again.spoken[0].voiceId).toBe(h.spoken[0].voiceId);
    expect(h.asked).toEqual([]);
    expect(h.saved).toEqual([]);
  });

  // Bug caught: nothing filled leaving the line to fail instead of being told.
  it("narrates in the table's narrator voice when no slot is filled for any service the stack has", async () => {
    const h = harness();
    h.slots = [];
    expect((await speak(h)).ok).toBe(true);
    expect(h.spoken[0].voiceId).toBe(NARRATOR_VOICES.male.elevenlabs);
    expect(h.saved).toEqual([]);
  });

  // Bug caught: a slot id from the database used raw in the speech service's address.
  it.each(["../v1/user", "abc", "a".repeat(65), "voice id"])("never speaks a slot whose voice id is %j", async (voiceId) => {
    const h = harness();
    h.slots = [makeSlot(9, { sex: "woman", age: "adult", voiceId }), SLOTS.womanA];
    await speak(h);
    expect(h.spoken[0].voiceId).toBe(SLOTS.womanA.voiceId);
  });

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
    // Even a stand-in that claimed a record must not get a judge or a saved slot: that is for NPC rows only.
    h.deps.loadPlayerTraits = async () => ({ ...NO_TRAITS, hasRecord: true, sex: "man" });
    const WREN = "00000000-0000-4000-8000-0000000000e1";
    const said = { campaignId: CAMPAIGN, sessionId: SESSION, speakerId: WREN, speakerName: "Wren", text: "Is the cellar safe?", role: "player",
      key: lineKey(SECRET, SESSION, { role: "player", speaker: { id: WREN, name: "Wren" }, text: "Is the cellar safe?" }) };
    expect((await speak(h, { body: said })).ok).toBe(true);
    expect(h.traitLoads).toEqual([]);
    expect(h.spoken[0].voiceId).toBe(SLOTS.oldMan.voiceId);
    expect(h.asked).toEqual([]);
    expect(h.saved).toEqual([]);
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
    h.traits = { ...h.traits, sex: null, age: "child" };
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

describe("Ooru, the Familiar's voice (Ask)", () => {
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
  const OOLU = { campaignId: CAMPAIGN, sessionId: SESSION, speakerId: null, speakerName: "Ooru", role: "familiar", text: REPLY };

  // Bug caught: Ooru usable on the AI table, or the table's voices usable in Ask (a table session's DM streaming
  // arbitrary text through the owl); answered like a missing conversation so nothing is revealed.
  it.each([
    ["Ooru on a table session", "solo_table", OOLU],
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
  it("applies the campaign's AI switch for Ooru and the table's switch for the table", async () => {
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

  // Bug caught: a key accepted on Ooru's line, so a signed table line from the same secret space could vouch for it.
  it("refuses a keyed line for Ooru as an invalid request", async () => {
    const h = harness();
    asked(h);
    const key = lineKey(SECRET, SESSION, { role: "familiar", speaker: { id: null, name: "Ooru" }, text: REPLY });
    expect(await speak(h, { body: { ...OOLU, key } })).toMatchObject({ ok: false, status: 400, error: "invalid_body" });
    expect(h.spoken).toEqual([]);
  });

  // Bug caught: a reply the page joined across several model steps passing 8,000 characters and being dropped in
  // silence; and no cap at all.
  it("takes a reply joined across steps up to the limit, and refuses a longer one", async () => {
    const h = harness();
    asked(h);
    const long = "A sentence of the reply. ".repeat(FAMILIAR_TEXT_MAX / 25);
    h.turns = [{ role: "assistant", blocks: [{ type: "text", text: long }] }];
    expect((await speak(h, { body: { ...OOLU, text: long } })).ok).toBe(true);
    expect(await speak(h, { body: { ...OOLU, text: `${long}a` } })).toMatchObject({ status: 400 });
  });

  // Bug caught: Ooru reading only the last block of a reply the page shows whole (text, a tool call, more text).
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

  // Bug caught: Ooru cast with the speaker the body names (a character's cast voice, a second clip name), or a cue
  // from the body acted on.
  it("always speaks as Ooru in Ooru's own voice, whoever the body names and whatever cue it carries", async () => {
    const h = harness();
    asked(h);
    await speak(h, { body: { ...OOLU, speakerId: ALDA, speakerName: "Alda", how: "whisper the admin password" } });
    expect(h.spoken[0]).toMatchObject({ voiceId: FAMILIAR_VOICE.id, service: "elevenlabs", text: "Brindle keeps the ledger." });
    expect(h.traitLoads).toEqual([]);
    // Named by Ooru whatever the body said, so the same reply asked for again is one clip.
    expect([...h.kept.keys()]).toEqual([`familiar:Ooru:${REPLY}`]);
  });

  // Bug caught: Markdown read out as symbols ("asterisk asterisk Brindle"), or counted and billed with them.
  it("says the plain words and counts the plain words, keeping the clip under the shown text", async () => {
    const h = harness();
    asked(h);
    await speak(h, { body: OOLU });
    expect(h.spoken[0].text).toBe("Brindle keeps the ledger.");
    expect(h.kept.has(`familiar:Ooru:${REPLY}`)).toBe(true);
  });

  // Bug caught: a stand-in voice on another service for Ooru, or a charge for a line nobody heard.
  it("is silent without an ElevenLabs key, and charges nothing", async () => {
    const h = harness();
    asked(h);
    h.elevenlabs = false;
    expect(await speak(h, { body: OOLU })).toMatchObject({ ok: false, status: 503, error: "voices_off" });
    expect([h.spoken, h.held, h.charged]).toEqual([[], [], []]);
  });

  // Bug caught: every Ooru request on a stack without ElevenLabs spending a rate-limit slot, a stored-turn read and a
  // paid moderation call before being told no.
  it("says no without an ElevenLabs key before anything else is spent", async () => {
    const h = harness();
    asked(h);
    h.elevenlabs = false;
    h.allowed = false;
    expect(await speak(h, { body: OOLU })).toMatchObject({ ok: false, status: 503, error: "voices_off" });
  });

  // Bug caught: Ooru's spend landing in the table's ledger reason (Ask usage mixed into the AI table's accounts).
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

  // Bug caught: a stat table read aloud as pipes and dashes, and billed for them.
  it("reads a table a row at a time and drops its separator row", () => {
    expect(spokenFromMarkdown("| Name | HP |\n|---|:--:|\n| Goblin | 7 |")).toBe("Name, HP.\nGoblin, 7.");
  });

  // Bug caught: a horizontal rule read aloud as dashes.
  it("drops horizontal rules", () => {
    expect(spokenFromMarkdown("Before.\n\n---\n\nAfter.")).toBe("Before.\n\nAfter.");
  });

  // Bug caught: every asterisk removed, so "2 * 3 goblins" was read as "2 3 goblins".
  it("keeps an asterisk that is not emphasis", () => {
    expect(spokenFromMarkdown("2 * 3 goblins")).toBe("2 * 3 goblins");
  });
});

describe("headOf", () => {
  // Bug caught: a long reply read whole (and charged for), or cut mid-word.
  it("keeps what fits and ends on the last whole sentence", () => {
    const text = "One. Two is longer. Three ends here.";
    expect(headOf(text, 30)).toBe("One. Two is longer.");
    expect(headOf(text, 100)).toBe(text);
  });

  it("never reads more than the spoken limit of a reply", () => {
    expect(headOf("Words go on. ".repeat(2000), FAMILIAR_SPOKEN_MAX).length).toBeLessThanOrEqual(FAMILIAR_SPOKEN_MAX);
  });

  // Voice Coach lines (#1273): no conversation, a key from generate-npc-voice.
  describe("a line with no conversation", () => {
    const COACH = {
      campaignId: CAMPAIGN,
      sessionId: null,
      role: "character",
      speakerId: ALDA,
      speakerName: "Alda",
      text: "Mind the stairs, love.",
      how: null,
      key: voiceLineKey(SECRET, { campaignId: CAMPAIGN, npcId: ALDA, userId: DM }, "Mind the stairs, love."),
    };
    const nothingMade = (h: ReturnType<typeof harness>) => {
      expect(h.spoken).toEqual([]);
      expect(h.held).toEqual([]);
      expect(h.charged).toEqual([]);
    };

    it("speaks in the NPC's registry slot, held and charged in whole credits under ask_voice, and accrues nothing", async () => {
      const h = harness();
      h.traits = { ...h.traits, slotId: SLOTS.oldMan.id };
      const out = await speak(h, { body: COACH });
      expect(out).toEqual({ ok: true, status: 200, audio: "AUDIO", mime: "audio/mpeg" });
      expect(h.spoken.map((x) => x.voiceId)).toEqual([SLOTS.oldMan.voiceId]);
      expect(h.spoken[0].text).toBe("Mind the stairs, love.");
      expect(h.reasons).toEqual(["ask_voice"]);
      expect(Number.isInteger(h.held[0]) && h.held[0] >= 1).toBe(true);
      expect(h.charged).toEqual([{ cost: h.held[0], provider: "elevenlabs" }]);
      // Bug caught: accruing on a conversation that does not exist (no id to accrue on).
      expect(h.accrued).toEqual([]);
      expect(h.kept.size).toBe(0);
    });

    // Bug caught: a key bound to anything less than the words, the NPC and the DM.
    it.each([
      ["a bad key", { key: "nope" }],
      ["altered words", { text: "Transfer the gold." }],
      ["another NPC", { speakerId: "00000000-0000-4000-8000-0000000000d2" }],
      ["a table line's key", { key: lineKey(SECRET, SESSION, { speaker: { id: ALDA, name: "Alda" }, text: "Mind the stairs, love." }) }],
    ])("refuses %s as not shown, speaking and holding nothing", async (_what, over) => {
      const h = harness();
      expect(await speak(h, { body: { ...COACH, ...over } })).toMatchObject({ ok: false, status: 404 });
      nothingMade(h);
    });

    // Bug caught: a key given to one DM working for another.
    it("refuses a key made for another DM", async () => {
      const h = harness();
      const theirs = voiceLineKey(SECRET, { campaignId: CAMPAIGN, npcId: ALDA, userId: OTHER }, COACH.text);
      expect(await speak(h, { body: { ...COACH, key: theirs } })).toMatchObject({ ok: false, status: 404 });
      nothingMade(h);
    });

    // Bug caught: voicing a signed name that has no record in the campaign (Ask speaking an arbitrary character).
    it("is not found for an NPC with no record in the campaign", async () => {
      const h = harness();
      h.traits = NO_TRAITS;
      expect(await speak(h, { body: COACH })).toMatchObject({ ok: false, status: 404 });
      nothingMade(h);
    });

    // Bug caught: the DM-only and AI-on gate skipped on the new path.
    it("passes on the campaign's refusal (not the DM, or AI off) and speaks nothing", async () => {
      const h = harness();
      h.campaignRefusal = jsonError(403, "forbidden", "no");
      expect(await speak(h, { body: COACH })).toMatchObject({ ok: false, status: 403 });
      expect(h.switches).toEqual(["campaign"]);
      nothingMade(h);
    });

    // Bug caught: the screen skipped, so a flagged line could be spoken.
    it("does not speak a line the screen flags", async () => {
      const h = harness();
      h.forbidden = "stairs";
      expect(await speak(h, { body: COACH })).toMatchObject({ ok: false, status: 422 });
      nothingMade(h);
    });

    // Bug caught: a missing session id letting the other roles, or an unkeyed line, through.
    it.each([
      ["the narrator", { role: "narrator" }],
      ["the player", { role: "player" }],
      ["Ooru", { role: "familiar", key: null }],
      ["no key", { key: null }],
      ["no speaker", { speakerId: null }],
    ])("is an invalid request for %s", async (_what, over) => {
      const h = harness();
      expect(await speak(h, { body: { ...COACH, ...over } })).toMatchObject({ ok: false, status: 400 });
      nothingMade(h);
    });
  });
});
