<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-center justify-between gap-2 pb-2">
      <p class="truncate text-caption text-muted-foreground italic">
        {{ countLabel }}
      </p>
      <div class="flex items-center gap-2">
        <AppButton
          v-if="!isFiltered && expanded.size > 0"
          variant="link"
          size="inline-xs"
          label="Collapse all"
          @click="$emit('collapse-all')"
        />
        <!--
          Folds the whole tree column away, desktop only — the tree/pane swap
          below `lg` already gives the tree the full screen, so there is
          nothing to fold there. Icon-only on purpose: "Collapse" is already
          spoken for by "Collapse all" (which closes expanded branches, not
          the sidebar itself), so this reaches for a chevron rather than a
          second control that would read as the same word meaning two things.
        -->
        <AppButton
          class="hidden lg:inline-flex"
          variant="ghost"
          size="icon-xs"
          :icon="IconChevronLeft"
          tooltip="Collapse location tree"
          aria-label="Collapse location tree"
          @click="$emit('collapse-tree')"
        />
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto pr-1">
      <p
        v-if="isFiltered && !matches.length"
        class="py-8 text-center text-body text-muted-foreground italic"
      >
        No locations match your filters.
      </p>

      <!--
        A filtered tree is a contradiction: hiding a branch that contains a
        match makes the match unreachable, and keeping every ancestor visible
        just to hold one leaf buries it. So searching flattens to matches, the
        same behaviour the player atlas already has.
      -->
      <ul v-else-if="isFiltered" class="flex flex-col gap-0.5">
        <li v-for="loc in matches" :key="loc.id">
          <AtlasTreeRow
            :row="flatRow(loc)"
            :expanded="false"
            :selected="loc.id === selectedId"
            :out-of-era="isLocationOutOfEra(loc, todayYear)"
            @select="$emit('select', $event)"
            @toggle="$emit('toggle', $event)"
          />
          <p
            v-if="parentNameOf(loc)"
            class="truncate pl-7 text-caption-sm text-muted-foreground/70 italic"
          >
            in {{ parentNameOf(loc) }}
          </p>
        </li>
      </ul>

      <ul v-else class="flex flex-col gap-0.5">
        <li v-for="row in rows" :key="row.loc.id">
          <AtlasTreeRow
            :row="row"
            :expanded="expanded.has(row.loc.id)"
            :selected="row.loc.id === selectedId"
            :out-of-era="isLocationOutOfEra(row.loc, todayYear)"
            @select="$emit('select', $event)"
            @toggle="$emit('toggle', $event)"
          />
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AtlasTreeRow from "@/components/locations/AtlasTreeRow.vue";
import { isLocationOutOfEra } from "@/lib/locations/era";
import { visibleRows } from "@/lib/locations/tree";
import type { AtlasIndex, AtlasRow } from "@/lib/locations/tree";
import type { Location } from "@/types/location.types";
import { IconChevronLeft } from "@/lib/icons";

const { index, expanded, selectedId, matches, isFiltered, totalCount, todayYear } =
  defineProps<{
    index: AtlasIndex;
    expanded: ReadonlySet<string>;
    selectedId: string | null;
    /** Flat match list, used only while a filter is active. */
    matches: Location[];
    isFiltered: boolean;
    totalCount: number;
    todayYear: number;
  }>();

defineEmits<{
  select: [id: string];
  toggle: [id: string];
  "collapse-all": [];
  "collapse-tree": [];
}>();

const rows = computed(() => visibleRows(index, expanded));

const countLabel = computed(() =>
  isFiltered
    ? `${matches.length} of ${totalCount} locations`
    : `${totalCount} location${totalCount === 1 ? "" : "s"}`,
);

/** Matches render without nesting, so depth and expansion are flattened away. */
function flatRow(loc: Location): AtlasRow {
  return {
    loc,
    depth: 0,
    hasChildren: false,
    descendantCount: index.descendantCount.get(loc.id) ?? 0,
  };
}

/** Null rather than "" — a top-level place has no parent, it does not have a blank one. */
function parentNameOf(loc: Location): string | null {
  if (!loc.parent_id) return null;
  return index.byId.get(loc.parent_id)?.name ?? null;
}
</script>
