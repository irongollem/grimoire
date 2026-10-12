<template>
  <PageHeader
    title="Cartographer"
    description="Paint tile-based battle maps; bake to Atlas locations when ready."
  >
    <template #title-suffix>
      <ManualHelpLink page="cartographer-overview" />
    </template>

    <template #actions>
      <ListActionButton
        v-if="cartographerUi.cartographerHasActiveFilters"
        label="Clear"
        @click="cartographerUi.resetCartographerFilters"
      />
      <ListActionButton
        label="Tile Packs"
        @click="router.push('/cartographer/packs')"
      />
      <ListActionButton
        variant="primary"
        :icon="IconAdd"
        label="New Map"
        mobile-label="Map"
        @click="router.push('/cartographer/new')"
      />
      <ListLayoutToggle v-model="layout" />
    </template>

    <ListSkeleton v-if="isLoading" :variant="layout === 'grid' ? 'text' : 'tiles'" :columns="4" :count="8" />

    <template v-else-if="maps?.length">
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <AppInput
          v-model="cartographerUi.cartographerSearch"
          type="search"
          tone="card"
          size="body"
          :block="false"
          class="flex-1 min-w-40"
          placeholder="Search maps…"
        />
      </div>

      <p
        v-if="!filteredMaps.length"
        class="text-center text-body text-muted-foreground italic py-8"
      >
        No maps match your filter.
      </p>

      <EntityCollection
        v-else
        :items="filteredMaps"
        :item-key="mapKey"
        :layout="layout"
        :grid-columns="columns"
        :grid-row-estimate="GRID_ROW_PX"
        :row-estimate="ROW_PX"
      >
        <template #card="{ item: m }">
          <RouterLink
            :to="`/cartographer/${m.id}`"
            class="flex h-full flex-col rounded-lg border border-border bg-card p-3 hover:border-primary/50 transition-colors"
          >
            <div class="flex items-start justify-between gap-2 mb-1">
              <h3 class="text-heading-sm font-bold text-foreground leading-tight">
                {{ m.name }}
              </h3>
              <span
                v-if="m.default_pack_id"
                class="text-label px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold shrink-0"
              >
                {{ m.default_pack_id }}
              </span>
            </div>
            <p
              v-if="m.description"
              class="text-caption text-muted-foreground italic line-clamp-2"
            >
              {{ m.description }}
            </p>
            <p class="text-caption-sm text-muted-foreground mt-2">
              {{ cellLabel(m) }}
            </p>
          </RouterLink>
        </template>
        <template #row="{ item: m }">
          <EntityListRow
            :to="`/cartographer/${m.id}`"
            :title="m.name"
            :subtitle="cellLabel(m)"
            :fallback-icon="IconNavCartographer"
            :tags="m.default_pack_id ? [m.default_pack_id] : []"
          />
        </template>
      </EntityCollection>
    </template>

    <EmptyState
      v-else
      title="No maps yet"
      description="Start your first dungeon: paint floors, then walls, then publish to an Atlas location."
    >
      <template #icon>
        <IconNavCartographer class="h-16 w-16" />
      </template>
      <template #action>
        <AppButton
          variant="primary"
          size="lg"
          label="Create your first map"
          @click="router.push('/cartographer/new')"
        />
      </template>
    </EmptyState>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { IconAdd, IconNavCartographer } from "@/lib/icons";

import { useDungeonMaps } from "@/composables/cartographer/useDungeonMaps";
import { useCartographerUiStore } from "@/stores/ui/cartographer";
import type { DungeonMap } from "@/types/dungeonMap.types";

import PageHeader from "@/components/common/list/PageHeader.vue";
import ListActionButton from "@/components/common/list/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import EntityCollection from "@/components/common/list/EntityCollection.vue";
import EntityListRow from "@/components/common/entity/EntityListRow.vue";
import ListLayoutToggle from "@/components/common/list/ListLayoutToggle.vue";
import { useListLayout } from "@/composables/useListLayout";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";

const router = useRouter();
const cartographerUi = useCartographerUiStore();
const { data: maps, isLoading } = useDungeonMaps();

// The page header's toggle writes the same key. Cards is today's look.
const layout = useListLayout("cartographer", "grid");
// Mirrors `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4`.
const columns = useBreakpointColumns({ base: 1, sm: 2, md: 3, lg: 4 });
const mapKey = (m: DungeonMap) => m.id;
// Heights in px before a card or row is measured: a card is 2 border + 24
// padding + title 24 + description 36 + count 24 = 110; a bare row is 82.
const GRID_ROW_PX = 110;
const ROW_PX = 82;

const filteredMaps = computed(() => {
  let list = maps.value ?? [];
  const q = cartographerUi.cartographerSearch.toLowerCase().trim();
  if (q) {
    list = list.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.description ?? "").toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  return list;
});

function cellLabel(m: DungeonMap): string {
  const n = cellCount(m);
  return `${n} ${n === 1 ? "cell" : "cells"} painted`;
}

function cellCount(m: DungeonMap): number {
  return (
    Object.keys(m.layers.floor ?? {}).length +
    Object.keys(m.layers.solidBlock ?? {}).length +
    Object.keys(m.layers.object ?? {}).length
  );
}
</script>
