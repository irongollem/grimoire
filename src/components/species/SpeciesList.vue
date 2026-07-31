<template>
  <div>
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <!-- Nothing to pick: the DM disabled every species for this campaign. The
         codex CTA below is DM-only, so select mode gets its own message. -->
    <EmptyState
      v-else-if="!filtered.length && !ui.speciesHasActiveFilters && selectMode"
      title="No species available"
      description="Your DM hasn't enabled any species for this campaign yet."
    />

    <EmptyState
      v-else-if="!filtered.length && !ui.speciesHasActiveFilters"
      title="No species yet"
      description="Build your own or import from Open5e."
    >
      <template #action>
        <RouterLink
          to="/species/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          Add your first species
        </RouterLink>
      </template>
    </EmptyState>

    <p
      v-else-if="!filtered.length"
      class="text-center text-body text-muted-foreground italic py-12"
    >
      No species match your filters.
    </p>

    <div
      v-else
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
    >
      <div
        v-for="s in visibleItems"
        :key="s.id"
        class="group relative flex flex-col rounded-lg border bg-card transition-colors overflow-hidden"
        :class="[
          selectMode ? 'cursor-pointer' : '',
          selectedId && s.id === selectedId
            ? 'border-primary ring-1 ring-primary/20'
            : 'border-border hover:border-primary/50',
        ]"
      >
        <!-- Card link / select overlay -->
        <RouterLink v-if="!selectMode" :to="`/species/${s.id}`" class="absolute inset-0 z-2" />
        <button v-else type="button" class="absolute inset-0 z-2" @click="emit('select', s)" />

        <!-- Selected badge -->
        <div
          v-if="selectedId && s.id === selectedId"
          class="absolute top-2 right-2 z-10 flex items-center justify-center size-5 rounded-full bg-primary text-primary-foreground"
        >
          <IconCheck class="size-3" />
        </div>

        <!-- Portrait / placeholder -->
        <div class="relative h-36 bg-muted overflow-hidden shrink-0">
          <FocalImage
            v-if="s.image_url"
            :src="s.image_url"
            :alt="s.name"
            format="landscape"
            :focal-point="s.focal_point"
            class="group-hover:scale-105 transition-transform duration-300"
          />
          <div
            v-else
            class="w-full h-full flex items-center justify-center text-display font-bold text-primary/30"
          >
            {{ s.name.charAt(0).toUpperCase() }}
          </div>
        </div>

        <div class="p-3 flex flex-col gap-2 flex-1">
          <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight line-clamp-1">
            {{ s.name }}
          </h3>

          <p class="text-caption text-muted-foreground italic capitalize">
            {{ s.size ?? "—" }}
            <span v-if="s.speed?.walk"> · {{ s.speed.walk }} ft</span>
          </p>

          <p v-if="s.source" class="text-label text-muted-foreground">
            {{ s.source }}
          </p>

          <!-- Tags -->
          <div v-if="s.tags.length" class="flex flex-wrap gap-1 mt-auto">
            <span
              v-for="tag in s.tags.slice(0, 3)"
              :key="tag"
              class="px-1.5 py-0.5 rounded bg-muted text-label text-muted-foreground"
            >
              {{ tag }}
            </span>
          </div>

          <!-- Select button (shown in selectMode) -->
          <button
            v-if="selectMode"
            type="button"
            class="relative z-10 mt-2 w-full rounded-md border border-primary/60 bg-primary/10 px-3 py-1.5 font-cinzel text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
            @click.stop="emit('select', s)"
          >
            Select
          </button>
        </div>

        <!-- Edit button — DM mode only, not shown for srd (shared) species cards -->
        <RouterLink
          v-if="!readonly && !selectMode && isUuid(s.id)"
          :to="`/species/${s.id}?edit=true`"
          class="absolute top-2 left-2 z-10 flex items-center justify-center gap-1 rounded max-md:min-h-11 max-md:px-3 max-md:py-2 px-2 py-1 text-label font-semibold text-white bg-black/50 hover:bg-black/70 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity"
          title="Edit species"
        >
          <IconEdit class="max-md:h-4 max-md:w-4 h-3 w-3" />
          Edit
        </RouterLink>
      </div>
    </div>

    <div ref="sentinelRef" />

    <p
      v-if="filtered.length"
      class="mt-4 text-caption text-muted-foreground italic text-right"
    >
      {{ filtered.length }} species
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconCheck, IconEdit } from '@/lib/icons';
import type { Species } from "@/types/species.types";
import { useUiStore } from "@/stores/ui";
import { useCampaignSpecies } from "@/composables/useSpecies";
import { isUuid } from "@/lib/library/contentIdentity";
import { useInfiniteScroll } from "@/composables/useInfiniteScroll";
import { useScrollRestore } from "@/composables/useScrollRestore";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import FocalImage from "@/components/common/FocalImage.vue";

const { selectMode } = defineProps<{ readonly?: boolean; selectMode?: boolean; selectedId?: string }>();
const emit = defineEmits<{ select: [species: Species] }>();

const ui = useUiStore();
// Picking (select mode) obeys the campaign's blocklist; browsing the codex does
// not — the DM still needs to open and edit a species they switched off (#566).
const { data: campaignSpecies, all: allSpecies, isLoading } = useCampaignSpecies();

const filtered = computed(() => {
  let list = selectMode ? campaignSpecies.value : (allSpecies.value ?? []);

  if (ui.speciesFilterSize !== "all") {
    list = list.filter((s) => s.size === ui.speciesFilterSize);
  }

  if (ui.speciesFilterSource !== "all") {
    const q = ui.speciesFilterSource.toLowerCase();
    list = list.filter((s) => s.source?.toLowerCase().includes(q));
  }

  if (ui.speciesSearch.trim()) {
    const q = ui.speciesSearch.trim().toLowerCase();
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.source?.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  return list;
});

const { savedCount, linkCount } = useScrollRestore("species");
const { visibleItems, sentinelRef, visibleCount } = useInfiniteScroll(filtered, 48, savedCount);
linkCount(visibleCount);
</script>
