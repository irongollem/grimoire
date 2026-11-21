import { describe, expect, it } from "vitest";
import { readingHash, readingKey } from "../_shared/noteReading";
import { jsonError } from "../_shared/pipeline/respond";
import { READING_MESSAGES, readNote, type NoteReadingDeps, type ReadingHold, type ReadingNote } from "./handler";

const NOTE = "00000000-0000-4000-8000-0000000000a1";
const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const DM = "dm";
const PLAYER = "player";
const STRANGER = "stranger";
const doc = (...paragraphs: string[]) => JSON.stringify({ type: "doc", content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })) });

function harness(over: Partial<{ text: string | null; note: ReadingNote | null }> = {}) {
  const h = {
    on: true,
    note: (over.note === undefined ? { id: NOTE, campaign_id: CAMPAIGN, reading_hash: null, reading_voice: null } : over.note) as ReadingNote | null,
    /** What a player may read of the note: the secret passages are already gone from it. */
    text: over.text === undefined ? doc("The party reached Sugarwell.", "They went at dusk.") : over.text,
    readers: new Set([DM, PLAYER]),
    campaignRefusal: null as Response | null,
    withinRate: true,
    inworld: true,
    flagged: false,
    refuseHold: null as Response | null,
    holds: [] as number[],
    synthThrows: false,
    store: new Map<string, Uint8Array<ArrayBuffer>>(),
    spoken: [] as Array<{ service: string; voiceId: string; text: string }>,
    charged: [] as number[],
    caller: DM,
    campaignThere: true,
    sweeps: 0,
    deps: undefined as unknown as NoteReadingDeps,
  };
  h.deps = {
    voiceOn: async () => h.on,
    loadNote: async () => (h.note === null ? null : { ...h.note }),
    // DM-only and AI-on are `loadAiCampaign`'s rules (its own test); here a non-DM is refused and a refusal passes through.
    loadCampaign: async (_id, userId) => {
      if (h.campaignRefusal) return { ok: false, response: h.campaignRefusal };
      return userId === DM ? { ok: true, campaign: { id: CAMPAIGN, user_id: DM, ai_enabled: true } } : { ok: false, response: jsonError(403, "forbidden", READING_MESSAGES.notDm) };
    },
    withinRate: async () => h.withinRate,
    mayRead: async () => h.readers.has(h.caller),
    playerText: async () => h.text,
    hasService: (service) => service === "elevenlabs" || h.inworld,
    // 10 USD a million characters; a credit worth 0.0066 USD at a margin of 2.
    loadRate: async () => ({ usdPerMillionChars: 10, calibration: { usdPerCredit: 0.0066, margin: 2 } }),
    isFlagged: async () => h.flagged,
    modelOf: () => "model-1",
    // The release-once and charge-after-release rules are `withCreditHold`'s (its own test); this records the hold
    // and the charge, and answers a refused hold the way the real one does.
    withHold: async (_userId, credits, work) => {
      h.holds.push(credits);
      if (h.refuseHold) return h.refuseHold;
      const hold: ReadingHold = { charge: (_reason, line) => void h.charged.push(line.cost), free: () => {} };
      return work(hold);
    },
    synthesize: async (voice, text) => {
      if (h.synthThrows) throw new Error("speech down");
      h.spoken.push({ service: voice.service, voiceId: voice.id, text });
      return new TextEncoder().encode(`[${text.length}]`);
    },
    loadAudio: async (key) => h.store.get(key) ?? null,
    keepAudio: async (key, audio) => {
      h.store.set(key, new Uint8Array(audio)); // a copy, as the round trip through the bucket gives back
    },
    campaignExists: async () => h.campaignThere,
    // As the real one: everything in the store that the note does not refer to now goes.
    sweep: async () => {
      h.sweeps += 1;
      let removed = 0;
      for (const key of h.store.keys()) {
        if (h.note === null || h.note.reading_hash === null || !key.endsWith(`/${h.note.reading_hash}.mp3`)) {
          h.store.delete(key);
          removed += 1;
        }
      }
      return removed;
    },
    setReading: async (_noteId, reading) => {
      if (h.note) h.note = { ...h.note, reading_hash: reading.hash, reading_voice: reading.voice };
    },
  };
  return h;
}

/** What the function answers, as the tests read it: the JSON shapes in handler.ts, or the audio of a `listen`. */
interface Answer {
  status: number;
  audio?: boolean;
  error?: string;
  message?: string;
  chars?: number;
  credits?: number;
  has?: boolean;
  made?: boolean;
  removed?: number;
}

