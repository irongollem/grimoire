<template>
  <DungeonCraftEntityGrid
    :items="traps"
    :is-loading="trapsLoading"
    v-model:search="trapsSearch"
    :shown="filteredTraps"
    :item-key="trapKey"
    list-key="traps"
    search-placeholder="Search traps…"
    no-match-text="No traps match your filter."
    empty-icon="Crosshair"
    empty-title="No traps yet"
    :empty-description="emptyDescription"
    empty-action-label="New Trap"
    table="traps"
    :ids="trapFilteredIds"
    copy-label="trap"
    :ledger="TRAP_LEDGER"
    @empty-action="router.push('/traps/new')"
  >
    <template #filters>
      <AppSelect v-model="trapsFilterType" tone="card" size="body">
        <option value="">All Types</option>
        <option v-for="t in TRAP_TYPES" :key="t" :value="t">{{ t }}</option>
      </AppSelect>
      <AppButton
        v-if="trapsUi.trapsHasActiveFilters"
        variant="subtle"
        size="body"
        label="Clear"
        @click="trapsUi.resetTrapsFilters()"
      />
    </template>
    <template #card="{ item: trap, selecting, isSelected, toggle }">
      <BulkSelectableCard
        :corner="lowArt ? 'top-right' : 'bottom-right'"
        :selected="isSelected(trap.id)"
        :selecting="selecting && !isLibraryTrap(trap)"
        @toggle="toggle(trap.id)"
      >
        <DungeonCraftCard
          :to="`/traps/${trap.id}`"
          :name="trap.name"
          kind="Trap"
          :type="trap.trap_type"
          :type-class="TRAP_TYPE_BG[trap.trap_type]"
          :image-url="trap.image_url"
          :focal-point="trap.image_focal_point"
          :placeholder="placeholderUrl('trap')"
          :subtitle="trapSubtitle(trap)"
          :rooms="placedInRows(trap.id)"
          :source="isLibraryTrap(trap) ? trap.source : undefined"
        />
      </BulkSelectableCard>
    </template>
    <template #row="{ item: trap, selecting, isSelected, toggle }">
      <BulkSelectableCard
        :corner="lowArt ? 'top-right' : 'bottom-right'"
        :selected="isSelected(trap.id)"
        :selecting="selecting && !isLibraryTrap(trap)"
        @toggle="toggle(trap.id)"
      >
        <EntityListRow
          :to="`/traps/${trap.id}`"
          :title="trap.name"
          :subtitle="trapSubtitle(trap)"
          :image-url="trap.image_url"
          :fallback-icon="IconTrap"
          :tags="trapTags(trap)"
          :cells="[trapSubtitle(trap), isLibraryTrap(trap) ? labelFor(trap.source) : null]"
        />
      </BulkSelectableCard>
    </template>
  </DungeonCraftEntityGrid>
</template>

<script setup lang="ts">
import { useDungeonCraftBooksOffered } from "@/composables/library/useEnabledSources";
import { useSourceTitles } from "@/composables/library/useSourceTitles";
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { useTrapIndex } from "@/composables/dungeon-features/useTraps";
import { isLibraryTrap } from "@/lib/dungeon-features/library";
import { usePlacedInRooms } from "@/composables/dungeon-features/usePlacedInRooms";
import { TRAP_TYPES, TRAP_TYPE_BG } from "@/types/trap.types";
import { useTrapsUiStore } from "@/stores/ui/traps";
import EntityListRow from "@/components/common/entity/EntityListRow.vue";
import { IconTrap } from "@/lib/icons";
import type { TrapEntry } from "@/types/trap.types";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useLowArt } from "@/composables/useLowArt";
import BulkSelectableCard from "@/components/common/list/BulkSelectableCard.vue";
import DungeonCraftEntityGrid from "./DungeonCraftEntityGrid.vue";
import DungeonCraftCard from "./DungeonCraftCard.vue";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";

const router = useRouter();
const { labelFor } = useSourceTitles();
const { lowArt } = useLowArt();

// Low art's ledger (#1179, frame 03): the subtitle as one column, then the source.
const TRAP_LEDGER = [
  { label: "Details", track: "minmax(0,1fr)" },
  { label: "Source", track: "10rem" },
];

// Only library rows carry a source; an own row's tags start at its type.
function trapTags(trap: TrapEntry): string[] {
  const label = isLibraryTrap(trap) ? labelFor(trap.source) : null;
  return label ? [label, trap.trap_type, ...trap.tags] : [trap.trap_type, ...trap.tags];
}
// An empty list with Grimoire's books on offer means none is switched on (#1060).
const booksOffered = useDungeonCraftBooksOffered();
const emptyDescription = computed(() =>
  booksOffered.value ? "Switch on a book from the book icon above, or create your own." : "Build your first trap: set the trigger, DCs, damage, and CR.",
);

const { data: traps, isLoading: trapsLoading } = useTrapIndex();
const trapsUi = useTrapsUiStore();
// Filter state lives in the UI store, not local refs, so it survives
// navigating into a trap and back without outliving the session.
const { trapsSearch, trapsFilterType } = storeToRefs(trapsUi);

// ── Placed in (#868, S8, frame 11) ────────────────────────────────────────────
const trapIds = computed(() => (traps.value ?? []).map((t) => t.id));
const { placedInRows } = usePlacedInRooms("trap", trapIds);

const trapKey = (trap: TrapEntry) => trap.id;
function trapSubtitle(trap: TrapEntry): string | null {
  const parts = [trap.cr ? `CR ${trap.cr}` : null, trap.trigger_type];
  return parts.filter((p): p is string => !!p).join(" · ") || null;
}

const filteredTraps = computed(() => {
  let list = traps.value ?? [];
  if (trapsFilterType.value) list = list.filter((t) => t.trap_type === trapsFilterType.value);
  const q = trapsSearch.value.toLowerCase().trim();
  if (q) list = list.filter((t) =>
    t.name.toLowerCase().includes(q) ||
    (t.trigger_type ?? "").toLowerCase().includes(q) ||
    t.tags.some((tag) => tag.toLowerCase().includes(q)),
  );
  return list;
});

// "Select all shown" reads every row passing the current filters (#875). Library
// rows are read-only and not the DM's to move, copy or delete, so never selectable.
const trapFilteredIds = computed(() =>
  filteredTraps.value.filter((t) => !isLibraryTrap(t)).map((t) => t.id),
);
</script>
