<template>
  <!-- "A character does: italic print under their name, a hairline in their colour, no box and no portrait." The
       mark is hollow where speech's is filled, so a deed never reads as words (Voices, 02b). -->
  <div :class="[PIGMENT_CLASS[pigment], 'flex flex-col gap-0.5 border-l border-(--voice) pl-3.5']" data-line="acted" :data-pigment="pigment">
    <span class="text-eyebrow flex items-center gap-1.5 text-(--voice-ink)">
      <i class="size-1.5 rotate-45 border border-(--voice-ink)" aria-hidden="true" />
      {{ speaker }}
      <!-- A deed is told, not said: it is the narrator who reads it again. -->
      <AppButton v-if="replayable" variant="ghost" size="inline" :icon="IconVolume" aria-label="Hear the narrator tell this again" class="ml-auto" data-testid="solo-replay-deed" @click="emit('replay')" />
    </span>
    <p class="font-fell whitespace-pre-line text-base italic leading-relaxed text-foreground">{{ text }}</p>
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconVolume } from "@/lib/icons";
import type { VoicePigment } from "@/lib/table/solo/speakerColours";
import { PIGMENT_CLASS } from "./pigments";

const { replayable = false } = defineProps<{
  speaker: string;
  text: string;
  pigment: VoicePigment;
  /** The narrator's voice is on: the deed offers to be heard again. */
  replayable?: boolean;
}>();
const emit = defineEmits<{ replay: [] }>();
</script>
