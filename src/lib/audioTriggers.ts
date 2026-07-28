import type { AudioSlot } from "@/lib/audioThemes";

/**
 * The bus between "something happened in the campaign" and "the soundboard
 * might want to react".
 *
 * Deliberately an event bus rather than a direct store call. Combat should not
 * import the soundboard: the encounter runner has no idea which playlists exist
 * or whether the DM has themed audio switched on, and giving it that knowledge
 * would mean every future producer — locations, sessions, the calendar — grew
 * the same dependency. Producers say what happened; the soundboard decides
 * whether that means anything.
 */

/**
 * What kind of thing asked for audio.
 *
 * Carried explicitly rather than parsed back out of the `sourceId` prefix: the
 * UI says "Started by encounter: Goblin ambush", and deriving that from a
 * string convention would break silently the first time a producer chose a
 * different prefix.
 */
export type AudioTriggerKind = "encounter" | "location";

export interface AudioThemeRequest {
  /**
   * Who is asking. A release only takes effect when it comes from whoever
   * currently owns the slot, so ending a stale encounter cannot cut the music
   * a newer one started.
   */
  sourceId: string;
  /** Free-text label, matched against playlist and sound tags. */
  theme: string;
  slot: AudioSlot;
  /** Human-readable origin, for the "playing because of…" note in the UI. */
  label: string;
  kind: AudioTriggerKind;
}

export type AudioTriggerEvent =
  | { type: "request"; request: AudioThemeRequest }
  | { type: "release"; sourceId: string };

type Handler = (event: AudioTriggerEvent) => void;

const handlers = new Set<Handler>();

/**
 * Subscribe. Returns its own unsubscribe rather than relying on the caller to
 * hold onto the function reference.
 */
export function onAudioTrigger(handler: Handler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

function emit(event: AudioTriggerEvent): void {
  // Iterate a copy: a handler that unsubscribes itself while reacting would
  // otherwise mutate the set mid-iteration.
  [...handlers].forEach((handler) => handler(event));
}

/** "This encounter went live and wants battle music, if you have any." */
export function requestAudioTheme(request: AudioThemeRequest): void {
  if (request.theme.trim() === "") return;
  emit({ type: "request", request });
}

/** "That encounter ended." Whether anything stops is the soundboard's call. */
export function releaseAudioTheme(sourceId: string): void {
  emit({ type: "release", sourceId });
}

/** Test seam — production code never needs this. */
export function clearAudioTriggerHandlers(): void {
  handlers.clear();
}
