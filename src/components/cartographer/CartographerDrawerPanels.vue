<template>
  <CartographerDrawer :open="drawer !== null" :title="title" @close="emit('close')">
    <div v-if="drawer === 'zoning' && site" class="flex flex-col gap-3">
      <ZoningList
        :entries="plan.zoning.value"
        :spaces="spaces ?? []"
        :active-region-id="plan.activeRegionId.value"
        :found-count="plan.foundCount.value"
        :has-drawing="cellsPainted > 0"
        @find-again="plan.findAgainNow()"
        @pick-zone-tool="plan.planTool.value = 'zone'"
        @rename="(entry, label) => plan.renameEntry(entry, label)"
        @bind="(entry, spaceId) => plan.bindEntry(entry, spaceId)"
        @reshape="(entry) => emit('reshape', entry)"
        @removed="(id) => { if (plan.activeRegionId.value === id) plan.activeRegionId.value = null; }"
      />
      <SiteWaysOutPanel :site-id="site.id" :spaces="spaces ?? []" :editable="true" />
    </div>
    <CartographerPlaceCatalog
      v-else-if="drawer === 'place'"
      :item="placeItem"
      :runtime="runtime"
      :set-name="packLabel"
      :recent="recent"
      @pick="(item) => emit('pick', item)"
    />
  </CartographerDrawer>
</template>

<script setup lang="ts">
// The one drawer over the canvas's right edge: Zoning's list (with the site's ways out) or the Place
// catalogue. Which one is open is the workbench's state; this draws it. Split out of MapWorkbench.vue (#1135).
import CartographerDrawer from "@/components/cartographer/CartographerDrawer.vue";
import CartographerPlaceCatalog from "@/components/cartographer/CartographerPlaceCatalog.vue";
import ZoningList from "@/components/locations/site/ZoningList.vue";
import SiteWaysOutPanel from "@/components/locations/site/SiteWaysOutPanel.vue";
import type { PlaceItem } from "@/cartographer/tools";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { usePlanPalette } from "@/composables/cartographer/usePlanPalette";
import type { BindableSpace } from "@/types/locationMapRegion.types";
import type { ZoningEntry } from "@/lib/locations/foundRooms";
import type { LocationType } from "@/types/location.types";

defineProps<{
  drawer: "place" | "zoning" | null;
  title: string;
  site?: { id: string };
  spaces?: (BindableSpace & { location_type: LocationType })[];
  plan: ReturnType<typeof usePlanPalette>;
  cellsPainted: number;
  placeItem: PlaceItem | null;
  runtime: TilePackRuntime | null;
  packLabel: string;
  recent: PlaceItem[];
}>();
const emit = defineEmits<{
  close: [];
  reshape: [entry: ZoningEntry];
  pick: [item: PlaceItem];
}>();
</script>
