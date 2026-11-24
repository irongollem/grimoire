import { describe, expect, it } from "vitest";
import { base64FromBytes } from "../_shared/base64";
import { handleStudio, NEUTRAL_SAMPLE_LINE, ServiceError, type SpeechService, type SpeechVoiceRow, type StudioDeps } from "./handler";

const ADMIN = "00000000-0000-4000-8000-000000000001";
const SLOT = "00000000-0000-4000-8000-0000000000a1";
const NEW_ID = "00000000-0000-4000-8000-0000000000b1";

const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3]);
const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 9, 9, 9]);
const LONG_TEXT = "x".repeat(120);

const row = (over: Partial<SpeechVoiceRow> = {}): SpeechVoiceRow => ({
  id: SLOT, name: "Shady guy", description: "A man who sells things.", design_prompt: "A low, rough voice, selling something shady.", preview_text: null,
  sex: "man", age: "adult", kind: "cast", origin: "designed", service: "elevenlabs", voice_id: "oldvoice1234", library_voice_id: null, sample_key: null, active: true,
  created_at: "", updated_at: "", ...over,
});

const fields = { name: "New voice", description: "Someone new.", design_prompt: null, preview_text: null, sex: null, age: null, kind: "cast" };

function harness(rows: SpeechVoiceRow[] = [row()]) {
  const h = {
    rows,
    /** The slots the caller's own row level security lets them read. */
    visible: new Set(rows.map((r) => r.id)),
    keys: { elevenlabs: true, inworld: true } as Record<SpeechService, boolean>,
    calls: [] as string[],
    designArgs: [] as Array<[string, string, string]>,
    store: new Map<string, Uint8Array>(),
    withStore: true,
    allowed: true,
    synthBytes: MP3,
    // The service's own free preview of a voice; null for a voice that has none (Inworld's).
    previewBytes: null as Uint8Array | null,
    previewThrows: false,
    serviceDown: false,
    serviceStatus: 500,
    // What ElevenLabs answers for a looked-up ID; null: it does not know it.
    lookedUp: null as null | { voiceId: string; category: string; publicOwnerId: string | null },
    insertThrows: false,
    reported: [] as unknown[],
    libraryResults: [] as Array<{ publicOwnerId: string; voiceId: string }>,
    searchArgs: [] as unknown[],
    deps: undefined as unknown as StudioDeps,
  };
  h.deps = {
    newId: () => NEW_ID,
    report: (e) => void h.reported.push(e),
    rateLimit: async () => h.allowed,
    store: undefined as never,
    db: {
      listAll: async () => h.rows,
      loadAsAdmin: async (id) => h.rows.find((r) => r.id === id) ?? null,
      loadAsCaller: async (id) => (h.visible.has(id) ? (h.rows.find((r) => r.id === id) ?? null) : null),
      insert: async (r) => {
        if (h.insertThrows) throw new Error("db down");
        const made = { ...row(), ...r } as SpeechVoiceRow;
        h.rows.push(made);
        return made;
      },
      update: async (id, patch) => {
        const i = h.rows.findIndex((r) => r.id === id);
        h.rows[i] = { ...h.rows[i], ...patch };
        return h.rows[i];
      },
      setSampleKey: async (id, voiceId, key) => {
        const i = h.rows.findIndex((r) => r.id === id && r.voice_id === voiceId);
        if (i >= 0) h.rows[i] = { ...h.rows[i], sample_key: key };
      },
      remove: async (id) => void (h.rows = h.rows.filter((r) => r.id !== id)),
    },
    services: {
      hasService: (s) => h.keys[s],
      design: async (s, prompt, text) => {
        h.designArgs.push([s, prompt, text]);
        if (h.serviceDown) throw new ServiceError(s, h.serviceStatus);
        return [{ id: "draft-1", audio: base64FromBytes(WAV), mediaType: "" }];
      },
      keep: async (s, d) => (h.calls.push(`keep:${s}:${d.previewId}`), "newvoice12345"),
      deleteVoice: async (s, id) => void h.calls.push(`delete:${s}:${id}`),
      librarySearch: async (q) => (h.searchArgs.push(q), { voices: h.libraryResults.map((v) => ({ ...v, name: "n", description: "", previewUrl: null, gender: null, age: null, accent: null, useCase: null, rate: null, noticePeriodDays: null })), hasMore: false }),
      libraryAdd: async (_o, v) => (h.calls.push(`add:${v}`), "addedvoice123"),
      accountSlots: async () => ({ used: 3, limit: 10 }),
      accountVoices: async (s) => (s === "elevenlabs"
        ? [{ service: s, voiceId: "oldvoice1234", name: "Held", description: "", category: "generated" }, { service: s, voiceId: "loosevoice123", name: "Loose", description: "", category: "generated" }]
        : [{ service: s, voiceId: "oldvoice1234", name: "Same id, other service", description: "", category: "TVD" }]),
      previewRecording: async (_s, id) => {
        h.calls.push(`preview:${id}`);
        if (h.previewThrows) throw new Error("preview host down");
        return h.previewBytes;
      },
      lookupVoice: async (id) => {
        h.calls.push(`lookup:${id}`);
        if (h.lookedUp === null) return null;
        return { name: "Found", description: "A found voice.", gender: "male", age: "old", previewUrl: null, rate: null, ...h.lookedUp };
      },
      synthesize: async (_s, id, text) => (h.calls.push(`speak:${id}:${text}`), h.synthBytes),
    },
  };
  h.deps.store = {
    get: async (k) => h.store.get(k) ?? null,
    put: async (k, b) => void h.store.set(k, b),
    remove: async (k) => void (h.calls.push(`rm:${k}`), h.store.delete(k)),
  };
  const asStore = h.deps;
  return { h, run: (body: Record<string, unknown>, isAdmin = true) => handleStudio({ userId: ADMIN, isAdmin, body, deps: h.withStore ? asStore : { ...asStore, store: null } }) };
}

