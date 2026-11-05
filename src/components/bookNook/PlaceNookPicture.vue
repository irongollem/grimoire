<template>
  <button
    v-if="nook || place.image_url"
    type="button"
    :class="[
      'relative block overflow-hidden',
      variant === 'thumb' ? 'w-14 shrink-0 rounded-md aspect-3/4' : 'w-full aspect-video',
      'cursor-zoom-in',
    ]"
    :aria-label="`Open ${place.name} full screen`"
    @click="onClick"
  >
    <template v-if="nook">
      <BookNookPlayer
        :scene="nook.scene"
        :still="nook.still_url ?? place.image_url"
        :screen="variant === 'thumb' ? 'tall' : 'wide'"
      />
    </template>
    <FocalImage
      v-else-if="place.image_url"
      :src="place.image_url"
      :alt="place.name"
      :format="variant === 'thumb' ? 'portrait' : 'landscape'"
      :focal-point="null"
      class="w-full h-full"
      ai-badge="right"
    />
  </button>
  <BookNookFullscreen
    v-if="nook"
    ref="fullscreen"
    :scene="nook.scene"
    :still="nook.still_url ?? place.image_url"
  />
</template>

<script setup lang="ts">
/**
 * A place's picture for a player: its living picture (a nook) when it shows one, else the still exactly as
 * before. Tapping a nook opens it full screen; tapping a still hands its URL to the parent's lightbox. The
 * player sees the picture, never its parts: no studio, no label (#1142, frame 09).
 *
 * `open()` is called synchronously in the click handler: opening is the tap an iPhone needs before it grants
 * the motion prompt, and anything awaited first forfeits it.
 */
import { computed, ref } from "vue";
import BookNookFullscreen from "@/components/bookNook/BookNookFullscreen.vue";
import BookNookPlayer from "@/components/bookNook/BookNookPlayer.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { usePlaceNook } from "@/composables/bookNook/usePlaceNook";

const { place, variant = "hero" } = defineProps<{
  place: { id: string; name: string; image_url: string | null; book_nook_id?: string | null };
  variant?: "hero" | "thumb";
}>();
const emit = defineEmits<{ lightbox: [src: string] }>();

const { nook } = usePlaceNook(computed(() => place));
const fullscreen = ref<InstanceType<typeof BookNookFullscreen> | null>(null);

function onClick(event: MouseEvent) {
  if (nook.value && fullscreen.value) {
    fullscreen.value.open((event.currentTarget as HTMLElement).getBoundingClientRect());
    return;
  }
  if (!nook.value && place.image_url) emit("lightbox", place.image_url);
}
</script>
