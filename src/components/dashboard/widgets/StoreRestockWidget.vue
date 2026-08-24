<template>
  <DashboardWidget
    title="Shops needing stock"
    tone="caution"
    :count="rows.length > 0 ? rows.length : null"
    to="/atlas"
    action-label="Atlas →"
    :loading="isLoading"
    :empty="!isLoading && rows.length === 0"
    empty-text="Every shop has something on the shelves."
  >
    <div class="divide-y divide-border">
      <RouterLink
        v-for="row in rows"
        :key="row.locationId"
        :to="`/locations/${row.locationId}`"
        class="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30"
      >
        <p
          class="min-w-0 flex-1 truncate font-cinzel text-sm font-semibold text-foreground transition-colors group-hover:text-primary"
        >
          {{ row.name }}
        </p>
        <AppButton
          as="span"
          variant="tinted"
          :tone="row.reason === 'empty' ? 'caution' : 'neutral'"
          emphasis="soft"
          size="xs"
          class="shrink-0"
          :label="row.reason === 'empty' ? 'Empty' : `${row.stockCount} hidden`"
        />
      </RouterLink>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
/**
 * Shops the party cannot usefully walk into (#764).
 *
 * The catalogue marked this one as needing new plumbing, and it did — but a
 * composable rather than a schema change. `useStoreItems` is per-location,
 * which is right for a shop's own page and useless here: one query per shop
 * would be a request per shop in the campaign. `useStoreStockCounts` fetches
 * every stock row for a set of locations in one `in` filter, selecting only
 * the two columns this needs.
 *
 * Two states, and deliberately not "stale" — see
 * `src/lib/dashboard/storeRestock.ts` for why a days-since rule would be
 * invented rather than derived. The `hidden` state is the one worth having:
 * from the players' side a shop whose every row is invisible looks exactly
 * like an empty one, so it is precisely the case the DM believes is finished.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import DashboardWidget from "@/components/dashboard/DashboardWidget.vue";
import AppButton from "@/components/common/AppButton.vue";
import { useAllLocations } from "@/composables/useLocations";
import { useStoreStockCounts } from "@/composables/useStoreItems";
import { buildStoreRestockRows, storeLocations } from "@/lib/dashboard/storeRestock";

const { data: locations, isLoading: locationsLoading } = useAllLocations();

const shopIds = computed(() => {
  const loaded = locations.value;
  if (loaded === undefined) return [];
  return storeLocations(loaded).map((location) => location.id);
});

const { data: stock, isLoading: stockLoading } = useStoreStockCounts(shopIds);

/**
 * The stock query is `enabled` only once there are shop ids, so a campaign
 * with no shops leaves it permanently idle — `stockLoading` is false and
 * `stock` stays undefined, which would spin forever if loading were derived
 * from `stock`'s presence. Hence the `shopIds.length` clause: no shops means
 * nothing to wait for.
 */
const isLoading = computed(
  () => locationsLoading.value || (shopIds.value.length > 0 && stockLoading.value),
);

const rows = computed(() => {
  const loadedLocations = locations.value;
  if (loadedLocations === undefined) return [];
  if (shopIds.value.length === 0) return [];
  const loadedStock = stock.value;
  if (loadedStock === undefined) return [];
  return buildStoreRestockRows(loadedLocations, loadedStock);
});
</script>
