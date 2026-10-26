import { computed, type ComputedRef } from "vue";
import { useSoundboardStore } from "@/stores/soundboard";
import { isBroadcasting } from "./useSoundboardBroadcast";

/**
 * Is audio leaving this device right now: shared with remote players, or cast
 * to a speaker?
 *
 * Spotify never goes along (Spotify's Developer Policy, III.4, forbids playing
 * it to several listeners; both paths mirror Grimoire's own music playlist), so
 * while this is true every Spotify control is dimmed and carries the (i) note.
 * While it is false, "plays on this device only" is true of everything and
 * would say nothing.
 *
 * Both are read as bare flags, because every pad on the board calls this:
 * `useSoundboardBroadcast()` registers a push watcher per call, and `useCast()`
 * can load Google's SDK just by being called.
 */
export function useAudioSharing(): ComputedRef<boolean> {
  const store = useSoundboardStore();
  return computed(() => isBroadcasting.value || store.isCasting);
}
