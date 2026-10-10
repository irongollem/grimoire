<template>
  <div>
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <!-- A reader (a player choosing a background, or a non-DM in the Codex)
         cannot add one, so pointing them at /backgrounds/new sent them to a
         DM route. -->
    <EmptyState
      v-else-if="!filtered.length && !ui.backgroundsHasActiveFilters && readonly"
      title="No backgrounds available"
      description="Your DM hasn't added any backgrounds to this campaign yet."
    />

    <EmptyState
      v-else-if="!filtered.length && !ui.backgroundsHasActiveFilters"
      title="No backgrounds yet"
      description="Build your own."
    >
      <template #action>
        <AppButton variant="primary" size="lg" to="/backgrounds/new" label="Add your first background" />
      </template>
    </EmptyState>

    <p
      v-else-if="!filtered.length"
      class="text-center text-body text-muted-foreground italic py-12"
    >
      No backgrounds match your filters.
    </p>

    <VirtualGrid
      v-else
      :items="filtered"
      :item-key="backgroundKey"
      :columns="columns"
      :estimate-row-height="GRID_ROW_PX"
    >
      <template #default="{ item: b }">
      <div
        class="group relative flex flex-col rounded-lg border bg-card transition-colors overflow-hidden"
        :class="[
          selectMode ? 'cursor-pointer' : '',
          selectedId && b.id === selectedId
            ? 'border-primary ring-1 ring-primary/20'
            : 'border-border hover:border-primary/50',
        ]"
      >
        <!-- Card link / select overlay -->
        <RouterLink v-if="!selectMode" :to="`/backgrounds/${b.id}`" class="absolute inset-0 z-2" />
        <button v-else type="button" class="absolute inset-0 z-2" @click="emit('select', b)" />

        <!-- Selected badge -->
        <div
          v-if="selectedId && b.id === selectedId"
          class="absolute top-2 right-2 z-10 flex items-center justify-center size-5 rounded-full bg-primary text-primary-foreground"
        >
          <IconCheck class="size-3" />
        </div>

        <!-- Header / portrait -->
        <div class="relative h-24 bg-muted overflow-hidden shrink-0">
          <FocalImage
            :src="b.image_url"
            :alt="b.name"
            format="landscape"
            :focal-point="b.focal_point"
            :placeholder="placeholderUrl('background')"
            class="group-hover:scale-105 transition-transform duration-300"
          />
          <!-- A sibling of the image, not FocalImage's own label: the image scales on hover,
               and a transformed element keeps the chip under the card's z-2 link exactly while
               the pointer is over the card, which hides the tooltip that names the model. -->
          <AiImageBadge :src="b.image_url" corner="right" class="z-10" />
        </div>

        <div class="p-3 flex flex-col gap-1.5 flex-1">
          <h3 class="text-heading-xs font-bold text-foreground leading-tight line-clamp-1">
            {{ b.name }}
          </h3>

          <p
            v-if="b.feature_name"
            class="text-caption italic text-muted-foreground line-clamp-1"
            :title="b.feature_name"
          >
            {{ b.feature_name }}
          </p>

          <!--
            Proficiencies summary. Combines skills + tools + languages into a
            compact inline list so cards stay tight; full details live on the
            detail page.
          -->
          <p
            v-if="profsSummary(b)"
            class="text-caption text-foreground/70 line-clamp-2"
          >
            {{ profsSummary(b) }}
          </p>

          <div class="flex items-center gap-1.5 mt-auto pt-1.5">
            <span
              v-if="b.source_title || b.source"
              class="text-label text-muted-foreground truncate"
              :title="b.source_title ?? b.source ?? ''"
            >
              {{ b.source_title ?? b.source }}
            </span>
          </div>

          <div v-if="b.tags.length" class="flex flex-wrap gap-1">
            <span
              v-for="tag in b.tags.slice(0, 3)"
              :key="tag"
              class="px-1.5 py-0.5 rounded bg-muted text-label text-muted-foreground"
            >
              {{ tag }}
            </span>
          </div>

          <!-- Select button (shown in selectMode) -->
          <AppButton
            v-if="selectMode"
            variant="tinted"
            tone="primary"
            emphasis="soft"
            size="sm"
            block
            class="relative z-10 mt-2"
            label="Select"
            @click.stop="emit('select', b)"
          />
        </div>

        <!-- Edit button (top-left on hover, same pattern as Species) -->
        <RouterLink
          v-if="!readonly && !selectMode && !isLibraryBackground(b)"
          :to="`/backgrounds/${b.id}?edit=true`"
          class="absolute top-2 left-2 z-10 flex items-center justify-center gap-1 rounded max-md:min-h-11 max-md:px-3 max-md:py-2 px-2 py-1 text-label font-semibold text-white bg-black/50 hover:bg-black/70 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity"
          title="Edit background"
        >
          <IconEdit class="max-md:h-4 max-md:w-4 h-3 w-3" />
          Edit
        </RouterLink>
      </div>
      </template>
    </VirtualGrid>

    <p
      v-if="filtered.length"
      class="mt-4 text-caption text-muted-foreground italic text-right"
    >
      {{ filtered.length }} background{{ filtered.length === 1 ? "" : "s" }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconCheck, IconEdit } from '@/lib/icons';
