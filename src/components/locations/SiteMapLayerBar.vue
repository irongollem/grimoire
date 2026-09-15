<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <span class="flex items-center gap-1 text-label-lg font-semibold text-muted-foreground">
      <IconReveal class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      Show
    </span>

    <!--
      The two image layers first, then a hairline, then the overlays painted
      on top of them. Same bottom-up order as the Layers panel: a DM who has
      just chosen Picture and Drawing there finds them in the same sequence
      here. Each renders only when the site actually has that layer — a
      toggle for a layer that does not exist is a control with nothing behind
      it. -->
    <template v-for="image in imagePills" :key="image.key">
      <AppButton
        v-if="image.present"
        variant="outline"
        shape="pill"
        size="xs"
        :icon="image.icon"
        :label="image.label"
        :active="siteMapLayers[image.key]"
        :class="siteMapLayers[image.key] ? '' : 'opacity-50'"
        @click="toggleSiteMapLayer(image.key)"
      />
    </template>
    <span v-if="hasImageLayer" class="h-4 w-px shrink-0 bg-border" aria-hidden="true" />

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
      label="Grid"
      :active="siteMapLayers.grid"
      :class="siteMapLayers.grid ? '' : 'opacity-50'"
      @click="toggleSiteMapLayer('grid')"
    />

    <!-- Tokens/Fog (#884, wave 4, S12) — the stack's two PLAYED layers.
         Offered only where a caller says play state actually exists (a run
         surface, an encounter, Build's player preview) — never on a plain
         Browse of a site with no play state at all, which is why this whole
         group is absent unless `played.tokens`/`played.fog` says otherwise. -->
    <template v-if="hasPlayedLayer">
      <span class="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
      <AppButton
        v-if="played?.tokens"
        variant="outline"
        shape="pill"
        size="xs"
        :icon="IconParty"
        label="Tokens"
        :active="siteMapLayers.tokens"
        :class="siteMapLayers.tokens ? '' : 'opacity-50'"
        @click="toggleSiteMapLayer('tokens')"
      />
      <AppButton
        v-if="played?.fog"
        variant="outline"
        shape="pill"
        size="xs"
        :icon="IconFog"
        label="Fog"
        :active="siteMapLayers.fog"
        :class="siteMapLayers.fog ? '' : 'opacity-50'"
        @click="toggleSiteMapLayer('fog')"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * The "Show" bar above a site's map (#868, frame 03 "Map mode, for a site")
 * — which of the plan's overlays are currently PAINTED, a viewing
 * preference. Distinct from `SiteMapLayersPanel` (#884, S5), which is about
 * what the map is MADE of — Picture, Drawing, Plan — and is why this bar's
 * own header no longer says "Layers" too: the two sat one row apart with the
 * same word over both, which is exactly the ambiguity a DM reading either
 * one needed not to have. Reads and writes `useUiStore.siteMapLayers`
 * directly rather than taking a v-model: every layer flag is session UI
 * state exactly like `locationsPaneMode`, and `LocationMap.vue` forwards the
 * same store values into `MapRegionsLayer`, so there is nothing for a
 * caller-owned model to add here.
 *
 * `counts` is the only thing this component cannot derive itself — the
 * caller already has `regions`/`spaces` split by role for its own panels, so
 * asking it to count twice would be the second implementation of "how many
 * spaces does this site have" the app has learned not to grow.
 */
import { computed } from "vue";
import { storeToRefs } from "pinia";
import AppButton from "@/components/common/AppButton.vue";
import { IconBrush, IconFog, IconGrid, IconImage, IconParty, IconReveal } from "@/lib/icons";
import { useUiStore } from "@/stores/ui";

const { counts, layers, played } = defineProps<{
  counts: { spaces: number; ways: number; zones: number; prepared: number };
  /** Which image layers this site actually has (#884) — from `buildMapStack`.
   *  The caller knows; deriving it here would be a second reader of the
   *  stack for no gain. */
  layers?: { picture: boolean; drawing: boolean };
  /** Which PLAYED layers this mount of the bar should offer (#884, wave 4,
   *  S12) — Tokens and/or Fog. Unset (the default, every existing Browse
   *  caller) offers neither: Browse has no play state for either one to
   *  reflect. A caller with play state (`SiteRunSurface`, an encounter
   *  surface, Build's player preview) opts in explicitly per layer, the same
   *  way `layers.picture`/`layers.drawing` are per-layer rather than a
   *  single "has images" flag. */
  played?: { tokens?: boolean; fog?: boolean };
}>();

const uiStore = useUiStore();
const { siteMapLayers } = storeToRefs(uiStore);
const { toggleSiteMapLayer } = uiStore;

/** Swatches match the fill each layer paints on the map — `ZONE_KIND_FILL`
 *  covers terrain/hazard/light/trigger/marker individually, but the layer
 *  bar shows one dot per *layer*, not per zone kind, so these are their own
 *  short list rather than reused from `lib/locations/zones.ts`. */
/** Picture and Drawing (#884): the two image layers of the map stack. They
 *  carry an icon rather than a swatch, because they are not a colour painted
 *  over the plan — they are the picture underneath it. */
const imagePills = computed(() => [
  { key: "picture" as const, label: "Picture", icon: IconImage, present: !!layers?.picture },
  { key: "drawing" as const, label: "Drawing", icon: IconBrush, present: !!layers?.drawing },
]);
const hasImageLayer = computed(() => imagePills.value.some((p) => p.present));
const hasPlayedLayer = computed(() => !!played?.tokens || !!played?.fog);

const pills: Array<{ key: "spaces" | "ways" | "zones" | "prepared"; label: string; swatch: string }> = [
  { key: "spaces", label: "Spaces", swatch: "rgba(74, 222, 128, 0.6)" },
  { key: "ways", label: "Ways out", swatch: "#e7d9bd" },
  { key: "zones", label: "Zones", swatch: "rgba(56, 189, 248, 0.6)" },
  { key: "prepared", label: "Prepared", swatch: "#dc2626" },
];
</script>