const answered = async (response: Response): Promise<Answer> =>
  response.headers.get("Content-Type") === "audio/mpeg"
    ? { status: response.status, audio: true }
    : { status: response.status, ...((await response.json()) as Omit<Answer, "status">) };

const ask = async (h: ReturnType<typeof harness>, action: string, who: string = DM, extra: Record<string, unknown> = {}) => {
  h.caller = who;
  return answered(await readNote({ userId: who, body: { action, noteId: NOTE, ...extra }, deps: h.deps }));
};

describe("making a reading", () => {
  // Bug caught: a reading told as made while nothing is kept or put on the note (the players then find nothing to
  // hear), or one that is never charged.
  it("speaks the note in the Narrator's voice, keeps it, says so on the note and charges once", async () => {
    const h = harness();
    const made = await ask(h, "make", DM, { voice: "female", telling: "plain" });
    expect(made).toMatchObject({ status: 200, made: true });
    expect(h.spoken).toHaveLength(1);
    expect(h.spoken[0].service).toBe("inworld");
    expect(h.spoken[0].text).toBe("The party reached Sugarwell.\nThey went at dusk.");
    expect(h.note?.reading_voice).toBe("female");
    expect(h.store.size).toBe(1);
    expect(h.charged).toHaveLength(1);
  });

  // The players hear a reading: a Dungeon Master's secret passage must never be in it. Bug caught: the reading made
  // from the note as the DM stores it instead of as a player may read it.
  it("speaks only what a player may read of the note", async () => {
    const h = harness({ text: doc("The mayor smiled.") });
    await ask(h, "make", DM, { telling: "plain" });
    expect(h.spoken.map((s) => s.text).join(" ")).toBe("The mayor smiled.");
    const unchecked = harness({ text: null });
    expect(await ask(unchecked, "make")).toMatchObject({ status: 422, error: "note_unchecked" });
    expect(unchecked.spoken).toEqual([]);
  });

  // Bug caught: a player who can read the note having it read aloud (a recording of the DM's note made on a
  // player's say), or a stranger learning that a note exists from the kind of refusal they get.
  it("is the Dungeon Master's alone: a player is refused, and a stranger is told the note is not there", async () => {
    const h = harness();
    expect(await ask(h, "make", PLAYER)).toMatchObject({ status: 403, error: "forbidden" });
    expect(await ask(h, "make", STRANGER)).toMatchObject({ status: 404, error: "note_not_found" });
    expect(await ask(h, "estimate", PLAYER)).toMatchObject({ status: 403 });
    expect(h.spoken).toEqual([]);
    expect(h.charged).toEqual([]);
  });

  // Bug caught: a reading that failed halfway still charged, or left on the note as made.
  it("charges nothing and keeps nothing when the speech fails", async () => {
    const h = harness();
    h.synthThrows = true;
    await expect(ask(h, "make")).rejects.toThrow("speech down");
    expect(h.charged).toEqual([]);
    expect(h.note?.reading_hash).toBeNull();
    expect(h.store.size).toBe(0);
  });

  // Bug caught: the same text made and paid for twice (a second click, or a retry after the note could not be
  // written); and nothing spoken when the account cannot pay or the text is flagged.
  it("makes and charges the same reading only once, and nothing when it cannot be paid or may not be sent", async () => {
    const h = harness();
    await ask(h, "make");
    const again = await ask(h, "make");
    expect(again).toMatchObject({ status: 200, made: true, credits: 0 });
    expect(h.spoken).toHaveLength(1);
    expect(h.charged).toHaveLength(1);
    const broke = harness();
    broke.refuseHold = jsonError(402, "insufficient_credits");
    expect(await ask(broke, "make")).toMatchObject({ status: 402, error: "insufficient_credits" });
    const flagged = harness();
    flagged.flagged = true;
    expect(await ask(flagged, "make")).toMatchObject({ status: 422, error: "note_flagged" });
    expect([...broke.spoken, ...flagged.spoken]).toEqual([]);
  });

  // Bug caught: an empty note "read" for a credit, a note of a whole book started and cut off, or a campaign
  // with AI switched off still sending its notes to a speech service.
  it("refuses an empty note, one too long to read in one go, and a campaign with AI off", async () => {
    expect(await ask(harness({ text: doc("") }), "make")).toMatchObject({ status: 422, error: "note_empty" });
    expect(await ask(harness({ text: doc("word ".repeat(4000)) }), "make")).toMatchObject({ status: 422, error: "note_too_long" });
    const off = harness();
    off.campaignRefusal = jsonError(403, "ai_disabled", "AI is turned off for this campaign.");
    expect(await ask(off, "make")).toMatchObject({ status: 403, error: "ai_disabled" });
    expect(off.spoken).toEqual([]);
  });

  // Bug caught: making or asking for a reading unthrottled (the audit, #1234): a loop of estimates or makes reached the
  // moderation call and the speech service as often as the caller liked. Listening stays free.
  it("is rate limited for asking and making, before anything is sent anywhere, but not for listening", async () => {
    const h = harness();
    h.withinRate = false;
    expect(await ask(h, "make")).toMatchObject({ status: 429, error: "rate_limited" });
    expect(await ask(h, "estimate")).toMatchObject({ status: 429 });
    expect(h.spoken).toEqual([]);
    expect(h.holds).toEqual([]);
    h.withinRate = true;
    await ask(h, "make");
    h.withinRate = false;
    expect(await ask(h, "listen", PLAYER)).toMatchObject({ status: 200, audio: true });
  });

  // Bug caught: a long note sent as one piece past the service's limit; the pieces joined out of order.
  it("speaks a long note in pieces and joins them in order", async () => {
    const paragraphs = Array.from({ length: 8 }, (_, i) => `Part ${i}. ${"word ".repeat(120)}`.trim());
    const h = harness({ text: doc(...paragraphs) });
    await ask(h, "make");
    expect(h.spoken.length).toBeGreaterThan(2);
    const kept = new TextDecoder().decode([...h.store.values()][0]);
    expect(kept).toBe(h.spoken.map((s) => `[${s.text.length}]`).join(""));
    expect(h.spoken.map((s) => s.text).join("\n")).toContain("Part 0.");
  });
});

