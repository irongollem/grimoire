<template>
  <section class="space-y-4 rounded-lg border border-border bg-card p-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-heading-sm font-bold text-foreground">Focal point queue</h2>
        <p class="mt-0.5 text-caption text-muted-foreground italic">
          {{ summary }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <SegmentedControl v-model="kind" :options="KIND_OPTIONS" />
        <SegmentedControl v-model="status" :options="STATUS_OPTIONS" />
        <AppButton v-if="hasActiveFilters" variant="ghost" size="sm" label="Clear" @click="resetFilters" />
      </div>
    </div>

    <LoadingSpinner v-if="query.isPending.value" message="Loading pictures" />
    <p v-else-if="query.isError.value" role="alert" class="text-body text-destructive">
      Could not load the queue: {{ errorText }}
    </p>
    <p v-else-if="filtered.length === 0" class="py-8 text-center text-body text-muted-foreground italic">
      {{ emptyText }}
    </p>
    <template v-else>
      <VirtualGrid
        :items="filtered"
        :item-key="entryKey"
        :columns="columns"
        :estimate-row-height="GRID_ROW_PX"
      >
        <template #default="{ item }">
        <!-- A bare button: the card is the control, and it carries only the
             card's own border and focus ring, none of AppButton's label chrome. -->
        <button
          type="button"
          class="group block w-full overflow-hidden rounded-md border border-border bg-muted/40 text-left focus-visible:outline-2 focus-visible:outline-primary"
          @click="openViewer(item)"
        >
          <div class="relative h-36 overflow-hidden bg-muted">
            <FocalImage :src="item.imageUrl" :alt="entryLabel(item)" format="landscape" :focal-point="item.focalPoint" />
            <span
              v-if="!isChecked(item)"
              class="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border border-white bg-primary shadow"
              title="Not checked yet"
            >
              <span class="sr-only">Not checked yet</span>
            </span>
          </div>
          <p class="truncate px-2 py-1.5 text-caption text-foreground">{{ entryLabel(item) }}</p>
        </button>
        </template>
      </VirtualGrid>
    </template>

    <LibraryFocalQueueViewer
      :open="viewerOpen"
      :kind="kind"
      :order="viewerOrder"
      :start-url="viewerStart"
      :status="status"
      @close="viewerOpen = false"
    />
  </section>
</template>

<script setup lang="ts">
/**
 * Admin review of every library picture's focal point (#965). The vision model's
 * guess decides where cards crop; this is where a person confirms or corrects it.
 * Thumbnails are the real grid-card crop, so the list already shows what users see.
 */
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import AppButton from "@/components/common/AppButton.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import LibraryFocalQueueViewer from "@/components/admin/LibraryFocalQueueViewer.vue";
import VirtualGrid from "@/components/common/VirtualGrid.vue";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import { useLibraryFocalQueue } from "@/composables/library/useLibraryFocalQueue";
import { useAdminUiStore } from "@/stores/ui/admin";
import {
  entryLabel,
  filterByStatus,
  isChecked,
  type FocalKind,
  type FocalQueueEntry,
  type FocalStatus,
} from "@/lib/library/focalQueue";

const KIND_OPTIONS = [
  { value: "monster", label: "Monsters" },
  { value: "spell", label: "Spells" },
  { value: "item", label: "Items" },
] as const satisfies readonly { value: FocalKind; label: string }[];
const STATUS_OPTIONS = [
  { value: "unchecked", label: "Unchecked" },
  { value: "all", label: "All" },
] as const satisfies readonly { value: FocalStatus; label: string }[];

const adminUi = useAdminUiStore();
const { focalQueueKind: kind, focalQueueStatus: status, focalQueueHasActiveFilters: hasActiveFilters } =
  storeToRefs(adminUi);
const resetFilters = adminUi.resetFocalQueueFilters;

const { query, entries } = useLibraryFocalQueue(kind);

const filtered = computed(() => filterByStatus(entries.value, status.value));

// Mirrors the grid classes this list used to carry:
// `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3`.
const columns = useBreakpointColumns({ base: 2, sm: 3, lg: 4, xl: 5 });
const entryKey = (entry: FocalQueueEntry) => entry.imageUrl;

// Row height before a row is measured (px): 2 border + 144 picture (h-36) +
// 29 caption (py-1.5 plus a 17px text-caption line) = 175.
const GRID_ROW_PX = 175;

const uncheckedCount = computed(() => entries.value.filter((row) => !isChecked(row)).length);
const summary = computed(() => {
  if (!query.data.value) return "Review where each picture crops.";
  const fmt = (n: number) => n.toLocaleString("en");
  return `${fmt(uncheckedCount.value)} unchecked of ${fmt(entries.value.length)} ${kind.value} pictures`;
});
const emptyText = computed(() =>
  status.value === "unchecked" ? `Every ${kind.value} picture has been checked.` : `No ${kind.value} pictures.`,
);
const errorText = computed(() => {
  const error = query.error.value;
  return error instanceof Error ? error.message : "Unknown error";
});

const viewerOpen = ref(false);
const viewerOrder = ref<string[]>([]);
const viewerStart = ref<string | null>(null);

function openViewer(item: FocalQueueEntry) {
  // Frozen at open: see the viewer for why it must not follow the live list.
  viewerOrder.value = filtered.value.map((row) => row.imageUrl);
  viewerStart.value = item.imageUrl;
  viewerOpen.value = true;
}
</script>
