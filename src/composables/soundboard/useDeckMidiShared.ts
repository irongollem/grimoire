import { effectScope } from "vue";
import { useDeck } from "@/composables/soundboard/useDeck";
import { useDeckMidi } from "@/composables/soundboard/useDeckMidi";

type DeckMidi = ReturnType<typeof useDeckMidi>;

let shared: DeckMidi | null = null;

/**
 * The one MIDI driver for the app (#1136). The dock keeps it alive so a
 * Launchpad works on every page, and the controller settings read and steer the
 * same connection; two drivers would both claim the device and fight over its
 * lights. Lives in a detached scope because no single component owns it.
 */
export function useDeckMidiShared(): DeckMidi {
  if (shared !== null) return shared;
  const deck = useDeck();
  const scope = effectScope(true);
  const created = scope.run(() => useDeckMidi(deck));
  if (created === undefined) throw new Error("Could not start the deck's MIDI driver");
  shared = created;
  return created;
}