describe("how it is told", () => {
  // The maintainer's ear, 19 Nov 2026: ElevenLabs turbo with cues "significantly better". Bug caught: the default
  // telling sent to the plain service, or sent with no cue (the flat reading he found "not really deep").
  it("tells a note with feeling by default: on ElevenLabs, with a cue on every piece", async () => {
    const h = harness();
    await ask(h, "make");
    expect(h.spoken[0].service).toBe("elevenlabs");
    expect(h.spoken[0].text.startsWith("[an old storyteller")).toBe(true);
    expect(h.spoken[0].text).toContain("They went at dusk.");
  });

  // Bug caught: the cues spoken for free (the service bills them), or the cheaper telling priced like the dearer.
  it("charges for the cues that are sent, and less for the plain telling", async () => {
    const felt = harness();
    const plain = harness();
    const a = await ask(felt, "estimate");
    const b = await ask(plain, "estimate", DM, { telling: "plain" });
    expect(a.chars).toBe(47);
    expect(b.chars).toBe(47);
    // The harness prices both services alike, so the difference is the cues alone; a long note shows it.
    const long = (telling: string) => ask(harness({ text: doc(...Array.from({ length: 30 }, () => "word ".repeat(100))) }), "estimate", DM, { telling });
    const [x, y] = await Promise.all([long("storyteller"), long("plain")]);
    if (typeof x.credits !== "number" || typeof y.credits !== "number") throw new Error("an estimate answered no credits");
    expect(x.credits).toBeGreaterThan(y.credits);
  });

  // The maintainer: "If no one is referencing it anymore delete it." Bug caught: the two tellings of one note
  // sharing one recording (asking for the other plays the first); or the replaced telling left in the store for
  // good, with nothing pointing at it.
  it("makes another telling its own recording, and removes the one the note no longer refers to", async () => {
    const h = harness();
    await ask(h, "make");
    const first = [...h.store.keys()][0];
    await ask(h, "make", DM, { telling: "plain" });
    expect(h.charged).toHaveLength(2);
    expect(h.store.size).toBe(1);
    expect([...h.store.keys()][0]).not.toBe(first);
  });

  // Bug caught: a stack with only one speech service unable to read anything, or sending cues to the service that
  // reads them out loud.
  it("falls back to the service the stack has, and sends no cues to Inworld", async () => {
    const h = harness();
    h.deps.hasService = (service) => service === "inworld";
    await ask(h, "make");
    expect(h.spoken[0]).toMatchObject({ service: "inworld", text: "The party reached Sugarwell.\nThey went at dusk." });
  });
});

