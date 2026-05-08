<template>
  <div>
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length && !ui.backgroundsHasActiveFilters"
      title="No backgrounds yet"
      description="Build your own or import from Open5e using the button above."
    >
      <template #action>
        <RouterLink
          to="/backgrounds/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          Add your first background
        </RouterLink>
      </template>
    </EmptyState>

    <p
      v-else-if="!filtered.length"
      class="text-center font-fell text-sm text-muted-foreground italic py-12"
    >
      No backgrounds match your filters.
    </p>

    <div
      v-else
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
    >
      <div
        v-for="b in visibleItems"
        :key="b.id"
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
            placeholder="/assets/placeholders/background.webp"
            class="group-hover:scale-105 transition-transform duration-300"
          />
        </div>

        <div class="p-3 flex flex-col gap-1.5 flex-1">
          <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight line-clamp-1">
            {{ b.name }}
          </h3>

          <p
            v-if="b.feature_name"
            class="font-fell text-xs italic text-muted-foreground line-clamp-1"
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
            class="font-fell text-[11px] text-foreground/70 line-clamp-2"
          >
            {{ profsSummary(b) }}
          </p>

          <div class="flex items-center gap-1.5 mt-auto pt-1.5">
            <span
              v-if="b.source_title || b.source"
              class="font-cinzel text-[10px] text-muted-foreground tracking-wider truncate"
              :title="b.source_title ?? b.source ?? ''"
            >
              {{ b.source_title ?? b.source }}
            </span>
            <span
              v-if="b.open5e_import"
              class="ml-auto shrink-0 font-cinzel text-[9px] tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
              title="Imported from Open5e"
            >
              OPEN5E
            </span>
          </div>

          <div v-if="b.tags.length" class="flex flex-wrap gap-1">
            <span
              v-for="tag in b.tags.slice(0, 3)"
              :key="tag"
              class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider"
            >
              {{ tag }}
            </span>
          </div>

          <!-- Select button (shown in selectMode) -->
          <button
            v-if="selectMode"
            type="button"
            class="relative z-10 mt-2 w-full rounded-md border border-primary/60 bg-primary/10 px-3 py-1.5 font-cinzel text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
            @click.stop="emit('select', b)"
          >
            Select
          </button>
        </div>

        <!-- Edit button (top-left on hover, same pattern as Species) -->
        <RouterLink
          v-if="!readonly && !selectMode"
          :to="`/backgrounds/${b.id}?edit=true`"
          class="absolute top-2 left-2 z-10 flex items-center gap-1 rounded px-2 py-1 font-cinzel text-[10px] font-semibold tracking-wider text-white bg-black/50 hover:bg-black/70 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity"
          title="Edit background"
        >
          <IconEdit class="h-3 w-3" />
          Edit
        </RouterLink>
      </div>
    </div>

    <div ref="sentinelRef" />

    <p
      v-if="filtered.length"
      class="mt-4 font-fell text-xs text-muted-foreground italic text-right"
    >
      {{ filtered.length }} background{{ filtered.length === 1 ? "" : "s" }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconCheck, IconEdit } from '@/lib/icons';
import { useUiStore } from "@/stores/ui";
import { useBackgrounds } from "@/composables/useBackgrounds";
import { useInfiniteScroll } from "@/composables/useInfiniteScroll";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import type { Background } from "@/types/background.types";

withDefaults(defineProps<{ readonly?: boolean; selectMode?: boolean; selectedId?: string }>(), {
  readonly: false,
  selectMode: false,
  selectedId: undefined,
});
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
    list = list.filter((b) => !b.open5e_import);
  } else if (ui.backgroundsFilterSource === "open5e") {
    list = list.filter((b) => b.open5e_import);
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

const { visibleItems, sentinelRef } = useInfiniteScroll(filtered);
</script>
