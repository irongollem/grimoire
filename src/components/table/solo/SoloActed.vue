<template>
  <!-- "A character does: italic print under their name, a hairline in their colour, no box and no portrait." The
       mark is hollow where speech's is filled, so a deed never reads as words (Voices, 02b). -->
  <div :class="[PIGMENT_CLASS[pigment], 'flex flex-col gap-0.5 border-l border-(--voice) pl-3.5']" data-line="acted" :data-pigment="pigment">
    <span class="text-eyebrow inline-flex items-center gap-1.5 tracking-widest text-(--voice-ink)">
      <i class="size-1.5 rotate-45 border border-(--voice-ink)" aria-hidden="true" />
      {{ speaker }}
    </span>
    <p class="font-fell whitespace-pre-line text-[1.0625rem] italic leading-[1.7] text-foreground">{{ text }}</p>
  </div>
</template>

<script setup lang="ts">
import type { VoicePigment } from "@/lib/table/speakerColours";
import { PIGMENT_CLASS } from "./pigments";

defineProps<{ speaker: string; text: string; pigment: VoicePigment }>();
</script>
