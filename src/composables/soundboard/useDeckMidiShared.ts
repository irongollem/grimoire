import { effectScope } from "vue";
import { useDeck } from "@/composables/soundboard/useDeck";
import { useDeckMidi } from "@/composables/soundboard/useDeckMidi";
import { safeLocalStorage } from "@/lib/safeLocalStorage";

type DeckMidi = ReturnType<typeof useDeckMidi>;

/** Set once a connect succeeded; cleared by an explicit disconnect. */
export const MIDI_REMEMBERED_KEY = "grimoire.deckMidi.remembered.v1";

let shared: DeckMidi | null = null;

function remember(on: boolean) {
  try {
    if (on) safeLocalStorage().setItem(MIDI_REMEMBERED_KEY, "1");
    else safeLocalStorage().removeItem(MIDI_REMEMBERED_KEY);
  } catch {
    // Full quota: the DM just connects by hand next time.
  }
}

function isRemembered(): boolean {
  try {
    return safeLocalStorage().getItem(MIDI_REMEMBERED_KEY) === "1";
  } catch {
    return false;
  }
}

/** True only when the browser already granted sysex MIDI, so connecting cannot prompt. */
async function midiAlreadyGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: "midi", sysex: true } as PermissionDescriptor);
    return status.state === "granted";
  } catch {
    // Not every browser can answer this query; then we never reconnect unprompted.
    return false;
  }
}

/**
 * The one MIDI driver for the app (#1136). The dock keeps it alive so a
 * Launchpad works on every page, and the controller settings read and steer the
 * same connection; two drivers would both claim the device and fight over its
 * lights. Lives in a detached scope because no single component owns it.
 *
 * It reconnects by itself on a later load, but only when a connect succeeded
 * before AND the browser already holds the permission: no prompt ever appears
 * unasked. Disconnecting on purpose forgets it. (A page hide disconnects inside
 * the driver and deliberately does not forget.)
 */
export function useDeckMidiShared(): DeckMidi {
  if (shared !== null) return shared;
  const deck = useDeck();
  const scope = effectScope(true);
  const created = scope.run(() => useDeckMidi(deck));
  if (created === undefined) throw new Error("Could not start the deck's MIDI driver");

  const wrapped: DeckMidi = {
    ...created,
    async connect() {
      await created.connect();
      if (created.support.value === "granted") remember(true);
    },
    disconnect() {
      created.disconnect();
      remember(false);
    },
  };
  shared = wrapped;

  if (isRemembered() && created.support.value !== "unsupported") {
    void midiAlreadyGranted().then((granted) => {
      if (granted) void wrapped.connect();
    });
  }
  return wrapped;
}

/** Test seam: forget the singleton. */
export function resetDeckMidiSharedForTests() {
  shared = null;
}
