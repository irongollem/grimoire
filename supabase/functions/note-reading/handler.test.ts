import { describe, expect, it } from "vitest";
import { readingHash, readingKey } from "../_shared/noteReading";
import { READING_MESSAGES, readNote, type NoteReadingDeps, type ReadingNote } from "./handler";

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
    aiEnabled: true as boolean | null,
    inworld: true,
    flagged: false,
    canPay: true,
    synthThrows: false,
    store: new Map<string, Uint8Array>(),
    spoken: [] as Array<{ service: string; voiceId: string; text: string }>,
    charged: [] as number[],
    released: [] as string[][],
    caller: DM,
    deps: undefined as unknown as NoteReadingDeps,
  };
  h.deps = {
    voiceOn: () => h.on,
    loadNote: async () => (h.note === null ? null : { ...h.note }),
    loadCampaign: async () => ({ id: CAMPAIGN, user_id: DM, ai_enabled: h.aiEnabled }),
    isDm: async (_c, userId) => userId === DM,
    mayRead: async () => h.readers.has(h.caller),
    playerText: async () => h.text,
    hasService: (service) => service === "elevenlabs" || h.inworld,
    // 10 USD a million characters; a credit worth 0.0066 USD at a margin of 2.
    loadRate: async () => ({ usdPerMillionChars: 10, calibration: { usdPerCredit: 0.0066, margin: 2 } }),
    isFlagged: async () => h.flagged,
    reserve: async () => (h.canPay ? { ok: true, ids: ["r1"] } : { ok: false, status: 402, error: "insufficient_credits" }),
    release: async (ids) => {
      h.released.push(ids);
    },
    charge: async (_userId, credits) => {
      h.charged.push(credits);
    },
    synthesize: async (voice, text) => {
      if (h.synthThrows) throw new Error("speech down");
      h.spoken.push({ service: voice.service, voiceId: voice.id, text });
      return new TextEncoder().encode(`[${text.length}]`);
    },
    loadAudio: async (key) => h.store.get(key) ?? null,
    keepAudio: async (key, audio) => {
      h.store.set(key, audio);
    },
    setReading: async (_noteId, reading) => {
      if (h.note) h.note = { ...h.note, reading_hash: reading.hash, reading_voice: reading.voice };
    },
  };
  return h;
}

const ask = (h: ReturnType<typeof harness>, action: string, who: string = DM, extra: Record<string, unknown> = {}) => {
  h.caller = who;
  return readNote({ userId: who, body: { action, noteId: NOTE, ...extra }, deps: h.deps });
};

