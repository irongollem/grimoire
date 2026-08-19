<!--
  Opens the floating player.

  The icon is a pop-out rather than the soundboard glyph on purpose: this button
  does not navigate to the soundboard, it detaches a player into a floating
  window — and on the soundboard page itself a "go to the soundboard" glyph read
  as nothing at all.

  It is an AppButton for the same reason everything else here is. It used to be a
  hand-rolled borderless `<button>` sitting between two bordered AppButtons in the
  soundboard header, which read as an accident rather than a distinction.
-->
<template>
  <AppButton
    :variant="store.widgetOpen ? 'tinted' : 'subtle'"
    tone="primary"
    emphasis="soft"
    :size="size"
    :icon="IconPopOut"
    :aria-label="store.widgetOpen ? 'Close the floating player' : 'Pop out the floating player'"
    :tooltip="store.widgetOpen ? 'Close the floating player' : 'Pop the player out into a floating window'"
    @click="store.toggleWidget()"
  >
    <span v-if="!iconOnly">Pop out</span>
    <!--
      The count is the reason this button is worth finding when the widget is
      shut: it is the only thing on screen saying something is still audible.
    -->
    <span
      v-if="totalPlaying > 0"
      class="flex h-4 w-4 items-center justify-center rounded-full border border-gold-500/40 bg-gold-500/20 text-2xs font-cinzel text-gold-300"
    >
      {{ totalPlaying }}
    </span>
  </AppButton>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconPopOut } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import type { ButtonSize } from "@/components/common/appButtonVariants";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSpotifyStore } from "@/stores/spotify";

const { iconOnly = false, size = "sm" } = defineProps<{
  iconOnly?: boolean;
  /** The top bar runs a tighter scale than the page header. */
  size?: ButtonSize;
}>();

const store = useSoundboardStore();
const spotifyStore = useSpotifyStore();

// HTML audio sounds, plus Spotify if it is actively playing.
const totalPlaying = computed(
  () => store.activeAudioCount + (spotifyStore.isConnected && spotifyStore.isPlaying ? 1 : 0),
);
</script>