/** Every field any studio answer carries, so a test reads the one it checks with its type. */
interface StudioAnswer {
  message: string;
  audio: string;
  mediaType: string;
  previews: Array<{ id: string; audio: string; mediaType: string }>;
  voice: Record<string, unknown>;
  voices: Array<{ voiceId: string; inRegistry: boolean }>;
  slots: { used: number; limit: number } | null;
  unregistered: Array<{ service: string; voiceId: string }>;
}
const read = async (res: Response) => (await res.json()) as StudioAnswer;

describe("the admin gate", () => {
  it.each(["design", "keep", "library-search", "library-add", "account", "lookup", "remove"])("a signed-in non-admin is refused %s before anything is called", async (action) => {
    const { h, run } = harness();
    const res = await run({ action, service: "elevenlabs", prompt: "p", previewText: LONG_TEXT, slotId: SLOT, fromService: true }, false);
    expect(res.status).toBe(403);
    expect(h.designArgs).toEqual([]);
    expect(h.calls).toEqual([]);
    expect(h.rows).toHaveLength(1);
  });
});

describe("design", () => {
  it("sends the maintainer's prompt and text untouched, spaces and newlines included", async () => {
    const { h, run } = harness();
    const prompt = "  A gruff dwarf,\n  low and slow.  ";
    await run({ action: "design", service: "inworld", prompt, previewText: "  Hello there.\n" });
    expect(h.designArgs).toEqual([["inworld", prompt, "  Hello there.\n"]]);
  });

  it("names the audio's real format: WAV bytes are audio/wav whatever the service called them", async () => {
    const { run } = harness();
    const body = await read(await run({ action: "design", service: "inworld", prompt: "p", previewText: "hi" }));
    expect(body.previews[0].mediaType).toBe("audio/wav");
  });

  it.each([[99, 422], [100, 200], [1000, 200], [1001, 400]])("ElevenLabs preview text of %i characters answers %i", async (length, status) => {
    const { run } = harness();
    const res = await run({ action: "design", service: "elevenlabs", prompt: "p", previewText: "x".repeat(length) });
    expect(res.status).toBe(status);
  });

  it("does not hold Inworld to ElevenLabs' 100 character floor", async () => {
    const { run } = harness();
    expect((await run({ action: "design", service: "inworld", prompt: "p", previewText: "short" })).status).toBe(200);
  });

  it("a service failure answers a sentence, with no service message in it", async () => {
    const { h, run } = harness();
    h.serviceDown = true;
    const res = await run({ action: "design", service: "elevenlabs", prompt: "p", previewText: LONG_TEXT });
    expect(res.status).toBe(502);
    expect((await read(res)).message).toMatch(/ElevenLabs could not do that/);
  });

  // Bug caught: a pasted ID treated as importable when it is a Library voice not in the account (the import would
  // store a voice that cannot speak), or the reverse (adding a voice the account already has).
  it("looks up a pasted ID: in the account it imports, from the Library it is added", async () => {
    const { h, run } = harness();
    h.lookedUp = { voiceId: "loosevoice123", category: "generated", publicOwnerId: null };
    expect((await read(await run({ action: "lookup", voiceId: " loosevoice123 " }))).voice).toMatchObject({ voiceId: "loosevoice123", inAccount: true, inRegistry: false });
    h.lookedUp = { voiceId: "sharedvoice99", category: "professional", publicOwnerId: "owner1" };
    expect((await read(await run({ action: "lookup", voiceId: "sharedvoice99" }))).voice).toMatchObject({ inAccount: false, publicOwnerId: "owner1" });
    h.lookedUp = { voiceId: "premadevoice1", category: "premade", publicOwnerId: null };
    expect((await read(await run({ action: "lookup", voiceId: "premadevoice1" }))).voice).toMatchObject({ inAccount: true });
  });

  // Bug caught: the same voice pasted twice filling two slots.
  it("says a pasted ID already fills a slot", async () => {
    const { h, run } = harness();
    h.lookedUp = { voiceId: "oldvoice1234", category: "generated", publicOwnerId: null };
    expect((await read(await run({ action: "lookup", voiceId: "oldvoice1234" }))).voice).toMatchObject({ inRegistry: true });
  });

  // Bug caught: an unknown or malformed ID answered as a broken service, or sent into ElevenLabs' address unchecked.
  it("says so for an ID ElevenLabs does not know, and refuses one that is not an ID", async () => {
    const { h, run } = harness();
    expect((await run({ action: "lookup", voiceId: "nosuchvoice1" })).status).toBe(404);
    expect((await run({ action: "lookup", voiceId: "../../v1/user" })).status).toBe(400);
    expect(h.calls).toEqual(["lookup:nosuchvoice1"]);
  });

  // Bug caught (seen live): a key not allowed to design voices answered "try again in a moment", which can never help.
  it("says the key is not allowed, not to try again, when the service refuses the key", async () => {
    const { h, run } = harness();
    h.serviceDown = true;
    h.serviceStatus = 401;
    const res = await run({ action: "design", service: "elevenlabs", prompt: "p", previewText: LONG_TEXT });
    expect(res.status).toBe(502);
    const body = await read(res);
    expect(body.message).toMatch(/not allowed/);
    expect(body.message).not.toMatch(/Try again/);
  });

  it("without the service's key says so instead of calling it", async () => {
    const { h, run } = harness();
    h.keys.inworld = false;
    expect((await run({ action: "design", service: "inworld", prompt: "p", previewText: "t" })).status).toBe(503);
    expect(h.designArgs).toEqual([]);
  });
});

