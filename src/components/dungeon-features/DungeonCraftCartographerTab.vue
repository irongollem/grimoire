<template>
  <div v-if="cartographerMapsLoading" class="flex justify-center py-16">
    <LoadingSpinner />
  </div>
  <template v-else-if="cartographerMaps?.length">
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      <RouterLink
        v-for="m in cartographerMaps"
        :key="m.id"
        :to="`/cartographer/${m.id}`"
        class="flex flex-col rounded-lg border border-border bg-card p-3 hover:border-primary/50 transition-colors"
      >
        <div class="flex items-start justify-between gap-2 mb-1">
          <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight">{{ m.name }}</h3>
          <span v-if="m.default_pack_id" class="font-cinzel text-2xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold tracking-wider shrink-0">
            {{ m.default_pack_id }}
          </span>
        </div>
        <p v-if="m.description" class="font-fell text-xs text-muted-foreground italic line-clamp-2">{{ m.description }}</p>
        <p class="font-fell text-2xs text-muted-foreground mt-2">
          {{ cellCount(m) }} {{ cellCount(m) === 1 ? "cell" : "cells" }} painted
        </p>
      </RouterLink>
    </div>
  </template>
  <EmptyState
    v-else
    icon="Map"
    title="No maps yet"
    description="Open Cartographer to paint your first tile-based battle map."
    action-label="New Map"
    @action="router.push('/cartographer/new')"
  />
</template>

<script setup lang="ts">
import { RouterLink, useRouter } from "vue-router";
import { useDungeonMaps } from "@/composables/useDungeonMaps";
import type { DungeonMap } from "@/types/dungeonMap.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";

const router = useRouter();
const { data: cartographerMaps, isLoading: cartographerMapsLoading } = useDungeonMaps();

function cellCount(m: DungeonMap): number {
  return (
    Object.keys(m.layers.floor ?? {}).length +
    Object.keys(m.layers.solidBlock ?? {}).length +
    Object.keys(m.layers.object ?? {}).length
  );
}
</script>
