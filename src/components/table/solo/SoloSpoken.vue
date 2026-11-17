<template>
  <!-- "A character says: print in a box in their colour, upright, beside their portrait when they have art."
       The name is always there and the mark is filled, so colour is never the only clue (Voices, 02b). -->
  <div
    :class="[
      PIGMENT_CLASS[pigment],
      'border-l-4 border-(--voice) bg-[color-mix(in_srgb,var(--voice)_7%,transparent)] px-3.5 pt-2.5 pb-3',
      portrait ? 'grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-1' : 'flex flex-col gap-1',
    ]"
    data-line="spoken"
    :data-pigment="pigment"
  >
    <SoloPortrait v-if="portrait" :name="speaker" :src="portrait.src" :focal-point="portrait.focalPoint" />
    <span class="text-eyebrow inline-flex items-center gap-1.5 text-(--voice-ink)">
      <i class="size-1.5 rotate-45 bg-(--voice-ink)" aria-hidden="true" />
      {{ speaker }}<span v-if="to" class="font-normal normal-case tracking-normal text-muted-foreground"> to {{ to }}</span>
    </span>
    <p class="font-fell whitespace-pre-line text-[1.0625rem] leading-[1.7] text-foreground">{{ `“${text}”` }}</p>
  </div>
</template>

<script setup lang="ts">
import type { VoicePigment } from "@/lib/table/speakerColours";
import SoloPortrait from "./SoloPortrait.vue";
import { PIGMENT_CLASS } from "./pigments";

const { speaker, text, pigment, to, portrait } = defineProps<{
  speaker: string;
  text: string;
  pigment: VoicePigment;
  to?: string;
  /** Only a character with art gets a plate; no art, no plate. */
  portrait?: { src: string; focalPoint: { x: number; y: number } | null } | null;
}>();
</script>
