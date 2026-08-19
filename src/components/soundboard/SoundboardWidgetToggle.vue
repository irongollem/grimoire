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
    ref="btn"
    :variant="store.widgetOpen ? 'tinted' : 'subtle'"
    tone="primary"
    emphasis="soft"
    :size="size"
    :icon="IconPopOut"
    :aria-label="store.widgetOpen ? 'Close the floating player' : 'Pop out the floating player'"
    :tooltip="store.widgetOpen ? 'Close the floating player' : 'Pop the player out into a floating window'"
    @click="toggle"
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
import { computed, ref } from "vue";
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

const btn = ref<InstanceType<typeof AppButton> | null>(null);
const store = useSoundboardStore();

/**
 * Hands the widget this button's rect so it can fly out of here.
 *
 * `$el` rather than the ref itself: AppButton forwards its real <button> through
 * reka-ui's `useForwardExpose`, so the template ref is the component. Falls
 * through to a plain toggle if the node is somehow missing — an animation is not
 * worth swallowing the click over.
 */
function toggle() {
  const el = btn.value?.$el as HTMLElement | undefined;
  const r = el?.getBoundingClientRect();
  store.toggleWidget(
    r ? { top: r.top, left: r.left, width: r.width, height: r.height } : undefined,
  );
}
const spotifyStore = useSpotifyStore();

// HTML audio sounds, plus Spotify if it is actively playing.
const totalPlaying = computed(
  () => store.activeAudioCount + (spotifyStore.isConnected && spotifyStore.isPlaying ? 1 : 0),
);
</script>