describe("keep", () => {
  it("into a new slot saves the voice, stores the audio as its sample and inserts a designed row", async () => {
    const { h, run } = harness();
    const res = await run({ action: "keep", service: "inworld", previewId: "draft-1", audio: base64FromBytes(WAV), slot: fields });
    const { voice } = await read(res);
    expect(voice).toMatchObject({ id: NEW_ID, origin: "designed", service: "inworld", voice_id: "newvoice12345", sample_key: `voice-samples/${NEW_ID}/newvoice12345.wav` });
    expect(h.store.get(`voice-samples/${NEW_ID}/newvoice12345.wav`)).toEqual(WAV);
  });

  it("replacing a designed voice with retireOld frees its custom slot and drops its old sample", async () => {
    const { h, run } = harness([row({ sample_key: `voice-samples/${SLOT}/oldvoice1234.wav` })]);
    h.store.set(`voice-samples/${SLOT}/oldvoice1234.wav`, WAV);
    await run({ action: "keep", service: "elevenlabs", previewId: "draft-2", audio: base64FromBytes(MP3), slotId: SLOT, retireOld: true });
    expect(h.calls).toContain("delete:elevenlabs:oldvoice1234");
    expect(h.store.has(`voice-samples/${SLOT}/oldvoice1234.wav`)).toBe(false);
    expect(h.store.has(`voice-samples/${SLOT}/newvoice12345.mp3`)).toBe(true);
  });

  it("without retireOld the old designed voice stays on the service", async () => {
    const { h, run } = harness();
    await run({ action: "keep", service: "elevenlabs", previewId: "draft-2", audio: base64FromBytes(MP3), slotId: SLOT });
    expect(h.calls.some((c) => c.startsWith("delete:"))).toBe(false);
  });

  it.each(["library", "stock", "imported"] as const)("replacing a %s voice never deletes it from its service, even asked to retire", async (origin) => {
    const { h, run } = harness([row({ origin })]);
    await run({ action: "keep", service: "elevenlabs", previewId: "draft-2", audio: base64FromBytes(MP3), slotId: SLOT, retireOld: true });
    expect(h.calls.some((c) => c.startsWith("delete:"))).toBe(false);
  });

  it("a database failure after the service saved the voice deletes the new voice again, so no custom slot is lost", async () => {
    const { h, run } = harness();
    h.insertThrows = true;
    await expect(run({ action: "keep", service: "elevenlabs", previewId: "draft-1", audio: base64FromBytes(MP3), slot: fields })).rejects.toThrow("db down");
    expect(h.calls).toContain("delete:elevenlabs:newvoice12345");
  });

  it("answers 404 for a slot that is not there, before saving anything on the service", async () => {
    const { h, run } = harness([]);
    expect((await run({ action: "keep", service: "elevenlabs", previewId: "draft-1", audio: "AA==", slotId: SLOT })).status).toBe(404);
    expect(h.calls).toEqual([]);
  });

  it("needs a slot to fill or a slot to make", async () => {
    const { run } = harness();
    expect((await run({ action: "keep", service: "elevenlabs", previewId: "draft-1", audio: "AA==" })).status).toBe(400);
  });
});

