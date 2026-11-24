import { computed } from "vue";
import { useStorage } from "@vueuse/core";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { NO_VOICES, type SpokenLine, type VoicePart, type VoiceParts } from "@/lib/table/solo/voiceLines";
import { useAuthStore } from "@/stores/auth";
import { useClipQueue, type VoicePlayer } from "@/composables/voices/useClipQueue";

/** A line of the sitting to be voiced, as the page knows it (`voiceLines.ts`). */
export type VoiceLine = SpokenLine;

export interface VoiceRequest extends VoiceLine {
  campaignId: string;
  sessionId: string;
}

/** Calls `table-voice` and hands back the raw response. The seam a test replaces. */
export type VoiceTransport = (request: VoiceRequest) => Promise<Response>;

export const sendToTableVoice: VoiceTransport = async (request) => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  // Signed out mid-page: no line can be voiced, and an empty bearer would only be refused.
  if (data.session === null) throw new Error("Signed out.");
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/table-voice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${data.session.access_token}`,
    },
    // A line without a key is asked for by its words alone: the server answers it only from a clip it kept.
    body: JSON.stringify(request.key === null ? { ...request, key: undefined } : request),
  });
};

// What each account wants read aloud, on this device: the narrator, the characters, their own character. All off
// until asked for: sound a page starts by itself is not something to surprise anyone with, and every voiced line
// is a paid call.
const wanted = useStorage<Record<string, VoiceParts>>("grimoire:ai-table-voices", {}, safeLocalStorage());

/**
 * The voices at the AI table (#1021): the narrator's, the characters' and the player's own character's, each with
 * a switch of its own. Lines are read aloud one after another, in the order they came (the server speaks only a
 * line the sitting showed, with the character's own cue for how it is said). Deeds stay text. What line is read is
 * the caller's choice (`voiceLines.ts`); this only refuses to speak while everything is off.
 *
 * It never throws and never blocks the story: a line that cannot be voiced is skipped, and when the server says
 * voices are not switched on, `unavailable` is set and nothing more is asked.
 */
/** The breath between two different voices: a narrator who starts on the heels of a character sounds like one speaker. */
export const VOICE_CHANGE_PAUSE_MS = 500;

export function useTableVoice(options: {
  campaignId: () => string | null;
  sessionId: () => string | null;
  transport?: VoiceTransport;
  player?: VoicePlayer;
  /** Waits between two voices; a test replaces it. */
  pause?: (ms: number) => Promise<void>;
}) {
  const auth = useAuthStore();
  const transport = options.transport ?? sendToTableVoice;
  // Who spoke last, so a change of voice gets a breath and the same voice going on does not.
  const voiceOf = (line: VoiceLine): string => `${line.role}:${line.speakerId ?? line.speakerName}`;
  const userId = computed(() => auth.user?.id ?? null);
  const queue = useClipQueue({ owner: userId, player: options.player, changePauseMs: VOICE_CHANGE_PAUSE_MS, pause: options.pause });

  const parts = computed<VoiceParts>(() => {
    const mine = userId.value === null ? undefined : wanted.value[userId.value];
    return mine === undefined ? NO_VOICES : { ...NO_VOICES, ...mine };
  });
  const enabled = computed(() => parts.value.narrator || parts.value.characters || parts.value.player);

  // A voice already made is kept for as long as this screen lives, so hearing a line again costs nothing.
  const made = new Map<string, Promise<string | null>>();

  /** The line's clip, made once: asked for the first time it is wanted and kept unless it could not be voiced. */
  function clipOf(line: VoiceLine): Promise<string | null> {
    // By its key when it has one; a stored line is known by who said what.
    const name = line.key !== null ? line.key : `${line.role}:${line.speakerName}:${line.text}`;
    const kept = made.get(name);
    if (kept) return kept;
    const clip = fetchClip(line);
    made.set(name, clip);
    void clip.then((src) => {
      if (src === null && made.get(name) === clip) made.delete(name);
    });
    return clip;
  }

  function fetchClip(line: VoiceLine): Promise<string | null> {
    const campaignId = options.campaignId();
    const sessionId = options.sessionId();
    if (campaignId === null || sessionId === null) return Promise.resolve(null);
    return queue.fetchClip(() => transport({ campaignId, sessionId, ...line }));
  }

  /** Voices these lines after whatever is already waiting. Does nothing while voices are off or refused. */
  function say(lines: readonly VoiceLine[]): void {
    if (!enabled.value || queue.refused()) return;
    // Asked for at once, all of them: making a voice takes seconds, and they are played in order whatever comes back first.
    queue.enqueue(lines.map((line) => ({ clip: clipOf(line), voice: voiceOf(line) })));
  }

  /** Says these lines again, now: whatever is playing or waiting gives way to them. */
  function replay(lines: readonly VoiceLine[]): void {
    queue.stop();
    say(lines);
  }

  /** Switches one of the three on or off for this account. */
  function setPart(part: VoicePart, on: boolean): void {
    const id = userId.value;
    if (id === null) return;
    wanted.value = { ...wanted.value, [id]: { ...parts.value, [part]: on } };
    if (!enabled.value) queue.stop();
    // Asking again is how a player finds out voices have since been switched on.
    if (on) queue.clearRefusals();
  }

  /** Everything off: the server said voices are not switched on. */
  function setAllOff(): void {
    const id = userId.value;
    if (id === null) return;
    wanted.value = { ...wanted.value, [id]: { ...NO_VOICES } };
    queue.stop();
  }

  // `speaking` is the queue's `busy`: the table must not go on while a voice is still reading, the wait for a clip
  // being made included (`useTableGoingOn`).
  return { parts, enabled, unavailable: queue.unavailable, spent: queue.spent, broke: queue.broke, speaking: queue.busy, say, replay, stop: queue.stop, setPart, setAllOff };
}

/**
 * The three voice switches by themselves, for a page that sets them before a sitting begins (the door to the
 * table): the same choice `useTableVoice` reads, with nothing to play.
 */
export function useTableVoicePrefs() {
  const auth = useAuthStore();
  const userId = computed(() => auth.user?.id ?? null);
  const parts = computed<VoiceParts>(() => {
    const mine = userId.value === null ? undefined : wanted.value[userId.value];
    return mine === undefined ? NO_VOICES : { ...NO_VOICES, ...mine };
  });
  function setPart(part: VoicePart, on: boolean): void {
    const id = userId.value;
    if (id === null) return;
    wanted.value = { ...wanted.value, [id]: { ...parts.value, [part]: on } };
  }
  return { parts, setPart };
}

/** What a minute of speech costs in credits on each service, or null where it cannot speak; `on` false when voices are off. */
export interface VoiceRates {
  on: boolean;
  perMinute: { elevenlabs: number | null; inworld: number | null };
}

function isRates(raw: unknown): raw is VoiceRates {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as { on?: unknown; perMinute?: unknown };
  if (typeof r.on !== "boolean" || typeof r.perMinute !== "object" || r.perMinute === null) return false;
  const p = r.perMinute as Record<string, unknown>;
  return ["elevenlabs", "inworld"].every((k) => p[k] === null || (typeof p[k] === "number" && Number.isFinite(p[k])));
}

/**
 * What the voices cost, asked of the server once, so the player reads it before switching one on. Read once and
 * kept: the admin's prices do not change under a sitting.
 */
export function useTableVoiceRates() {
  const auth = useAuthStore();
  const userId = computed(() => auth.user?.id ?? null);
  return useQuery({
    queryKey: computed(() => ["table-voice-rates", userId.value] as const),
    queryFn: async (): Promise<VoiceRates> => {
      const { data, error } = await supabase.functions.invoke("table-voice", { body: { rates: true } });
      if (error) throw error;
      if (!isRates(data)) throw new Error("The voices' rates could not be read.");
      return data;
    },
    enabled: () => userId.value !== null,
    staleTime: Infinity,
    retry: false,
  });
}
