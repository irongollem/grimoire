<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <span class="flex items-center gap-1 text-label-lg font-semibold text-muted-foreground">
      <IconLayers class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      Layers
    </span>

    <AppButton
      v-for="pill in pills"
      :key="pill.key"
      variant="outline"
      shape="pill"
      size="xs"
      :active="siteMapLayers[pill.key]"
      :class="siteMapLayers[pill.key] ? '' : 'opacity-50'"
      @click="toggleSiteMapLayer(pill.key)"
    >
      <template #icon>
        <span class="h-2 w-2 rounded-full shrink-0" :style="{ backgroundColor: pill.swatch }" aria-hidden="true" />
      </template>
      {{ pill.label }} {{ counts[pill.key] }}
    </AppButton>

    <AppButton
      variant="outline"
      shape="pill"
      size="xs"
      :icon="IconGrid"
      :active="siteMapLayers.grid"
      :class="siteMapLayers.grid ? '' : 'opacity-50'"
      tooltip="Grid"
      aria-label="Grid"
      @click="toggleSiteMapLayer('grid')"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The layer bar above a site's map (#868, frame 03 "Map mode, for a site") —
 * which of the plan's overlays are currently painted. Reads and writes
 * `useUiStore.siteMapLayers` directly rather than taking a v-model: every
 * layer flag is session UI state exactly like `locationsPaneMode`, and
 * `LocationMap.vue` forwards the same store values into `MapRegionsLayer`,
 * so there is nothing for a caller-owned model to add here.
 *
 * `counts` is the only thing this component cannot derive itself — the
 * caller already has `regions`/`spaces` split by role for its own panels, so
 * asking it to count twice would be the second implementation of "how many
 * spaces does this site have" the app has learned not to grow.
 */
import { storeToRefs } from "pinia";
import AppButton from "@/components/common/AppButton.vue";
import { IconGrid, IconLayers } from "@/lib/icons";
import { useUiStore } from "@/stores/ui";

defineProps<{
  counts: { spaces: number; ways: number; zones: number; prepared: number };
}>();

const uiStore = useUiStore();
const { siteMapLayers } = storeToRefs(uiStore);
const { toggleSiteMapLayer } = uiStore;

/** Swatches match the fill each layer paints on the map — `ZONE_KIND_FILL`
 *  covers terrain/hazard/light/trigger/marker individually, but the layer
 *  bar shows one dot per *layer*, not per zone kind, so these are their own
 *  short list rather than reused from `lib/locations/zones.ts`. */
const pills: Array<{ key: "spaces" | "ways" | "zones" | "prepared"; label: string; swatch: string }> = [
  { key: "spaces", label: "Spaces", swatch: "rgba(74, 222, 128, 0.6)" },
  { key: "ways", label: "Ways out", swatch: "#e7d9bd" },
  { key: "zones", label: "Zones", swatch: "rgba(56, 189, 248, 0.6)" },
  { key: "prepared", label: "Prepared", swatch: "rgba(167, 139, 250, 0.7)" },
];
</script>