describe("library", () => {
  it("child sends no age filter, since the library has none, while a woman is female and old is old", async () => {
    const { h, run } = harness();
    await run({ action: "library-search", query: "", sex: "woman", age: "child" });
    await run({ action: "library-search", query: "x", age: "old", page: 2 });
    expect(h.searchArgs).toEqual([{ search: "", gender: "female", page: 0 }, { search: "x", age: "old", page: 2 }]);
  });

  it("marks the voices a slot already holds, on ElevenLabs only", async () => {
    const { h, run } = harness();
    h.libraryResults = [{ publicOwnerId: "own", voiceId: "oldvoice1234" }, { publicOwnerId: "own", voiceId: "freshvoice123" }];
    const { voices } = await read(await run({ action: "library-search", query: "" }));
    expect(voices.map((v: { inRegistry: boolean }) => v.inRegistry)).toEqual([true, false]);
  });

  it("add stores the id the account returned, as a library voice on ElevenLabs", async () => {
    const { run } = harness();
    const { voice } = await read(await run({ action: "library-add", publicOwnerId: "own1", voiceId: "libvoice1234", slot: fields }));
    expect(voice).toMatchObject({ origin: "library", service: "elevenlabs", voice_id: "addedvoice123", library_voice_id: "libvoice1234", sample_key: null });
  });

  // Bug caught: a library voice whose account copy has a different id shown as not added, and added a second time.
  it("knows a library voice again by its library id when the account's copy has another", async () => {
    const { h, run } = harness([row({ origin: "library", voice_id: "addedvoice123", library_voice_id: "libvoice1234" })]);
    h.libraryResults = [{ publicOwnerId: "own1", voiceId: "libvoice1234" }];
    const { voices } = await read(await run({ action: "library-search", query: "" }));
    expect(voices.map((v) => v.inRegistry)).toEqual([true]);
    expect((await run({ action: "library-add", publicOwnerId: "own1", voiceId: "libvoice1234", slot: fields })).status).toBe(409);
  });

  it("adding a voice that already fills a slot is refused, not added twice", async () => {
    const { h, run } = harness();
    const res = await run({ action: "library-add", publicOwnerId: "own1", voiceId: "oldvoice1234", slot: fields });
    expect(res.status).toBe(409);
    expect(h.calls).toEqual([]);
  });
});

