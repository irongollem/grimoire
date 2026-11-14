<template>
  <div class="relative h-dvh w-screen overflow-hidden bg-black" data-testid="table-picture">
    <BookNookPlayer v-if="nook" :scene="nook.scene" :still="nook.still_url" screen="wide" fullscreen />
    <PlaceArrivalTitle :place-id="placeId" />
  </div>
</template>

<script setup lang="ts">
/**
 * A place's living picture on the Table screen (#1142 decision 4). The arrival title over it is
 * `PlaceArrivalTitle`. It brings no sound of its own: the ambience is the place's, started on arrival as before.
 */
import { computed } from "vue";
import BookNookPlayer from "@/components/bookNook/BookNookPlayer.vue";
import PlaceArrivalTitle from "@/components/table/PlaceArrivalTitle.vue";
import { useBookNook } from "@/composables/bookNook/useBookNooks";
import { useLocation } from "@/composables/locations/useLocations";

const props = defineProps<{ placeId: string }>();

const placeId = computed(() => props.placeId);
const { data: place } = useLocation(placeId);
const { data: nook } = useBookNook(computed(() => place.value?.book_nook_id ?? null));
</script>
