import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSoundTrigger } from "@/composables/soundboard/useSoundPlayback";
import { useHotkeys, type HotkeyBinding } from "@/composables/useHotkeys";
import type { Sound } from "@/types/sound.types";

/**
 * Transport shortcuts for the soundboard screen.
 *
 * The marketing copy promises "buttons you can hit without looking away from
 * the table" and then makes every one of them a mouse target on a grid that
 * scrolls. These are the keys that make that claim true for the board you are
 * actually looking at; the palette (mod+shift+K) covers firing from elsewhere.
 *
 * Number keys map to what is on screen, in the order it is on screen — after
 * the page filter, the category filter and any drag-reordering — because the
 * mapping is only useful if it matches what the DM can see.
 */

/** How many number keys map to cards. Nine is what a row of digits gives us. */
const NUMBERED_SLOTS = 9;

const VOLUME_STEP = 0.05;

/**
 * A focused button already answers to Space and Enter. Firing the transport as
 * well would mean one press doing two things, so the transport yields.
 */
function focusIsOnAControl(): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "BUTTON" || el.tagName === "A" || el.getAttribute("role") === "button";
}

export function useSoundboardHotkeys(sounds: MaybeRefOrGetter<Sound[]>): void {
  const store = useSoundboardStore();
  const trigger = useSoundTrigger();

  function fireSlot(index: number): void {
    const sound = toValue(sounds)[index];
    if (sound) trigger(sound);
  }

  const bindings = computed<HotkeyBinding[]>(() => [
    {
      combo: "space",
      description: "Pause or resume everything",
      handler: () => {
        if (focusIsOnAControl()) return;
        store.togglePauseAll();
      },
    },
    {
      combo: "x",
      description: "Stop everything",
      handler: () => store.stopAll(),
    },
    {
      combo: "m",
      description: "Mute or unmute",
      handler: () => store.toggleMute(),
    },
    {
      combo: "arrowup",
      description: "Master volume up",
      handler: () => store.adjustMasterVolume(VOLUME_STEP),
    },
    {
      combo: "arrowdown",
      description: "Master volume down",
      handler: () => store.adjustMasterVolume(-VOLUME_STEP),
    },
    {
      combo: "arrowright",
      description: "Next track",
      handler: () => store.musicPlaylistNext(),
    },
    {
      combo: "arrowleft",
      description: "Previous track",
      handler: () => store.musicPlaylistPrev(),
    },
    // One visible description for the block rather than nine identical rows in
    // the cheat sheet.
    {
      combo: "1",
      description: `Fire sounds 1–${NUMBERED_SLOTS} on this board`,
      handler: () => fireSlot(0),
    },
    ...Array.from({ length: NUMBERED_SLOTS - 1 }, (_, i) => ({
      combo: String(i + 2),
      description: `Fire sound ${i + 2}`,
      handler: () => fireSlot(i + 1),
      hidden: true,
    })),
  ]);

  useHotkeys(bindings, { layer: "page" });
}