describe("account", () => {
  it("lists only voices no slot holds, matching on service as well as id", async () => {
    const { run } = harness();
    const body = await read(await run({ action: "account" }));
    expect(body.slots).toEqual({ used: 3, limit: 10 });
    expect(body.unregistered.map((v: { service: string; voiceId: string }) => `${v.service}:${v.voiceId}`)).toEqual(["elevenlabs:loosevoice123", "inworld:oldvoice1234"]);
  });

  it("without an ElevenLabs key slots is null and Inworld is still listed", async () => {
    const { h, run } = harness();
    h.keys.elevenlabs = false;
    const body = await read(await run({ action: "account" }));
    expect(body.slots).toBeNull();
    expect(body.unregistered).toHaveLength(1);
  });
});

describe("remove", () => {
  it("fromService deletes a designed voice from its service, the row and the sample", async () => {
    const { h, run } = harness([row({ sample_key: `voice-samples/${SLOT}/oldvoice1234.mp3` })]);
    expect((await run({ action: "remove", slotId: SLOT, fromService: true })).status).toBe(200);
    expect(h.calls).toEqual(["delete:elevenlabs:oldvoice1234", `rm:voice-samples/${SLOT}/oldvoice1234.mp3`]);
    expect(h.rows).toEqual([]);
  });

  it("never deletes a stock voice from the service, though the slot goes", async () => {
    const { h, run } = harness([row({ origin: "stock" })]);
    await run({ action: "remove", slotId: SLOT, fromService: true });
    expect(h.calls).toEqual([]);
    expect(h.rows).toEqual([]);
  });

  it("without fromService leaves the voice on the service", async () => {
    const { h, run } = harness();
    await run({ action: "remove", slotId: SLOT, fromService: false });
    expect(h.calls).toEqual([]);
  });

  it("a service that refuses keeps the slot, so the removal can be tried again", async () => {
    const { h, run } = harness();
    h.deps.services.deleteVoice = async (s) => { throw new ServiceError(s, 500); };
    expect((await run({ action: "remove", slotId: SLOT, fromService: true })).status).toBe(502);
    expect(h.rows).toHaveLength(1);
  });
});

