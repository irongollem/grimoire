<template>
  <PageHeader
    title="Cartographer"
    description="Paint tile-based battle maps; bake to Atlas locations when ready."
  >
    <template #title-suffix>
      <ManualHelpLink page="cartographer-overview" />
    </template>

    <template #actions>
      <AppButton
        v-if="ui.cartographerHasActiveFilters"
        size="md"
        variant="outline"
        label="Clear"
        collapse-label-on-mobile
        @click="ui.resetCartographerFilters"
      />
      <AppButton
        size="md"
        variant="primary"
        :icon="IconAdd"
        label="New Map"
        mobile-label="Map"
        collapse-label-on-mobile
        @click="router.push('/cartographer/new')"
      />
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <template v-else-if="maps?.length">
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <input
          v-model="ui.cartographerSearch"
          type="search"
          placeholder="Search maps…"
          class="flex-1 min-w-40 bg-card border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <p
        v-if="!filteredMaps.length"
        class="text-center text-body text-muted-foreground italic py-8"
      >
        No maps match your filter.
      </p>

      <div
        v-else
        class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
      >
        <RouterLink
          v-for="m in filteredMaps"
          :key="m.id"
          :to="`/cartographer/${m.id}`"
          class="flex flex-col rounded-lg border border-border bg-card p-3 hover:border-primary/50 transition-colors"
        >
          <div class="flex items-start justify-between gap-2 mb-1">
            <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight">
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
            {{ cellCount(m) }} {{ cellCount(m) === 1 ? "cell" : "cells" }} painted
          </p>
        </RouterLink>
      </div>
    </template>

    <EmptyState
      v-else
      title="No maps yet"
      description="Start your first dungeon — paint floors, then walls, then publish to an Atlas location."
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

import { useDungeonMaps } from "@/composables/useDungeonMaps";
import { useUiStore } from "@/stores/ui";
import type { DungeonMap } from "@/types/dungeonMap.types";

import PageHeader from "@/components/common/PageHeader.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import AppButton from "@/components/common/AppButton.vue";

const router = useRouter();
const ui = useUiStore();
const { data: maps, isLoading } = useDungeonMaps();

const filteredMaps = computed(() => {
  let list = maps.value ?? [];
  const q = ui.cartographerSearch.toLowerCase().trim();
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

function cellCount(m: DungeonMap): number {
  return (
    Object.keys(m.layers.floor ?? {}).length +
    Object.keys(m.layers.solidBlock ?? {}).length +
    Object.keys(m.layers.object ?? {}).length
  );
}
</script>
