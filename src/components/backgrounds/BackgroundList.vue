<template>
  <div>
    <ListSkeleton v-if="isLoading" :variant="layout === 'rows' ? 'tiles' : 'grid'" :columns="layout === 'rows' ? 1 : 4" :count="12" />

    <!-- A reader (a player choosing a background, or a non-DM in the Codex)
         cannot add one, so pointing them at /backgrounds/new sent them to a
         DM route. -->
    <EmptyState
      v-else-if="!filtered.length && !codexUi.backgroundsHasActiveFilters && readonly"
      title="No backgrounds available"
      description="Your DM hasn't added any backgrounds to this campaign yet."
    />

    <EmptyState
      v-else-if="!filtered.length && !codexUi.backgroundsHasActiveFilters"
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

    <EntityCollection
      v-else
      :items="filtered"
      :item-key="backgroundKey"
      :layout="layout"
      :grid-columns="columns"
      :grid-row-estimate="gridRowEstimate"
    >
      <template #card="{ item: b }">
        <OptionGridCard
          :to="`/backgrounds/${b.id}`"
          :title="b.name"
          :image-url="b.image_url"
          :focal-point="b.focal_point"
          :placeholder="placeholderUrl('background')"
          :select-mode="selectMode"
          :selected="!!selectedId && b.id === selectedId"
          :edit-to="!readonly && !isLibraryBackground(b) ? `/backgrounds/${b.id}?edit=true` : null"
          edit-label="Edit background"
          @select="emit('select', b)"
        >
          <div class="flex items-start justify-between gap-2">
            <h3 class="line-clamp-1 flex-1 text-heading-xs leading-tight font-bold text-foreground">{{ b.name }}</h3>
            <div class="flex shrink-0 items-center gap-1">
              <SourceBadge :source="backgroundSourceKey(b)" :title="b.source_title" class="max-w-22 truncate" />
            </div>
          </div>
          <p
            v-if="b.feature_name"
            class="line-clamp-1 text-caption italic text-muted-foreground"
            :title="b.feature_name"
          >{{ b.feature_name }}</p>
          <!-- Skills, tools and languages in one line; the full lists live on the detail page. -->
          <p v-if="profsSummary(b)" class="line-clamp-2 text-caption text-foreground/70">{{ profsSummary(b) }}</p>
          <div v-if="b.tags.length" class="mt-auto flex flex-wrap gap-1">
            <span
              v-for="tag in b.tags.slice(0, 3)"
              :key="tag"
              class="rounded bg-muted px-1.5 py-0.5 text-label text-muted-foreground"
            >{{ tag }}</span>
          </div>
        </OptionGridCard>
      </template>
      <template #row="{ item: b }">
        <EntityListRow
          :to="`/backgrounds/${b.id}`"
          :title="b.name"
          :subtitle="backgroundSubtitle(b)"
          :image-url="b.image_url"
          :fallback-icon="IconBookUser"
          :tags="rowTags(b)"
        >
          <template v-if="!readonly && !isLibraryBackground(b)" #actions>
            <AppButton
              variant="ghost"
              size="icon-xs"
              :icon="IconEdit"
              :to="`/backgrounds/${b.id}?edit=true`"
              tooltip="Edit background"
              aria-label="Edit background"
            />
          </template>
        </EntityListRow>
      </template>
    </EntityCollection>

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
import { IconBookUser, IconEdit } from '@/lib/icons';
import { useCodexUiStore } from "@/stores/ui/codex";
import { backgroundBookKey, backgroundSourceKey, isLibraryBackground, useBackgrounds } from "@/composables/rules/useBackgrounds";
import { useScrollRestore } from "@/composables/useScrollRestore";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import { useListLayout } from "@/composables/useListLayout";
import EntityCollection from "@/components/common/list/EntityCollection.vue";
import EntityListRow from "@/components/common/entity/EntityListRow.vue";
import OptionGridCard from "@/components/common/entity/OptionGridCard.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import type { Background } from "@/types/background.types";
import SourceBadge from "@/components/common/entity/SourceBadge.vue";
import { useSourceTitles } from "@/composables/library/useSourceTitles";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";

const { selectMode } = defineProps<{ readonly?: boolean; selectMode?: boolean; selectedId?: string }>();
const emit = defineEmits<{ select: [bg: Background] }>();

const codexUi = useCodexUiStore();
const { data: backgrounds, isLoading } = useBackgrounds();
const { labelFor } = useSourceTitles();

/** A row's tags, the book it comes from first. */
function rowTags(b: Background): string[] {
  const label = labelFor(backgroundSourceKey(b), b.source_title);
  return label ? [label, ...b.tags] : b.tags;
}

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

  if (codexUi.backgroundsFilterSource === "custom") {
    list = list.filter((b) => !isLibraryBackground(b));
  } else if (codexUi.backgroundsFilterSource !== "all") {
    // Anything else is a book's key.
    list = list.filter((b) => backgroundBookKey(b) === codexUi.backgroundsFilterSource);
  }

  if (codexUi.backgroundsSearch.trim()) {
    const q = codexUi.backgroundsSearch.trim().toLowerCase();
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

// The Codex header's toggle writes the same key. The player's picker has no
// toggle and selecting happens on a card, so it always shows the grid.
const storedLayout = useListLayout("codex-backgrounds", "grid");
const layout = computed(() => (selectMode ? "grid" : storedLayout.value));

// The row's one line under the name: the feature it grants, else what it trains.
function backgroundSubtitle(b: Background): string | null {
  return b.feature_name ?? (profsSummary(b) || null);
}

// Grid card height before it is measured (px). It decides where a restored
// scroll lands, since coming back from a detail re-renders every unmeasured row
// above the viewport. OptionGridCard is an EntityGridCard, so: 2 border + 144
// artwork band (h-36) + 24 body padding (p-3) + 84 body = 254. The body is the
// name 20, the feature line 17, a two-line proficiency summary 34 and three
// gap-1 gaps 12 (84 is also what the card measured on 8 Oct 2026, 206 less the
// then h-24 band and padding). The player's picker adds a Select button under
// the body: mt-2 (8) + a 32 small button.
const GRID_ROW_PX = 254;
const SELECT_BUTTON_PX = 40;
const gridRowEstimate = computed(() => GRID_ROW_PX + (selectMode ? SELECT_BUTTON_PX : 0));
</script>