describe("sample", () => {
  it("answers 404 for a slot the caller's row level security hides, and makes no speech", async () => {
    const { h, run } = harness();
    h.visible.clear();
    expect((await run({ action: "sample", slotId: SLOT }, false)).status).toBe(404);
    expect(h.calls).toEqual([]);
  });

  it("an unfilled slot is a 409 with a sentence", async () => {
    const { run } = harness([row({ service: null, voice_id: null })]);
    const res = await run({ action: "sample", slotId: SLOT }, false);
    expect(res.status).toBe(409);
    expect((await read(res)).message).toMatch(/not been made yet/);
  });

  it("a kept sample is returned without any speech being made", async () => {
    const { h, run } = harness([row({ sample_key: `voice-samples/${SLOT}/oldvoice1234.wav` })]);
    h.store.set(`voice-samples/${SLOT}/oldvoice1234.wav`, WAV);
    const body = await read(await run({ action: "sample", slotId: SLOT }, false));
    expect(body).toEqual({ audio: base64FromBytes(WAV), mediaType: "audio/wav" });
    expect(h.calls).toEqual([]);
  });

  it("the first listen speaks the preview text, keeps it and records the key", async () => {
    const { h, run } = harness([row({ preview_text: "Well met, traveller." })]);
    await run({ action: "sample", slotId: SLOT }, false);
    expect(h.calls).toEqual(["preview:oldvoice1234", "speak:oldvoice1234:Well met, traveller."]);
    expect(h.rows[0].sample_key).toBe(`voice-samples/${SLOT}/oldvoice1234.mp3`);
    expect(h.store.get(`voice-samples/${SLOT}/oldvoice1234.mp3`)).toEqual(MP3);
  });

  it("a slot with no preview text says the neutral line", async () => {
    const { h, run } = harness();
    await run({ action: "sample", slotId: SLOT }, false);
    expect(h.calls).toEqual(["preview:oldvoice1234", `speak:oldvoice1234:${NEUTRAL_SAMPLE_LINE}`]);
  });

  // Bug caught: every first listen paying for speech when the service hands out a preview of the voice for nothing.
  it("takes the service's free preview when it has one, keeps it, and speaks nothing", async () => {
    const { h, run } = harness([row({ preview_text: "Well met, traveller." })]);
    h.previewBytes = WAV;
    const body = await read(await run({ action: "sample", slotId: SLOT }, false));
    expect(h.calls).toEqual(["preview:oldvoice1234"]);
    expect(body.audio).toBe(base64FromBytes(WAV));
    expect(h.store.get(`voice-samples/${SLOT}/oldvoice1234.wav`)).toEqual(WAV);
  });

  // Bug caught: a sample of the old voice, finished after the admin replaced it, overwriting the new voice's sample.
  it("does not keep a sample when the slot's voice changed while it was being made", async () => {
    const { h, run } = harness();
    h.deps.services.synthesize = async () => {
      h.rows[0] = { ...h.rows[0], voice_id: "newvoice12345" };
      return MP3;
    };
    const res = await run({ action: "sample", slotId: SLOT }, false);
    expect(res.status).toBe(200);
    expect(h.store.size).toBe(0);
    expect(h.rows[0].sample_key).toBeNull();
  });

  // Bug caught: a preview host that is down leaving the listener with nothing, when a spoken line would do.
  it("speaks a line when the free preview cannot be fetched", async () => {
    const { h, run } = harness();
    h.previewThrows = true;
    const res = await run({ action: "sample", slotId: SLOT }, false);
    expect(res.status).toBe(200);
    expect(h.calls).toEqual(["preview:oldvoice1234", `speak:oldvoice1234:${NEUTRAL_SAMPLE_LINE}`]);
  });

  it("with no store it still answers the audio, and records no key", async () => {
    const { h, run } = harness();
    h.withStore = false;
    const res = await run({ action: "sample", slotId: SLOT }, false);
    expect((await read(res)).audio).toBe(base64FromBytes(MP3));
    expect(h.rows[0].sample_key).toBeNull();
  });

  it("is rate limited, before the row is read or any speech paid for", async () => {
    const { h, run } = harness();
    h.allowed = false;
    expect((await run({ action: "sample", slotId: SLOT }, false)).status).toBe(429);
    expect(h.calls).toEqual([]);
  });
});
