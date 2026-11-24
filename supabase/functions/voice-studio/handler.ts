// voice-studio (#1272): the admin's workshop for the voice registry (`speech_voices`), and the one door through
// which a slot's sample reaches anyone else. The rules are here, with every dependency injected so they are tested
// without Deno, a database or either speech service; `index.ts` wires the real ones.
//
// Request body `{ action, ...fields }`, answered with the matching response of `src/types/speechVoice.types.ts`
// (an edge function cannot import from `src/`, so the shapes are restated below). Errors answer
// `{ error: code, message }` with a sentence for a person.
import { json, jsonError } from "../_shared/pipeline/respond.ts";
import { bytesFromBase64 } from "../_shared/speech.ts";
import { base64FromBytes } from "../_shared/base64.ts";

export type SpeechService = "elevenlabs" | "inworld";
type VoiceSex = "woman" | "man";
type VoiceAge = "child" | "young" | "adult" | "old";
type VoiceKind = "cast" | "own";
type VoiceOrigin = "stock" | "designed" | "library" | "imported";

export interface SpeechVoiceRow {
  id: string;
  name: string;
  description: string;
  design_prompt: string | null;
  preview_text: string | null;
  sex: VoiceSex | null;
  age: VoiceAge | null;
  kind: VoiceKind;
  origin: VoiceOrigin;
  service: SpeechService | null;
  voice_id: string | null;
  /** For a Voice Library voice: its id in the library, which the account's copy need not share. */
  library_voice_id: string | null;
  sample_key: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** The fields of a slot the admin writes. */
export interface SlotFields {
  name: string;
  description: string;
  design_prompt: string | null;
  preview_text: string | null;
  sex: VoiceSex | null;
  age: VoiceAge | null;
  kind: VoiceKind;
}

export interface DesignedPreview {
  id: string;
  audio: string;
  mediaType: string;
}

/** An ElevenLabs voice found by its ID (the page's `LookedUpVoice`). */
export interface LookedUpVoice {
  voiceId: string;
  name: string;
  description: string;
  gender: string | null;
  age: string | null;
  previewUrl: string | null;
  category: string;
  inAccount: boolean;
  publicOwnerId: string | null;
  rate: number | null;
  inRegistry: boolean;
}

export interface LibraryVoice {
  publicOwnerId: string;
  voiceId: string;
  name: string;
  description: string;
  previewUrl: string | null;
  gender: string | null;
  age: string | null;
  accent: string | null;
  useCase: string | null;
  rate: number | null;
  noticePeriodDays: number | null;
  inRegistry: boolean;
}

export interface AccountVoice {
  service: SpeechService;
  voiceId: string;
  name: string;
  description: string;
  category: string;
}

/** A speech service refused or failed. Only its status is ever shown, never its message. */
export class ServiceError extends Error {
  constructor(readonly service: SpeechService, readonly status: number) {
    super(`${service} answered ${status}`);
  }
}

/** What the two speech services do for the studio (`services.ts` makes the calls). */
export interface StudioServices {
  hasService(service: SpeechService): boolean;
  design(service: SpeechService, prompt: string, previewText: string): Promise<DesignedPreview[]>;
  /** Saves a draft preview on the service; answers the voice's id there. */
  keep(service: SpeechService, draft: { previewId: string; name: string; description: string }): Promise<string>;
  deleteVoice(service: SpeechService, voiceId: string): Promise<void>;
  librarySearch(query: { search: string; gender?: string; age?: string; page: number }): Promise<{ voices: Array<Omit<LibraryVoice, "inRegistry">>; hasMore: boolean }>;
  /** Adds a Voice Library voice to the account; answers the id it has there. */
  libraryAdd(publicOwnerId: string, voiceId: string, name: string): Promise<string>;
  accountSlots(): Promise<{ used: number; limit: number }>;
  /** An ElevenLabs voice by its ID, wherever it lives (ready-made, the account, the Voice Library); null when unknown. */
  lookupVoice(voiceId: string): Promise<Omit<LookedUpVoice, "inAccount" | "inRegistry"> | null>;
  accountVoices(service: SpeechService): Promise<AccountVoice[]>;
  /** The service's own free preview of a voice, or null when it has none: listening then costs nothing. */
  previewRecording(service: SpeechService, voiceId: string): Promise<Uint8Array | null>;
  synthesize(service: SpeechService, voiceId: string, text: string): Promise<Uint8Array>;
}

/** The private store the samples live in; null `store` in the deps means this stack has none. */
export interface SampleStore {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface StudioDb {
  /** Every row: the admin's view. */
  listAll(): Promise<SpeechVoiceRow[]>;
  /** One row by the service role: the admin's actions. */
  loadAsAdmin(id: string): Promise<SpeechVoiceRow | null>;
  /** One row as the caller: row level security decides whether it exists for them. */
  loadAsCaller(id: string): Promise<SpeechVoiceRow | null>;
  insert(row: Partial<SpeechVoiceRow> & { id: string }): Promise<SpeechVoiceRow>;
  update(id: string, patch: Partial<SpeechVoiceRow>): Promise<SpeechVoiceRow>;
  /** Records a slot's sample, only while the slot still has the voice it is a recording of. */
  setSampleKey(id: string, voiceId: string, key: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface StudioDeps {
  db: StudioDb;
  services: StudioServices;
  store: SampleStore | null;
  rateLimit(userId: string): Promise<boolean>;
  newId(): string;
  /** An error that did not stop the request (a clean-up that failed after the answer was made). */
  report(error: unknown): void;
}

export const STUDIO_MESSAGES = {
  forbidden: "Only the admin can use the voice studio.",
  invalid: "That request is not valid.",
  noKey: (service: SpeechService) => `No ${service === "inworld" ? "Inworld" : "ElevenLabs"} key is set. Add it in Admin, Providers.`,
  previewTextLength: "ElevenLabs needs a preview text of 100 to 1000 characters.",
  serviceFailed: (service: SpeechService) => `${service === "inworld" ? "Inworld" : "ElevenLabs"} could not do that just now. Try again in a moment.`,
  // A refused key is not a hiccup: trying again cannot help. ElevenLabs keys are limited per feature, and a key made
  // for speech alone refuses the studio's calls (seen live, 24 Nov 2026).
  keyRefused: (service: SpeechService) =>
    `${service === "inworld" ? "Inworld" : "ElevenLabs"} refused this with the key on file: the key is not allowed to do it. Give the key the voice permissions (on ElevenLabs: Voices read and write, Voice Generation, User read) in Admin > Providers.`,
  notFound: "That voice is not there.",
  empty: "That voice has not been made yet, so there is nothing to hear.",
  inRegistry: "That voice already fills a slot.",
  badVoiceId: "That is not an ElevenLabs voice ID: it is the code of letters and numbers on the voice's page.",
  unknownVoice: "ElevenLabs does not know a voice with that ID, or it is not shared.",
};

/** The line a sample says when the slot has no preview text of its own. */
export const NEUTRAL_SAMPLE_LINE = "The road is long, but the lantern is lit, and the night is young yet.";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SERVICES: readonly string[] = ["elevenlabs", "inworld"];
const SEXES: readonly string[] = ["woman", "man"];
const AGES: readonly string[] = ["child", "young", "adult", "old"];
const KINDS: readonly string[] = ["cast", "own"];
const ADMIN_ACTIONS: readonly string[] = ["design", "keep", "library-search", "library-add", "account", "lookup", "remove"];

const isService = (v: unknown): v is SpeechService => typeof v === "string" && SERVICES.includes(v);
const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.trim() !== "" && v.length <= max;
const isId = (v: unknown): v is string => typeof v === "string" && ID.test(v);

/** WAV starts with "RIFF"; everything else the services send is MP3. Read from the bytes, never from a service's label. */
export function mediaTypeOf(bytes: Uint8Array): "audio/wav" | "audio/mpeg" {
  const riff = bytes.length >= 4 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  return riff ? "audio/wav" : "audio/mpeg";
}

const extensionOf = (mediaType: string): "wav" | "mp3" => (mediaType === "audio/wav" ? "wav" : "mp3");
// Named by the slot and the voice, so a recording of a voice the slot has since replaced can never land on the new
// voice's sample (the column's check holds this shape).
const sampleKeyFor = (slotId: string, voiceId: string, mediaType: string): string => `voice-samples/${slotId}/${voiceId}.${extensionOf(mediaType)}`;
const mediaTypeOfKey = (key: string): string => (key.endsWith(".wav") ? "audio/wav" : "audio/mpeg");

/** A slot's fields from the request, or null when they are not a slot. Absent optional ones are stored as null. */
function parseFields(raw: unknown): SlotFields | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isText(r.name, 80)) return null;
  if (typeof r.description !== "string" || r.description.length > 1000) return null;
  const optionalText = (v: unknown): string | null | undefined => (v === null || v === undefined ? null : typeof v === "string" && v.length <= 1000 ? v : undefined);
  const design = optionalText(r.design_prompt);
  const preview = optionalText(r.preview_text);
  if (design === undefined || preview === undefined) return null;
  const sex = r.sex === null || r.sex === undefined ? null : typeof r.sex === "string" && SEXES.includes(r.sex) ? (r.sex as VoiceSex) : undefined;
  const age = r.age === null || r.age === undefined ? null : typeof r.age === "string" && AGES.includes(r.age) ? (r.age as VoiceAge) : undefined;
  const kind = typeof r.kind === "string" && KINDS.includes(r.kind) ? (r.kind as VoiceKind) : undefined;
  if (sex === undefined || age === undefined || kind === undefined) return null;
  return { name: r.name.trim(), description: r.description, design_prompt: design, preview_text: preview, sex, age, kind };
}

/** What a service is told about a kept voice: the prompt it was made from when there is one, else the slot's words. */
function keptDescription(name: string, ...candidates: Array<string | null>): string {
  const long = candidates.find((c) => c !== null && c.trim().length >= 20);
  return (long ?? `${name}, a voice kept from the Grimoire voice studio.`).slice(0, 1000);
}

const GENDER_FILTER: Record<VoiceSex, string> = { woman: "female", man: "male" };
// The Voice Library has no child; a child filter would only empty the list, so none is sent.
const AGE_FILTER: Record<Exclude<VoiceAge, "child">, string> = { young: "young", adult: "middle_aged", old: "old" };

export async function handleStudio(input: { userId: string; isAdmin: boolean; body: Record<string, unknown>; deps: StudioDeps }): Promise<Response> {
  const { userId, isAdmin, body, deps } = input;
  const action = body.action;
  if (typeof action !== "string") return jsonError(400, "invalid_body", STUDIO_MESSAGES.invalid);
  // The gate sits here as well as in `index.ts` so no action can be added that forgets it.
  if (ADMIN_ACTIONS.includes(action) && !isAdmin) return jsonError(403, "forbidden", STUDIO_MESSAGES.forbidden);

  try {
    switch (action) {
      case "design": return await design(body, deps);
      case "keep": return await keep(body, deps);
      case "library-search": return await librarySearch(body, deps);
      case "library-add": return await libraryAdd(body, deps);
      case "account": return await account(deps);
      case "lookup": return await lookup(body, deps);
      case "remove": return await remove(body, deps);
      case "sample": return await sample(userId, body, deps);
      default: return jsonError(400, "unknown_action", STUDIO_MESSAGES.invalid);
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      deps.report(error);
      if (error.status === 401 || error.status === 403) return jsonError(502, "service_key_refused", STUDIO_MESSAGES.keyRefused(error.service));
      return jsonError(502, "service_failed", STUDIO_MESSAGES.serviceFailed(error.service));
    }
    throw error;
  }
}

async function design(body: Record<string, unknown>, deps: StudioDeps): Promise<Response> {
  const { service, prompt, previewText } = body;
  if (!isService(service) || !isText(prompt, 1000) || !isText(previewText, 1000)) return jsonError(400, "invalid_body", STUDIO_MESSAGES.invalid);
  if (service === "elevenlabs" && (previewText.length < 100 || previewText.length > 1000)) return jsonError(422, "preview_text_length", STUDIO_MESSAGES.previewTextLength);
  if (!deps.services.hasService(service)) return jsonError(503, "no_key", STUDIO_MESSAGES.noKey(service));
  // The maintainer edits both before submitting, so they go exactly as written.
  const previews = await deps.services.design(service, prompt, previewText);
  return json({ previews: previews.map((p) => ({ ...p, mediaType: mediaTypeOf(bytesFromBase64(p.audio)) })) });
}

async function keep(body: Record<string, unknown>, deps: StudioDeps): Promise<Response> {
  const { service, previewId, audio, slotId, retireOld } = body;
  if (!isService(service) || !isId(previewId) || typeof audio !== "string" || audio === "") return jsonError(400, "invalid_body", STUDIO_MESSAGES.invalid);
  const hasSlotId = slotId !== undefined && slotId !== null;
  if (hasSlotId && (typeof slotId !== "string" || !UUID.test(slotId))) return jsonError(400, "invalid_body", STUDIO_MESSAGES.invalid);
  const fields = hasSlotId ? null : parseFields(body.slot);
  if (!hasSlotId && fields === null) return jsonError(400, "invalid_body", STUDIO_MESSAGES.invalid);
  if (!deps.services.hasService(service)) return jsonError(503, "no_key", STUDIO_MESSAGES.noKey(service));

  const old = hasSlotId ? await deps.db.loadAsAdmin(slotId as string) : null;
  if (hasSlotId && old === null) return jsonError(404, "not_found", STUDIO_MESSAGES.notFound);

  const name = old?.name ?? (fields as SlotFields).name;
  const description = old?.description ?? (fields as SlotFields).description;
  const designPrompt = old ? old.design_prompt : (fields as SlotFields).design_prompt;
  const voiceId = await deps.services.keep(service, { previewId, name, description: keptDescription(name, designPrompt, description) });

  const bytes = bytesFromBase64(audio);
  const mediaType = mediaTypeOf(bytes);
  const id = old?.id ?? deps.newId();
  const key = sampleKeyFor(id, voiceId, mediaType);
  let kept = false;
  if (deps.store !== null) {
    try {
      await deps.store.put(key, bytes, mediaType);
      kept = true;
    } catch (error) {
      // The voice is saved; the listen button will make its sample on first press.
      deps.report(error);
    }
  }

  let row: SpeechVoiceRow;
  try {
    row = old
      ? await deps.db.update(old.id, { service, voice_id: voiceId, origin: "designed", sample_key: kept ? key : null })
      : await deps.db.insert({ id, ...(fields as SlotFields), origin: "designed", service, voice_id: voiceId, sample_key: kept ? key : null });
  } catch (error) {
    // Do not leave a voice using a custom slot that nothing in the registry holds.
    await deps.services.deleteVoice(service, voiceId).catch((e) => deps.report(e));
    throw error;
  }

  if (old !== null) await retireOldVoice(old, retireOld === true, kept ? key : null, deps);
  return json({ voice: row });
}

/** After a filled slot is replaced: free the old custom slot (only for a voice the studio made) and drop its sample. */
async function retireOldVoice(old: SpeechVoiceRow, retire: boolean, newKey: string | null, deps: StudioDeps): Promise<void> {
  // A stock, library or imported voice is never deleted from its service here: it was not this slot's to destroy.
  if (retire && old.origin === "designed" && old.service !== null && old.voice_id !== null) {
    await deps.services.deleteVoice(old.service, old.voice_id).catch((e) => deps.report(e));
  }
  if (deps.store !== null && old.sample_key !== null && old.sample_key !== newKey) {
    await deps.store.remove(old.sample_key).catch((e) => deps.report(e));
  }
}

/**
 * The Voice Library ids the registry already holds: the library id a voice was added under, and (for one added
 * another way, or before that id was kept) its ElevenLabs id, which for a library voice is usually the same.
 */
function libraryHeld(rows: readonly SpeechVoiceRow[]): Set<string> {
  const held = new Set<string>();
  for (const r of rows) {
    if (r.library_voice_id !== null) held.add(r.library_voice_id);
    if (r.service === "elevenlabs" && r.voice_id !== null) held.add(r.voice_id);
  }
  return held;
}

async function librarySearch(body: Record<string, unknown>, deps: StudioDeps): Promise<Response> {
  const { query, sex, age, page } = body;
  if (typeof query !== "string" || query.length > 200) return jsonError(400, "invalid_body", STUDIO_MESSAGES.invalid);
  if (sex !== undefined && !(typeof sex === "string" && SEXES.includes(sex))) return jsonError(400, "invalid_body", STUDIO_MESSAGES.invalid);
  if (age !== undefined && !(typeof age === "string" && AGES.includes(age))) return jsonError(400, "invalid_body", STUDIO_MESSAGES.invalid);
  if (page !== undefined && !(typeof page === "number" && Number.isInteger(page) && page >= 0 && page < 1000)) return jsonError(400, "invalid_body", STUDIO_MESSAGES.invalid);
  if (!deps.services.hasService("elevenlabs")) return jsonError(503, "no_key", STUDIO_MESSAGES.noKey("elevenlabs"));

  const found = await deps.services.librarySearch({
    search: query,
    ...(sex === undefined ? {} : { gender: GENDER_FILTER[sex as VoiceSex] }),
    ...(age === undefined || age === "child" ? {} : { age: AGE_FILTER[age as Exclude<VoiceAge, "child">] }),
    page: page === undefined ? 0 : (page as number),
  });
  const held = libraryHeld(await deps.db.listAll());
  return json({ voices: found.voices.map((v) => ({ ...v, inRegistry: held.has(v.voiceId) })), hasMore: found.hasMore });
}

async function libraryAdd(body: Record<string, unknown>, deps: StudioDeps): Promise<Response> {
  const { publicOwnerId, voiceId } = body;
  const fields = parseFields(body.slot);
  if (!isId(publicOwnerId) || !isId(voiceId) || fields === null) return jsonError(400, "invalid_body", STUDIO_MESSAGES.invalid);
  if (!deps.services.hasService("elevenlabs")) return jsonError(503, "no_key", STUDIO_MESSAGES.noKey("elevenlabs"));
  if (libraryHeld(await deps.db.listAll()).has(voiceId)) return jsonError(409, "in_registry", STUDIO_MESSAGES.inRegistry);

  // The id the account gives it is the one that speaks; the library's own id is kept beside it, to know it again.
  const added = await deps.services.libraryAdd(publicOwnerId, voiceId, fields.name);
  try {
    const row = await deps.db.insert({ id: deps.newId(), ...fields, origin: "library", service: "elevenlabs", voice_id: added, library_voice_id: voiceId, sample_key: null });
    return json({ voice: row });
  } catch (error) {
    await deps.services.deleteVoice("elevenlabs", added).catch((e) => deps.report(e));
    throw error;
  }
}

async function account(deps: StudioDeps): Promise<Response> {
  const held = new Set((await deps.db.listAll()).filter((r) => r.service !== null && r.voice_id !== null).map((r) => `${r.service}:${r.voice_id}`));
  const slots = deps.services.hasService("elevenlabs") ? await deps.services.accountSlots() : null;
  const unregistered: AccountVoice[] = [];
  for (const service of SERVICES as SpeechService[]) {
    if (!deps.services.hasService(service)) continue;
    for (const v of await deps.services.accountVoices(service)) if (!held.has(`${v.service}:${v.voiceId}`)) unregistered.push(v);
  }
  return json({ slots, unregistered });
}

/**
 * A voice found by the ID the admin pasted from ElevenLabs' website, to fill a slot with: whether it is usable as it
 * is (ready-made, or in the account's My Voices: imported) or must be added from the Voice Library first (no custom
 * slot), and whether a slot already holds it.
 */
async function lookup(body: Record<string, unknown>, deps: StudioDeps): Promise<Response> {
  const raw = typeof body.voiceId === "string" ? body.voiceId.trim() : null;
  if (!isId(raw)) return jsonError(400, "invalid_body", STUDIO_MESSAGES.badVoiceId);
  if (!deps.services.hasService("elevenlabs")) return jsonError(503, "no_key", STUDIO_MESSAGES.noKey("elevenlabs"));
  const found = await deps.services.lookupVoice(raw);
  if (found === null) return jsonError(404, "voice_not_found", STUDIO_MESSAGES.unknownVoice);
  const inAccount = found.category === "premade" || (await deps.services.accountVoices("elevenlabs")).some((v) => v.voiceId === raw);
  const inRegistry = libraryHeld(await deps.db.listAll()).has(raw);
  return json({ voice: { ...found, inAccount, inRegistry } });
}

async function remove(body: Record<string, unknown>, deps: StudioDeps): Promise<Response> {
  const { slotId, fromService } = body;
  if (typeof slotId !== "string" || !UUID.test(slotId) || typeof fromService !== "boolean") return jsonError(400, "invalid_body", STUDIO_MESSAGES.invalid);
  const row = await deps.db.loadAsAdmin(slotId);
  if (row === null) return jsonError(404, "not_found", STUDIO_MESSAGES.notFound);

  // Service first: if it fails the slot is still there to try again, where the other way round the voice is orphaned.
  // A stock voice is the service's own, never ours to delete.
  if (fromService && row.origin !== "stock" && row.service !== null && row.voice_id !== null) {
    if (!deps.services.hasService(row.service)) return jsonError(503, "no_key", STUDIO_MESSAGES.noKey(row.service));
    await deps.services.deleteVoice(row.service, row.voice_id);
  }
  await deps.db.remove(row.id);
  if (deps.store !== null && row.sample_key !== null) await deps.store.remove(row.sample_key).catch((e) => deps.report(e));
  return json({ ok: true });
}

async function sample(userId: string, body: Record<string, unknown>, deps: StudioDeps): Promise<Response> {
  const { slotId } = body;
  if (typeof slotId !== "string" || !UUID.test(slotId)) return jsonError(400, "invalid_body", STUDIO_MESSAGES.invalid);
  if (!(await deps.rateLimit(userId))) return jsonError(429, "rate_limited", "That's a lot of requests in a short time. Wait a minute and try again.");

  // Read as the caller: a slot they may not see is a slot that is not there, whoever asks.
  const row = await deps.db.loadAsCaller(slotId);
  if (row === null) return jsonError(404, "not_found", STUDIO_MESSAGES.notFound);
  if (row.service === null || row.voice_id === null) return jsonError(409, "empty_slot", STUDIO_MESSAGES.empty);

  if (row.sample_key !== null && deps.store !== null) {
    const kept = await deps.store.get(row.sample_key);
    if (kept !== null) return json({ audio: base64FromBytes(kept), mediaType: mediaTypeOfKey(row.sample_key) });
  }
  if (!deps.services.hasService(row.service)) return jsonError(503, "no_key", STUDIO_MESSAGES.noKey(row.service));

  // The service's free preview first, so a DM listening through voices costs the platform nothing; only a voice
  // with none (Inworld's) is spoken, once, and kept like the rest. A preview that cannot be fetched falls through.
  let bytes: Uint8Array | null = null;
  try {
    bytes = await deps.services.previewRecording(row.service, row.voice_id);
  } catch (error) {
    deps.report(error);
  }
  if (bytes === null) bytes = await deps.services.synthesize(row.service, row.voice_id, row.preview_text ?? NEUTRAL_SAMPLE_LINE);
  const mediaType = mediaTypeOf(bytes);
  if (deps.store !== null) {
    const key = sampleKeyFor(row.id, row.voice_id, mediaType);
    try {
      // The admin may have replaced the slot's voice while this was being made: then this recording is of the old
      // voice, and keeping it would overwrite the new voice's sample at the same key. The save is conditional too.
      const current = await deps.db.loadAsAdmin(row.id);
      if (current !== null && current.voice_id === row.voice_id) {
        await deps.store.put(key, bytes, mediaType);
        await deps.db.setSampleKey(row.id, row.voice_id, key);
      }
    } catch (error) {
      // The listener still hears it; the next press makes it again.
      deps.report(error);
    }
  }
  return json({ audio: base64FromBytes(bytes), mediaType });
}
