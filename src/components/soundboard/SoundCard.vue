<template>
  <!-- One surface. In Arrange this wrapper is the card — border, fill and the
       category spine all live here, and the pad inside is a bare title row.
       A framed pad sitting on a differently-filled strip read as two stacked
       widgets rather than one sound. -->
  <div
    class="group flex flex-col"
    :class="
      mode === 'arrange'
        ? [
            'relative h-full overflow-hidden rounded-md border bg-card',
            isPlaying ? CATEGORY_BORDER[sound.category] : 'border-border',
          ]
        : ''
    "
  >
    <span
      v-if="mode === 'arrange'"
      class="absolute inset-y-0 inset-s-0 z-10"
      :class="[CATEGORY_SPINE[sound.category], isPlaying ? 'w-1' : 'w-0.75 opacity-75']"
    />

    <SoundPad :sound="sound" :size="padSize" :mode="mode">
      <template #key><slot name="key" /></template>
    </SoundPad>

    <!-- Pinned to the bottom, next to the transport, with the flexible
         whitespace ABOVE it. A two-line title then eats slack instead of
         growing the card, and every card in a grid row keeps one shape. -->
    <div
      v-if="mode === 'arrange'"
      class="mt-auto flex flex-col gap-2 px-2.5 pb-2 pl-3.5"
    >
      <SoundCardHeader
        :sound="sound"
        :show-delete="showDelete"
        @delete="$emit('delete', $event)"
      />

      <SoundCardSpotifyTransport v-if="isSpotify" :sound="sound" />
      <SoundCardAudioTransport v-else :sound="sound" />

      <!-- Attribution (CC-BY from the curated library, Freesound, etc.) -->
      <a
        v-if="sound.attribution"
        :href="sound.attribution_url ?? undefined"
        target="_blank"
        rel="noopener noreferrer"
        class="truncate text-caption-sm italic text-muted-foreground/70 hover:text-muted-foreground"
        :title="sound.attribution"
      >
        {{ sound.attribution }}
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
// Thin orchestrator: a fire target, plus — in Arrange — the full control
// inventory underneath it. The strip reuses SoundCardHeader and the two
// transports rather than re-implementing them, so nothing that existed before
// the redesign became unreachable.
import { onMounted } from "vue";
import SoundPad from "./SoundPad.vue";
import SoundCardHeader from "./SoundCardHeader.vue";
import SoundCardSpotifyTransport from "./SoundCardSpotifyTransport.vue";
import SoundCardAudioTransport from "./SoundCardAudioTransport.vue";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSoundPlayback } from "@/composables/useSoundPlayback";
import { CATEGORY_BORDER, CATEGORY_SPINE } from "@/lib/soundCategories";
import type { Sound, BoardMode, PadSize } from "@/types/sound.types";

const { sound, showDelete, mode = "arrange", padSize = "md" } = defineProps<{
  sound: Sound;
  showDelete?: boolean;
  mode?: BoardMode;
  padSize?: PadSize;
}>();

defineEmits<{
  (e: "delete", sound: Sound): void;
}>();

const soundboardStore = useSoundboardStore();

// "Is this card the one making noise" is the same question on both transports
// and in the command palette — see useSoundPlayback.
const { isSpotify, isPlaying } = useSoundPlayback(() => sound);

// Kick off the network fetch as soon as the card is mounted so the file is
// already buffered when the DM clicks play. Skipped for Spotify (no <audio>).
onMounted(() => {
  if (!isSpotify.value) {
    soundboardStore.warmup(sound.id, sound.file_url);
  }
});
</script>
