<template>
  <!-- A handout slid across the table: it is the player's now, and it opens in the reader. -->
  <div v-if="shown.kind === 'handout'" class="my-3 flex items-center gap-3 border border-border bg-card px-4 py-3" data-testid="solo-shown-handout">
    <component :is="IconScrollText" class="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
    <div class="flex min-w-0 flex-1 flex-col">
      <span class="text-caption uppercase tracking-wide text-muted-foreground">A handout</span>
      <span class="truncate text-label-lg font-semibold text-foreground">{{ shown.title }}</span>
    </div>
    <AppButton :to="`/play/handouts/${shown.id}`" variant="outline" size="md" label="Read it" />
  </div>

  <!-- A picture held up: the campaign's own art of who or what the party is looking at. -->
  <figure v-else class="my-3 flex flex-col items-start gap-1.5" data-testid="solo-shown-picture">
    <button
      ref="thumb"
      type="button"
      class="block max-w-full cursor-zoom-in"
      :aria-label="`Look closer at ${shown.title}`"
      @click="open"
    >
      <img :src="shown.url" :alt="shown.title" loading="lazy" class="block max-h-72 w-auto max-w-full border border-border bg-card object-contain p-1" />
    </button>
    <figcaption class="text-caption text-muted-foreground">{{ shown.title }}</figcaption>
    <ImageLightbox v-if="opened" :src="shown.url" :alt="shown.title" :origin="origin" @close="opened = false" />
  </figure>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ImageLightbox from "@/components/common/overlays/ImageLightbox.vue";
import { IconScrollText } from "@/lib/icons";
import type { Shown } from "@edge-shared/agent/show.ts";

/**
 * Something the Dungeon Master put in front of the player (#1021): a handout handed over, or a picture shown. The
 * picture's button is a bare frame around the image, with no control chrome of its own.
 */
defineProps<{ shown: Shown }>();

const thumb = ref<HTMLElement | null>(null);
const opened = ref(false);
const origin = ref<DOMRect | null>(null);
function open(): void {
  origin.value = thumb.value ? thumb.value.getBoundingClientRect() : null;
  opened.value = true;
}
</script>
