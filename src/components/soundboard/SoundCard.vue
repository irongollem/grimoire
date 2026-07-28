<template>
  <div class="group flex flex-col">
    <!-- Perform and Arrange share the same pad; Arrange welds a control strip
         underneath it. Nothing was removed in the split — the only move is
         play/stop going up into the pad, where a DM is aiming anyway. -->
    <SoundPad :sound="sound" :size="padSize" :class="mode === 'arrange' ? 'rounded-b-none' : ''">
      <template #key><slot name="key" /></template>
    </SoundPad>

    <div
      v-if="mode === 'arrange'"
      class="flex flex-col gap-2 rounded-b-md border border-t-0 border-border bg-muted/30 px-2.5 py-2"
    >
      <SoundCardHeader
        :sound="sound"
        :show-delete="showDelete"
        @delete="$emit('delete', $event)"
      />

      <SoundCardSpotifyTransport v-if="isSpotify" :sound="sound" />
      <SoundCardAudioTransport v-else :sound="sound" :pages="pages" />

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
import type { Sound, SoundboardPage, BoardMode, PadSize } from "@/types/sound.types";

const { sound, showDelete, pages, mode = "arrange", padSize = "md" } = defineProps<{
  sound: Sound;
  showDelete?: boolean;
  pages?: SoundboardPage[];
  mode?: BoardMode;
  padSize?: PadSize;
}>();

defineEmits<{
  (e: "delete", sound: Sound): void;
}>();

const soundboardStore = useSoundboardStore();

// "Is this card the one making noise" is the same question on both transports
// and in the command palette — see useSoundPlayback.
const { isSpotify } = useSoundPlayback(() => sound);

// Kick off the network fetch as soon as the card is mounted so the file is
// already buffered when the DM clicks play. Skipped for Spotify (no <audio>).
onMounted(() => {
  if (!isSpotify.value) {
    soundboardStore.warmup(sound.id, sound.file_url);
  }
});
</script>
