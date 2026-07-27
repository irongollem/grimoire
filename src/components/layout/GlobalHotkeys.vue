<template>
  <SoundPalette :open="paletteOpen" @close="paletteOpen = false" />
  <HotkeyCheatSheet :open="cheatSheetOpen" @close="cheatSheetOpen = false" />
</template>

<script setup lang="ts">
// The shortcuts that work on every screen, and the two overlays they open.
//
// Mounted once in DefaultLayout rather than on the soundboard page, because the
// point of the palette is firing a sound from wherever the DM happens to be —
// the encounter they are running, the NPC they just opened — without navigating
// away from it first. Same reason the soundboard widget lives there.
import { ref } from "vue";
import SoundPalette from "@/components/soundboard/SoundPalette.vue";
import HotkeyCheatSheet from "@/components/common/HotkeyCheatSheet.vue";
import { useHotkeys } from "@/composables/useHotkeys";

const paletteOpen = ref(false);
const cheatSheetOpen = ref(false);

useHotkeys(
  [
    {
      // Not plain mod+K — GlobalSearch owns that for jumping between entities,
      // and taking it would swap one useful thing for another.
      combo: "mod+shift+k",
      description: "Fire a sound or scene",
      handler: () => {
        cheatSheetOpen.value = false;
        paletteOpen.value = true;
      },
    },
    {
      combo: "?",
      description: "Show keyboard shortcuts",
      handler: () => { cheatSheetOpen.value = !cheatSheetOpen.value; },
    },
  ],
  { layer: "global" },
);
</script>
