import { computed, type ComputedRef } from "vue";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSoundboardBroadcast } from "./useSoundboardBroadcast";

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
 * Cast is read from the store's flag rather than through `useCast()`, which can
 * load Google's SDK just by being called.
 */
export function useAudioSharing(): ComputedRef<boolean> {
  const { broadcasting } = useSoundboardBroadcast();
  const store = useSoundboardStore();
  return computed(() => broadcasting.value || store.isCasting);
}
