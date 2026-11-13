import { computed, hasInjectionContext, inject, type ComputedRef, type InjectionKey } from "vue";
import { useStorage, type RemovableRef } from "@vueuse/core";
import { safeLocalStorage } from "@/lib/safeLocalStorage";

/*
  Low art (#1179): this viewer's switch that sets every catalogue card, row and
  sheet for text instead of a picture. It is for the DM who does not want our
  AI art and will not upload a thousand pictures either, and so has a library
  that shows the same placeholder everywhere: with it on, a record's picture is
  not drawn (or fetched) and the layouts that led with it are set as catalogue
  entries instead.

  It touches only a picture that belongs to a record. A surface that *is* its
  picture (a battle map, a token, a Book Nook, a handout, the gallery, a mini)
  has no placeholder to replace and is left alone; `FocalImage` hides only what
  its caller marks as a record's picture.

  A viewer's own choice, kept per device like the AI-label switch beside it
  (`useAiLabelPrefs`), and over `safeLocalStorage()` for the same reason: the
  cards that read it are on nearly every screen, so a throw while this module
  evaluates would stop lists loading. Off unless turned on.
*/
const LOW_ART_KEY = "grimoire_low_art";

/*
  Made on the first call, never while the module evaluates. The module can be
  evaluated late, through an async component (MemorialTolling loads
  MemorialCameo with defineAsyncComponent), after a test's DOM has been torn
  down; a useStorage at module scope then threw "Storage is not defined" as an
  unhandled rejection that failed a CI run whose every test had passed.
*/
let stored: RemovableRef<boolean> | null = null;
function lowArtStore(): RemovableRef<boolean> {
  stored ??= useStorage<boolean>(LOW_ART_KEY, false, safeLocalStorage(), {
    serializer: { read: (raw) => raw === "true", write: String },
  });
  return stored;
}

/**
 * Forces low art on or off for one subtree, whatever the viewer chose. For a
 * page that shows the low-art forms beside the normal ones (/dev/components);
 * flipping the viewer's own stored switch instead would leave it flipped if the
 * tab closed while the page was open.
 */
export const LOW_ART_OVERRIDE: InjectionKey<boolean> = Symbol("lowArtOverride");

/**
 * This viewer's low-art switch: `lowArt` (read-only; an override provided above
 * the caller wins) and `setLowArt`, the one way to change the viewer's choice.
 */
export function useLowArt(): { lowArt: ComputedRef<boolean>; setLowArt: (enabled: boolean) => void } {
  // Outside a component (a test, a store) there is nothing to inject from.
  const override = hasInjectionContext() ? inject(LOW_ART_OVERRIDE, null) : null;

  const store = lowArtStore();
  const lowArt = computed(() => override ?? store.value);

  /** Turns low art on or off on this device and remembers the choice. */
  function setLowArt(enabled: boolean) {
    store.value = enabled;
  }

  return { lowArt, setLowArt };
}
