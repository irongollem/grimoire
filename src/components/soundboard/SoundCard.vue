<template>
  <div
    class="group flex flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors"
    :class="isActive ? 'border-gold-500/40 bg-gold-500/5' : ''"
  >
    <SoundCardHeader
      :sound="sound"
      :show-delete="showDelete"
      @delete="$emit('delete', $event)"
    />

    <SoundCardSpotifyTransport v-if="isSpotify" :sound="sound" />
    <SoundCardAudioTransport v-else :sound="sound" :pages="pages" />

    <!-- Attribution (Freesound CC-BY etc.) -->
    <a
      v-if="sound.attribution"
      :href="sound.attribution_url ?? undefined"
      target="_blank"
      rel="noopener noreferrer"
      class="text-caption-sm text-muted-foreground/70 hover:text-muted-foreground italic truncate"
      :title="sound.attribution"
    >
      {{ sound.attribution }}
    </a>
  </div>
</template>

<script setup lang="ts">
// Thin orchestrator: routes between the Spotify and local-audio transports
// (two genuinely distinct playback modes) and wires shared "is this card the
// one making noise right now" state. Each child owns its own layout,
// interaction, and store calls — see SoundCardHeader / SoundCardSpotifyTransport
// / SoundCardAudioTransport / SoundTrimControl.
import { onMounted } from "vue";
import SoundCardHeader from "./SoundCardHeader.vue";
import SoundCardSpotifyTransport from "./SoundCardSpotifyTransport.vue";
import SoundCardAudioTransport from "./SoundCardAudioTransport.vue";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSoundPlayback } from "@/composables/useSoundPlayback";
import type { Sound, SoundboardPage } from "@/types/sound.types";

const { sound, showDelete, pages } = defineProps<{
  sound: Sound;
  showDelete?: boolean;
  pages?: SoundboardPage[];
}>();

defineEmits<{
  (e: "delete", sound: Sound): void;
}>();

const soundboardStore = useSoundboardStore();

// "Is this card the one making noise" is the same question on both transports
// and in the command palette — see useSoundPlayback.
const { isSpotify, isPlaying: isActive } = useSoundPlayback(() => sound);

// Kick off the network fetch as soon as the card is mounted so the file is
// already buffered when the DM clicks play. Skipped for Spotify (no <audio>).
onMounted(() => {
  if (!isSpotify.value) {
    soundboardStore.warmup(sound.id, sound.file_url);
  }
});

</script>
