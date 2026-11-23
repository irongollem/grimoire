<template>
  <!-- The Familiar's face. A short loop that plays only while it is speaking, so it moves when words arrive and rests
       otherwise. Decorative: the panel's title names it, so it is hidden from assistive tech. -->
  <span class="relative inline-flex shrink-0 overflow-hidden rounded-full border border-border bg-muted" aria-hidden="true" data-testid="familiar-avatar" :data-speaking="speaking ? 'true' : 'false'">
    <video
      ref="video"
      class="size-full object-cover"
      :src="loopUrl"
      :poster="stillUrl"
      muted
      loop
      playsinline
      preload="auto"
      disablepictureinpicture
      disableremoteplayback
    />
  </span>
</template>

<script setup lang="ts">
/** The Familiar's avatar: still while it is quiet, moving while it speaks, and never moving under reduced motion. */
import { onMounted, ref, watch } from "vue";
import { prefersReducedMotion } from "@/lib/motion";
import loopUrl from "@/assets/familiar/familiar.mp4";
import stillUrl from "@/assets/familiar/familiar-still.webp";

const { speaking } = defineProps<{ speaking: boolean }>();

const video = ref<HTMLVideoElement | null>(null);

function sync() {
  const el = video.value;
  if (!el) return;
  if (speaking && !prefersReducedMotion()) {
    // A browser may refuse to play (power saving, a background tab): the still stays, which is the quiet state.
    el.play()?.catch(() => undefined);
  } else {
    el.pause();
  }
}

watch(() => speaking, sync);
onMounted(sync);
</script>