import { useUiStore } from "@/stores/ui";
import { isLibraryBackground, useBackgrounds } from "@/composables/rules/useBackgrounds";
import { useScrollRestore } from "@/composables/useScrollRestore";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import VirtualGrid from "@/components/common/VirtualGrid.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import AiImageBadge from "@/components/common/AiImageBadge.vue";
import AppButton from "@/components/common/AppButton.vue";
import type { Background } from "@/types/background.types";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";

defineProps<{ readonly?: boolean; selectMode?: boolean; selectedId?: string }>();
const emit = defineEmits<{ select: [bg: Background] }>();

const ui = useUiStore();
const { data: backgrounds, isLoading } = useBackgrounds();

function profsSummary(b: Background): string {
  const parts: string[] = [];
  if (b.skill_proficiencies.length) parts.push(b.skill_proficiencies.join(", "));
  if (b.tool_proficiencies.length) parts.push(b.tool_proficiencies.join(", "));
  if (b.languages.length) {
    parts.push(b.languages.length === 1 ? b.languages[0] : `${b.languages.length} languages`);
  }
  return parts.join(" · ");
}

const filtered = computed(() => {
  let list = backgrounds.value ?? [];

  if (ui.backgroundsFilterSource === "custom") {
    list = list.filter((b) => !isLibraryBackground(b));
  } else if (ui.backgroundsFilterSource === "library") {
    list = list.filter((b) => isLibraryBackground(b));
  }

  if (ui.backgroundsSearch.trim()) {
    const q = ui.backgroundsSearch.trim().toLowerCase();
    list = list.filter((b) => {
      if (b.name.toLowerCase().includes(q)) return true;
      if (b.source?.toLowerCase().includes(q)) return true;
      if (b.feature_name?.toLowerCase().includes(q)) return true;
      if (b.tags.some((t) => t.toLowerCase().includes(q))) return true;
      if (b.skill_proficiencies.some((s) => s.toLowerCase().includes(q))) return true;
      return false;
    });
  }

  return list;
});

// The whole filtered list is in hand, so only the scroll position needs
// restoring; VirtualGrid windows what is mounted.
useScrollRestore("backgrounds");

// Mirrors the grid classes this list used to carry:
// `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3`.
const columns = useBreakpointColumns({ base: 1, sm: 2, lg: 3, xl: 4 });
const backgroundKey = (background: Background) => background.id;

// Row height before a row is measured (px): 206px measured at a 390px
// phone, 8 Oct 2026. It decides where a restored scroll lands, since coming
// back from a detail re-renders every unmeasured row above the viewport.
const GRID_ROW_PX = 206;
</script>
