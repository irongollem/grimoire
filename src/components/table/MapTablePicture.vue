<template>
  <div class="relative h-dvh w-screen overflow-hidden bg-black" data-testid="table-picture">
    <BookNookPlayer v-if="nook" :scene="nook.scene" :still="nook.still_url" screen="wide" />
    <Transition :name="reduced ? '' : 'arrival'">
      <div
        v-if="titleShown && place"
        :key="place.id"
        class="pointer-events-none absolute inset-x-0 bottom-[12%] flex flex-col items-center gap-2 px-8 text-center"
        data-testid="arrival-title"
      >
        <span v-if="parent" class="text-label-lg font-semibold uppercase text-white/80 [text-shadow:0_1px_8px_rgb(0_0_0/0.8)]" data-testid="arrival-parent">{{ parent.name }}</span>
        <h1 class="font-display text-[clamp(2.5rem,6vw,5rem)] leading-none text-white [text-shadow:0_2px_16px_rgb(0_0_0/0.85)]" data-testid="arrival-name">{{ place.name }}</h1>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
/**
 * A place's living picture on the Table screen (#1142 decision 4): arriving lays the place's name over the picture
 * for a few seconds, then leaves the picture alone. It replays when the party moves to another place (the title is
 * keyed on the place id). It brings no sound of its own: the ambience is the place's, started on arrival as before.
 * With reduced motion the name shows still for the same few seconds, then is removed.
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import BookNookPlayer from "@/components/bookNook/BookNookPlayer.vue";
import { useBookNook } from "@/composables/bookNook/useBookNooks";
import { useLocation } from "@/composables/locations/useLocations";
import { prefersReducedMotion } from "@/lib/motion";

/** How long the name stays over the picture. */
const HOLD_MS = 5000;

const props = defineProps<{ placeId: string }>();

const placeId = computed(() => props.placeId);
const { data: place } = useLocation(placeId);
const parentId = computed(() => place.value?.parent_id ?? null);
const { data: parent } = useLocation(parentId);
const { data: nook } = useBookNook(computed(() => place.value?.book_nook_id ?? null));
const reduced = prefersReducedMotion();

const titleShown = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => place.value?.id,
  (id) => {
    clearTimeout(timer);
    titleShown.value = !!id;
    if (id) timer = setTimeout(() => (titleShown.value = false), HOLD_MS);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(timer));
</script>

<style scoped>
.arrival-enter-active {
  transition: opacity 1.2s ease;
}
.arrival-leave-active {
  transition: opacity 1.6s ease;
}
.arrival-enter-from,
.arrival-leave-to {
  opacity: 0;
}
</style>
