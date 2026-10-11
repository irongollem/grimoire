<template>
  <SiteMapLayerBar :counts="layerCounts" :layers="layers" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import SiteMapLayerBar from "@/components/locations/site/SiteMapLayerBar.vue";
import { useSiteMapExtras, useSiteStructure } from "@/composables/locations/useSiteStructure";
import type { LocationSummary } from "@/types/location.types";

/**
 * The Map tab's Show bar, with the tallies it needs. Its own component so the
 * prepared-material reads behind `layerCounts` (placements, traps, features,
 * puzzles, the campaign's encounters, loot) start when the Map tab is opened
 * and not when any place is selected (#972, story 11): the pane mounts this
 * only in map mode.
 */
const { location, layers } = defineProps<{
  location: LocationSummary;
  layers: { picture: boolean; drawing: boolean };
}>();

const locationRef = computed(() => location);
const structure = useSiteStructure(locationRef);
const { layerCounts } = useSiteMapExtras(locationRef, structure);
</script>