describe("making a reading", () => {
  // Bug caught: a reading told as made while nothing is kept or put on the note (the players then find nothing to
  // hear), or one that is never charged.
  it("speaks the note in the Narrator's voice, keeps it, says so on the note and charges once", async () => {
    const h = harness();
    const made = await ask(h, "make", DM, { voice: "female", telling: "plain" });
    expect(made).toMatchObject({ ok: true, kind: "made" });
    expect(h.spoken).toHaveLength(1);
    expect(h.spoken[0].service).toBe("inworld");
    expect(h.spoken[0].text).toBe("The party reached Sugarwell.\nThey went at dusk.");
    expect(h.note?.reading_voice).toBe("female");
    expect(h.store.size).toBe(1);
    expect(h.charged).toHaveLength(1);
    expect(h.released).toEqual([["r1"]]);
  });

  // The players hear a reading: a Dungeon Master's secret passage must never be in it. Bug caught: the reading made
  // from the note as the DM stores it instead of as a player may read it.
  it("speaks only what a player may read of the note", async () => {
    const h = harness({ text: doc("The mayor smiled.") });
    await ask(h, "make", DM, { telling: "plain" });
    expect(h.spoken.map((s) => s.text).join(" ")).toBe("The mayor smiled.");
    const unchecked = harness({ text: null });
    expect(await ask(unchecked, "make")).toEqual({ ok: false, status: 422, error: READING_MESSAGES.unchecked });
    expect(unchecked.spoken).toEqual([]);
  });

  // Bug caught: a player who can read the note having it read aloud (a recording of the DM's note made on a
  // player's say), or a stranger learning that a note exists from the kind of refusal they get.
  it("is the Dungeon Master's alone: a player is refused, and a stranger is told the note is not there", async () => {
    const h = harness();
    expect(await ask(h, "make", PLAYER)).toEqual({ ok: false, status: 403, error: READING_MESSAGES.notDm });
    expect(await ask(h, "make", STRANGER)).toEqual({ ok: false, status: 404, error: READING_MESSAGES.notFound });
    expect(await ask(h, "estimate", PLAYER)).toMatchObject({ ok: false, status: 403 });
    expect(h.spoken).toEqual([]);
    expect(h.charged).toEqual([]);
  });

  // Bug caught: a reading that failed halfway still charged, or its reservation never given back.
  it("charges nothing and gives the reservation back when the speech fails", async () => {
    const h = harness();
    h.synthThrows = true;
    await expect(ask(h, "make")).rejects.toThrow("speech down");
    expect(h.charged).toEqual([]);
    expect(h.released).toEqual([["r1"]]);
    expect(h.note?.reading_hash).toBeNull();
  });

  // Bug caught: the same text made and paid for twice (a second click, or a retry after the note could not be
  // written); and nothing spoken when the account cannot pay or the text is flagged.
  it("makes and charges the same reading only once, and nothing when it cannot be paid or may not be sent", async () => {
    const h = harness();
    await ask(h, "make");
    const again = await ask(h, "make");
    expect(again).toMatchObject({ ok: true, kind: "made", credits: 0 });
    expect(h.spoken).toHaveLength(1);
    expect(h.charged).toHaveLength(1);
    const broke = harness();
    broke.canPay = false;
    expect(await ask(broke, "make")).toEqual({ ok: false, status: 402, error: "insufficient_credits" });
    const flagged = harness();
    flagged.flagged = true;
    expect(await ask(flagged, "make")).toEqual({ ok: false, status: 422, error: READING_MESSAGES.flagged });
    expect([...broke.spoken, ...flagged.spoken]).toEqual([]);
  });

  // Bug caught: an empty note "read" for a credit, a note of a whole book started and cut off, or a campaign
  // with AI switched off still sending its notes to a speech service.
  it("refuses an empty note, one too long to read in one go, and a campaign with AI off", async () => {
    expect(await ask(harness({ text: doc("") }), "make")).toMatchObject({ ok: false, status: 422, error: READING_MESSAGES.empty });
    expect(await ask(harness({ text: doc("word ".repeat(4000)) }), "make")).toMatchObject({ ok: false, status: 422, error: READING_MESSAGES.tooLong });
    const off = harness();
    off.aiEnabled = false;
    expect(await ask(off, "make")).toEqual({ ok: false, status: 403, error: READING_MESSAGES.aiOff });
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
    if (!a.ok || a.kind !== "estimate" || !b.ok || b.kind !== "estimate") throw new Error("no estimate");
    expect(a.chars).toBe(47);
    expect(b.chars).toBe(47);
    // The harness prices both services alike, so the difference is the cues alone; a long note shows it.
    const long = (telling: string) => ask(harness({ text: doc(...Array.from({ length: 30 }, () => "word ".repeat(100))) }), "estimate", DM, { telling });
    const [x, y] = await Promise.all([long("storyteller"), long("plain")]);
    if (!x.ok || x.kind !== "estimate" || !y.ok || y.kind !== "estimate") throw new Error("no estimate");
    expect(x.credits).toBeGreaterThan(y.credits);
  });

  // Bug caught: the two tellings of one note sharing one recording, so asking for the other plays the first.
  it("keeps the two tellings of one note as two recordings", async () => {
    const h = harness();
    await ask(h, "make");
    await ask(h, "make", DM, { telling: "plain" });
    expect(h.store.size).toBe(2);
    expect(h.charged).toHaveLength(2);
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
    expect(await ask(h, "estimate")).toEqual({ ok: true, kind: "estimate", chars: 47, credits: 1, has: false });
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
    expect(heard).toMatchObject({ ok: true, kind: "audio" });
    expect(await ask(h, "listen", STRANGER)).toEqual({ ok: false, status: 404, error: READING_MESSAGES.notFound });
    expect(h.charged).toHaveLength(1);
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
    expect(await ask(h, "listen")).toEqual({ ok: false, status: 404, error: READING_MESSAGES.noReading });
  });

  it("says a note that was never read aloud has no reading", async () => {
    expect(await ask(harness(), "listen", PLAYER)).toEqual({ ok: false, status: 404, error: READING_MESSAGES.noReading });
  });
});
