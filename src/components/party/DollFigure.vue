<template>
  <div class="relative aspect-1/2 select-none">
    <div class="pointer-events-none absolute inset-0" :style="{ transform: shiftTransform(picture.shift) }">
      <div class="absolute top-0 h-full overflow-hidden" :style="styles.window">
        <img
          v-show="!failed"
          :src="picture.url"
          :alt="alt"
          draggable="false"
          decoding="async"
          class="absolute top-0 h-full max-w-none"
          :style="styles.image"
          @error="failed = true"
        />
      </div>
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * One paper-doll picture in a box the size of one 512x1024 cell: the columns of
 * its sheet that belong to this figure (the sheet's cuts fall in the gaps
 * between figures, so they may reach a little past the box), moved by the
 * cell's drift correction.
 */
import { computed, ref, watch } from "vue";
import { pictureStyles, shiftTransform, type DollPicture } from "@/lib/paperDoll/dollStack";

const { picture, alt } = defineProps<{
  picture: DollPicture;
  /** The figure's description for assistive tech. */
  alt: string;
}>();

const styles = computed(() => pictureStyles(picture));

// A sheet that fails to load (the template art not yet published, a CDN miss)
// leaves the box empty rather than showing a broken-image icon; a new picture
// gets a fresh try.
const failed = ref(false);
watch(() => picture.url, () => (failed.value = false));
</script>
