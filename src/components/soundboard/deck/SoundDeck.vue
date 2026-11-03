<template>
  <!-- On /soundboard the builder shows the deck itself; this host stays mounted so keys and MIDI keep working. -->
  <template v-if="visible">
    <DeckPhoneSheet v-if="isBarNav" :empty="empty" />
    <DeckDock v-else :empty="empty" />
  </template>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDeck } from "@/composables/soundboard/useDeck";
import { useDeckHotkeys } from "@/composables/soundboard/useDeckHotkeys";
import { useDeckMidiShared } from "@/composables/soundboard/useDeckMidiShared";
import { nextDeckSize } from "@/composables/soundboard/useDeckPeek";
import { useDeckPads } from "@/composables/soundboard/useDeckPads";
import { useSounds } from "@/composables/soundboard/useSounds";
import { useHotkeys } from "@/composables/useHotkeys";
import { useIsBarNav } from "@/composables/useBreakpoint";
import type { DeckAction } from "@/lib/audio/deck/deckSurface";
import { useAppUiStore } from "@/stores/ui/app";
import { useSoundboardUiStore } from "@/stores/ui/soundboard";
import DeckDock from "./DeckDock.vue";
import DeckPhoneSheet from "./DeckPhoneSheet.vue";

/**
 * The deck's host (#1136), mounted once in the DM layout. It owns everything
 * that must exist exactly once (the keyboard, the MIDI driver, the Simple or
 * Full settling, the Edit tool's hand-off to the builder) and draws the dock on
 * a desktop or the sheet on a phone. DMs only: the layout decides who gets it.
 */

const deck = useDeck();
const ui = useSoundboardUiStore();
const app = useAppUiStore();
const route = useRoute();
const router = useRouter();
const isBarNav = useIsBarNav();

// The builder draws the deck itself, and an editor that owns the screen wants
// all of it; a phone takeover route owns its own bottom edge too.
const onBoard = computed(() => route.path.startsWith("/soundboard"));
const visible = computed(
  () => !onBoard.value && !app.editorFocus && !(isBarNav.value && route.meta.fullscreenMobile === true),
);

// A key 1 to 8 reaches for the deck, so it peeks like a hand on its edge would.
useDeckHotkeys({
  dispatch(action: DeckAction) {
    if (action.type === "press" && action.row === 0) ui.requestDeckPeek();
    deck.dispatch(action);
  },
});
useDeckMidiShared();

useHotkeys(
  [
    {
      combo: "d",
      description: "Cycle the deck: tucked, row, deck, full",
      handler: () => {
        ui.deckSize = nextDeckSize(ui.deckSize);
      },
    },
  ],
  { layer: "global", enabled: () => !onBoard.value },
);

// Simple or Full is settled once, from whether the campaign already had sounds.
const sounds = useSounds();
let settled = false;
watch(
  () => sounds.data.value,
  (rows) => {
    if (settled || rows === undefined) return;
    settled = true;
    ui.settleDeckControls(rows.length > 0);
  },
  { immediate: true },
);

const pads = useDeckPads();
const empty = computed(() => pads.data.value !== undefined && pads.data.value.length === 0);

// The Edit tool asks; the builder opens that pad's settings. On /soundboard the
// builder is already showing and answers the request itself, so the dock stays
// out of it: two consumers would race (one clearing it before the other saw it).
watch(
  () => deck.editRequest.value,
  (request) => {
    if (request === null || onBoard.value) return;
    deck.clearEditRequest();
    void router.push({ path: "/soundboard", query: { pad: request.padId } });
  },
  { immediate: true },
);
</script>
