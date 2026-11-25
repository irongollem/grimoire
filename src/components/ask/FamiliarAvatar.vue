<template>
  <!-- The Familiar's face. While its voice plays and can be measured, the beak follows the sound itself: closed in the
       pauses, open on the syllables. Otherwise a short loop plays while it speaks (words arriving, a voice the browser
       will not measure) and rests on the closed beak. Decorative: the panel's title names it, so it is hidden from
       assistive tech. -->
  <span class="relative inline-flex shrink-0 overflow-hidden rounded-full border border-border bg-muted" aria-hidden="true" data-testid="familiar-avatar" :data-speaking="speaking ? 'true' : 'false'" :data-beak="following ? beak : undefined">
    <video
      v-show="!following"
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
    <img v-if="following" :src="BEAK_FRAMES[beak]" alt="" class="size-full object-cover" data-testid="familiar-beak" />
  </span>
</template>

<script setup lang="ts">
/** The Familiar's avatar: still while it is quiet, moving with its voice while it speaks, never under reduced motion. */
import { computed, onMounted, ref, watch } from "vue";
import { prefersReducedMotion } from "@/lib/motion";
import { beakFor, type Beak } from "@/composables/voices/audioMeter";
import loopUrl from "@/assets/familiar/familiar.mp4";
import stillUrl from "@/assets/familiar/familiar-still.webp";
import halfUrl from "@/assets/familiar/familiar-half.webp";
import openUrl from "@/assets/familiar/familiar-open.webp";

const { speaking, level = null } = defineProps<{
  speaking: boolean;
  /** The voice's loudness while it plays and is measured; null when there is nothing to follow. */
  level?: number | null;
}>();

// Three frames from the loop itself (0 s, 0.10 s, 0.25 s), so they sit exactly where the loop's head does.
const BEAK_FRAMES: Record<Beak, string> = { closed: stillUrl, half: halfUrl, open: openUrl };

const video = ref<HTMLVideoElement | null>(null);
const beak = ref<Beak>("closed");
/** Following the sound: a level is given and motion is allowed. */
const following = computed(() => level !== null && !prefersReducedMotion());

watch(
  () => level,
  (now) => {
    beak.value = now === null ? "closed" : beakFor(now, beak.value);
  },
);

function sync() {
  const el = video.value;
  if (!el) return;
  if (speaking && !following.value && !prefersReducedMotion()) {
    // From the loop's first frame (beak closed), so the beak opens as the sound begins rather than mid-word.
    el.currentTime = 0;
    // A browser may refuse to play (power saving, a background tab): the still stays, which is the quiet state.
    el.play()?.catch(() => undefined);
  } else {
    // At rest the beak is closed: back to the first frame, which matches the still. Pausing where the loop happened
    // to be left the beak open in silence and closed while it spoke (the maintainer: "an inexperienced muppeteer").
    el.pause();
    el.currentTime = 0;
  }
}

watch(() => [speaking, following.value] as const, sync);
onMounted(sync);
</script>
