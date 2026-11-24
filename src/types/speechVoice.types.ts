// The voice registry (#1272): the slots the AI table speaks characters in, and the voice studio's contract.
// The table is `speech_voices` (migration 20261124200320); the studio is the `voice-studio` edge function.

export type SpeechService = "elevenlabs" | "inworld";
export type VoiceSex = "woman" | "man";
export type VoiceAge = "child" | "young" | "adult" | "old";
/** `cast`: in the pool the table casts from. `own`: one character's signature voice, never cast to anyone else. */
export type VoiceKind = "cast" | "own";
/** Where the voice came from. Only `designed` (and cloned) voices use one of the account's custom voice slots. */
export type VoiceOrigin = "stock" | "designed" | "library" | "imported";

export interface SpeechVoice {
  id: string;
  name: string;
  /** Who this voice fits, in words: what casting matches a character's record against. */
  description: string;
  design_prompt: string | null;
  preview_text: string | null;
  sex: VoiceSex | null;
  age: VoiceAge | null;
  kind: VoiceKind;
  origin: VoiceOrigin;
  /** Null together with `voice_id` while the slot is only planned. */
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
export type SpeechVoiceFields = Pick<SpeechVoice, "name" | "description" | "design_prompt" | "preview_text" | "sex" | "age" | "kind">;

export const VOICE_SEX_OPTIONS: ReadonlyArray<{ value: VoiceSex; label: string }> = [
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
];

export const VOICE_AGE_OPTIONS: ReadonlyArray<{ value: VoiceAge; label: string }> = [
  { value: "child", label: "Child" },
  { value: "young", label: "Young" },
  { value: "adult", label: "Adult" },
  { value: "old", label: "Old" },
];

// ── voice-studio: POST /functions/v1/voice-studio, body { action, ...fields } ──────────────────────────────────
// Every action but `sample` is the admin's alone (403 otherwise). Errors answer { error: code, message }.

/** One voice the designer offered. `audio` is base64 of `mediaType`; `id` is the service's draft id. */
export interface DesignedPreview {
  id: string;
  audio: string;
  mediaType: string;
}

export interface DesignRequest {
  action: "design";
  service: SpeechService;
  /** Sent as written: the maintainer edits it before submitting. */
  prompt: string;
  /** What the previews say: 100 to 1000 characters on ElevenLabs. */
  previewText: string;
}
export interface DesignResponse {
  previews: DesignedPreview[];
}

/**
 * Keep one designed preview: it is saved on the service (a custom voice slot on ElevenLabs) and fills the slot
 * `slotId`, or a new slot made from `slot`. Keep is called once per preview kept; any number may be kept.
 * Filling a slot that already had a voice replaces it; `retireOld` also deletes the old voice from the service when
 * the studio made it (origin `designed`), which frees its custom slot.
 */
export interface KeepRequest {
  action: "keep";
  service: SpeechService;
  previewId: string;
  /** The preview's own audio (base64 mp3), kept as the slot's sample so the listen button costs nothing. */
  audio: string;
  slotId?: string;
  slot?: SpeechVoiceFields;
  retireOld?: boolean;
}
export interface KeepResponse {
  voice: SpeechVoice;
}

/** A voice in the ElevenLabs Voice Library: saving one uses no custom slot. */
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
  /** The owner's rate when it is a paid voice: more per character than speech is charged at. Null for a free one. */
  rate: number | null;
  /** Days of notice the owner gives before withdrawing it; null when none is given. */
  noticePeriodDays: number | null;
  /** This voice already fills a slot. */
  inRegistry: boolean;
}

export interface LibrarySearchRequest {
  action: "library-search";
  query: string;
  sex?: VoiceSex;
  age?: VoiceAge;
  page?: number;
}
export interface LibrarySearchResponse {
  voices: LibraryVoice[];
  hasMore: boolean;
}

export interface LibraryAddRequest {
  action: "library-add";
  publicOwnerId: string;
  voiceId: string;
  slot: SpeechVoiceFields;
}
export interface LibraryAddResponse {
  voice: SpeechVoice;
}

/** A voice already on one of the accounts that no slot holds yet (the maintainer's own designs, to import). */
export interface AccountVoice {
  service: SpeechService;
  voiceId: string;
  name: string;
  description: string;
  /** The service's own category ("generated", "cloned", "professional", ...). */
  category: string;
}

export interface AccountRequest {
  action: "account";
}
export interface AccountResponse {
  /** The ElevenLabs custom voice slots; null when the stack has no ElevenLabs key. */
  slots: { used: number; limit: number } | null;
  unregistered: AccountVoice[];
}

/** A slot's sample, made once (from `preview_text`, or a stock line) and kept. Anyone who may read the slot. */
export interface SampleRequest {
  action: "sample";
  slotId: string;
}
export interface SampleResponse {
  audio: string;
  mediaType: string;
}

/** Delete a slot; `fromService` also deletes the voice from the service (never a stock voice). */
export interface RemoveRequest {
  action: "remove";
  slotId: string;
  fromService: boolean;
}
export interface RemoveResponse {
  ok: true;
}

export type VoiceStudioRequest = DesignRequest | KeepRequest | LibrarySearchRequest | LibraryAddRequest | AccountRequest | SampleRequest | RemoveRequest;