describe("the cost, asked first", () => {
  // 28 + 1 + 18 = 47 characters at 10 USD a million, doubled, over 0.0066 USD a credit, is far under one credit.
  // Bug caught: a short note quoted as free (and then charged nothing), or the estimate making and charging.
  it("says what a reading would cost, at least one credit, and makes nothing", async () => {
    const h = harness();
    expect(await ask(h, "estimate")).toEqual({ status: 200, chars: 47, credits: 1, has: false });
    expect(h.spoken).toEqual([]);
    expect(h.charged).toEqual([]);
  });

  // Bug caught: a note edited since it was read still shown as read (the players hear the old text as the new).
  it("says whether this very text in this voice has been read already", async () => {
    const h = harness();
    await ask(h, "make");
    expect(await ask(h, "estimate")).toMatchObject({ has: true });
    h.text = doc("The party reached Sugarwell.", "They went at dawn.");
    expect(await ask(h, "estimate")).toMatchObject({ has: false });
  });
});

describe("listening", () => {
  // The maintainer, 19 Nov 2026: "when a note is playable ... then those need to be listenable by the players".
  // Bug caught: only the DM able to hear it; or anyone at all, whether or not the note is shared with them.
  it("lets anyone who may read the note hear it, at no cost, and nobody else", async () => {
    const h = harness();
    await ask(h, "make");
    const heard = await ask(h, "listen", PLAYER);
    expect(heard).toMatchObject({ status: 200, audio: true });
    expect(await ask(h, "listen", STRANGER)).toMatchObject({ status: 404, error: "note_not_found" });
    expect(h.charged).toHaveLength(1);
  });

  // Bug caught: the voices' check moved above the listen branch, so a player pressing play waits on (and fails with)
  // a read of the speech keys that listening never needs, or hears nothing once the admin clears the key.
  it("plays a kept recording without asking whether voices are on", async () => {
    const h = harness();
    await ask(h, "make");
    h.deps.voiceOn = () => Promise.reject(new Error("the speech keys were read"));
    expect(await ask(h, "listen", PLAYER)).toMatchObject({ status: 200, audio: true });
  });

  // Bug caught: the recording read from wherever the row says, so a forged value on a note serves another note's
  // (or a sitting's) audio. The key is derived; a hash that names nothing finds nothing.
  it("finds the recording by a key it derives itself, so a forged hash on the note finds nothing", async () => {
    const h = harness();
    await ask(h, "make");
    const real = await readingHash("The party reached Sugarwell.\nThey went at dusk.", "male:elevenlabs:cued");
    expect([...h.store.keys()]).toEqual([readingKey({ campaignId: CAMPAIGN, noteId: NOTE, hash: real })]);
    h.store.set("some/other/campaign/secret.mp3", new Uint8Array([9]));
    if (h.note) h.note = { ...h.note, reading_hash: "../../some/other/campaign/secret" };
    expect(await ask(h, "listen")).toMatchObject({ status: 404, error: "no_reading" });
  });

  it("says a note that was never read aloud has no reading", async () => {
    expect(await ask(harness(), "listen", PLAYER)).toMatchObject({ status: 404, error: "no_reading" });
  });
});

describe("tidying up", () => {
  const sweepAs = (h: ReturnType<typeof harness>, who: string) => {
    h.caller = who;
    return readNote({ userId: who, body: { action: "sweep", campaignId: CAMPAIGN }, deps: h.deps }).then(answered);
  };

  // Bug caught: a deleted note's recording left in the store for good; or a sweep taking away the recording a
  // note still refers to.
  it("removes the recording of a note that is gone and keeps the one a note refers to", async () => {
    const h = harness();
    await ask(h, "make");
    expect(await sweepAs(h, DM)).toEqual({ status: 200, removed: 0 });
    expect(h.store.size).toBe(1);
    h.note = null;
    expect(await sweepAs(h, DM)).toEqual({ status: 200, removed: 1 });
    expect(h.store.size).toBe(0);
  });

  // Bug caught: a player (or a stranger) made able to probe a campaign through the sweep; and a deleted campaign's
  // recordings unreachable for good because nobody is its DM any more.
  it("is the DM's for a campaign that exists, and anyone's once the campaign is gone", async () => {
    const h = harness();
    expect(await sweepAs(h, PLAYER)).toMatchObject({ status: 403 });
    expect(h.sweeps).toBe(0);
    h.campaignThere = false;
    expect(await sweepAs(h, STRANGER)).toMatchObject({ status: 200 });
  });
});
