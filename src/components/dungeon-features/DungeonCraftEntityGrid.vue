<template>
  <ListSkeleton v-if="isLoading" :variant="layout === 'grid' ? 'grid' : 'stack'" :columns="4" :count="8" />
  <template v-else-if="items?.length">
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <AppInput
        v-model="searchModel"
        type="search"
        tone="card"
        size="body"
        :block="false"
        class="flex-1 min-w-40"
        :placeholder="searchPlaceholder"
      />
      <slot name="filters" />
      <AppButton
        v-if="table && !selecting"
        variant="subtle"
        size="body"
        label="Select"
        @click="selecting = true"
      />
    </div>
    <BulkScopeBar
      v-if="table && selecting"
      class="mb-4"
      :count="bulkSelection.count.value"
      :selectable-count="ids.length"
      :busy="bulkMoving"
      :campaign-name="activeCampaignName"
      @select-all="bulkSelection.selectAll(ids)"
      @clear="bulkSelection.clear()"
      @stop="bulkSelection.stop()"
      @move="handleMove"
      @copy="handleCopyOpen"
    />
    <p v-if="!shown.length" class="text-center text-body text-muted-foreground italic py-8">
      {{ noMatchText }}
    </p>
    <!-- Windowed: these lists were plain CSS grids that mounted every card. -->
    <EntityCollection
      v-else
      :items="shown"
      :item-key="itemKey"
      :layout="layout"
      :grid-columns="columns"
      :grid-row-estimate="GRID_ROW_PX"
      :row-estimate="ROW_PX"
    >
      <template #card="{ item }">
        <slot
          name="card"
          :item="item"
          :selecting="selecting"
          :is-selected="bulkSelection.isSelected"
          :toggle="bulkSelection.toggle"
        />
      </template>
      <template #row="{ item }">
        <slot
          name="row"
          :item="item"
          :selecting="selecting"
          :is-selected="bulkSelection.isSelected"
          :toggle="bulkSelection.toggle"
        />
      </template>
    </EntityCollection>
  </template>
  <EmptyState
    v-else
    :icon="emptyIcon"
    :title="emptyTitle"
    :description="emptyDescription"
    :action-label="emptyActionLabel"
    @action="emit('empty-action')"
  />

  <!--
    Copy-to-campaign (#598, wave 2). One dialog here rather than one per tab —
    all four tabs govern a table the dialog already understands, so the
    handler is identical across them; only `copyLabel` differs, and that
    travels through as a prop. `table && copyLabel` doubles as the guard: a
    grid without bulk-scope wiring (DungeonCraftFeaturesTab, no `table` prop)
    or without a copy label never mounts this at all.
  -->
  <CopyToCampaignDialog
    v-if="table && copyLabel"
    :open="copyOpen"
    :table="table"
    :ids="copyIds"
    :label="copyLabel"
    @close="copyOpen = false"
    @copied="handleCopied"
    @quota-exceeded="handleCopyQuotaExceeded"
  />
  <!--
    puzzle_rooms is the only one of these four tables carrying the
    enforce_quota trigger (traps/loot_tables/roll_tables never emit
    quota-exceeded), so this is the only tab that ever needs the paywall —
    mounting it unconditionally for the other three would just be dead markup.
  -->
  <PaywallModal v-if="table === 'puzzle_rooms'" v-model="showPaywall" resource="puzzle_rooms" />
</template>

<script setup lang="ts" generic="T">
/**
 * The shared list body of the Dungeon Craft tabs (features, traps, puzzles,
 * roll tables, loot tables): search row, bulk-scope bar, and the items in
 * either layout through `EntityCollection`. Each tab passes `shown` (its
 * filtered rows) and both shapes as slots; `listKey` names the tab's layout
 * choice, which the Dungeon Craft header toggle writes under the same key.
 */
import { computed, ref, watch } from "vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import EntityCollection from "@/components/common/list/EntityCollection.vue";
import { useListLayout } from "@/composables/useListLayout";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import BulkScopeBar from "@/components/common/list/BulkScopeBar.vue";
import CopyToCampaignDialog from "@/components/common/overlays/CopyToCampaignDialog.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { useBulkSelection } from "@/composables/useBulkSelection";
import type { BulkScopeTable } from "@/composables/campaign/useBulkCampaignScope";
import { useCopyToCampaignFlow } from "@/composables/campaign/useCopyToCampaignFlow";
import { useMoveToCampaignFlow } from "@/composables/campaign/useMoveToCampaignFlow";
import { useCampaignStore } from "@/stores/campaign";

const {
  items,
  isLoading,
  search,
  shown,
  itemKey,
  listKey,
  searchPlaceholder = "Search…",
  noMatchText = "No items match your filter.",
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  table,
  ids = [],
  copyLabel,
} = defineProps<{
  items: unknown[] | undefined;
  isLoading: boolean;
  search: string;
  /** The rows passing the current filters, in display order. */
  shown: T[];
  itemKey: (item: T) => string;
  /** The layout key of this tab ("traps", "roll-tables"). */
  listKey: string;
  searchPlaceholder?: string;
  noMatchText?: string;
  emptyIcon: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyActionLabel: string;
  /** Presence turns on the bulk-scope capability; absence leaves the grid exactly as before (#875). */
  table?: BulkScopeTable;
  /** The ids of every row passing the current filters — "Select all shown" reads from this, not the painted subset. */
  ids?: readonly string[];
  /** Singular noun for what `table` holds, e.g. "trap" — passed straight through
   *  to CopyToCampaignDialog's `label` (#598). All four dungeon-craft nouns are
   *  regular, so the dialog's naive `${label}s` plural is never wrong here. */
  copyLabel?: string;
}>();

defineSlots<{
  filters?(): unknown;
  card(props: { item: T; selecting: boolean; isSelected: (id: string) => boolean; toggle: (id: string) => void }): unknown;
  row(props: { item: T; selecting: boolean; isSelected: (id: string) => boolean; toggle: (id: string) => void }): unknown;
}>();

const emit = defineEmits<{
  "update:search": [value: string];
  "empty-action": [];
}>();

// The Dungeon Craft header's toggle writes the same key. Cards is today's look.
const layout = useListLayout(listKey, "grid");
// Mirrors `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5`.
const columns = useBreakpointColumns({ base: 2, sm: 3, md: 4, lg: 5 });
// Heights in px before a card or row is measured: a card is the square artwork
// (about 10rem across five columns) plus a 4.5rem body; a row is the bare
// EntityListRow, 82, or 98 with its tag line.
const GRID_ROW_PX = 260;
const ROW_PX = 98;

// AppInput requires a v-model; this component receives its search value as a
// prop and re-emits `update:search`, so the model is a writable proxy over
// that prop/emit pair rather than a local ref.
const searchModel = computed({
  get: () => search,
  set: (value: string) => emit("update:search", value),
});

// ── Bulk scope (#875) ──────────────────────────────────────────────────────
// Selection state lives here (not a domain UI store): it is transient and per-visit,
// not a filter over the list. Always constructed — cheap, and keeps composable
// calls unconditional — but only surfaced in the template when `table` is set,
// so a grid without it behaves exactly as it did before this feature existed.
const bulkSelection = useBulkSelection();
const { selecting } = bulkSelection;
const campaignStore = useCampaignStore();
const activeCampaignName = computed(() => campaignStore.activeCampaign?.name ?? null);

// A DM can edit the search box (or a filter slotted in above) while rows are
// selected; `ids` is every id passing the *current* filters, so a selection
// made before that edit can hold ids for rows no longer shown. Prune on every
// change so the count in BulkScopeBar never lies, and again at move time
// (belt-and-braces) so the batched write can never reach a row the DM can no
// longer see (#875).
watch(() => ids, (next) => bulkSelection.pruneTo(next));

// `noun` falls back to the generic "entry" (irregular plural "entries") for a
// mount with `table` set but no `copyLabel`, matching the copy flow's own
// fallback below. `table` itself may be undefined here — `move()` is then a
// no-op, per `useMoveToCampaignFlow`'s own doc — which used to show as
// "Moved N entries." even when the destination was "all campaigns" (a latent
// bug fixed by routing through the shared flow, which always branches).
const { moving: bulkMoving, move: handleMove } = useMoveToCampaignFlow({
  table,
  noun: copyLabel ?? "entry",
  nounPlural: copyLabel ? undefined : "entries",
  selectableIds: () => ids,
  pruneTo: bulkSelection.pruneTo,
  stop: bulkSelection.stop,
  campaignName: () => activeCampaignName.value,
});

// ── Copy to campaign (#598) ─────────────────────────────────────────────────
// Same stale-selection hazard the move path guards against (#875) —
// `useCopyToCampaignFlow` prunes at open time for exactly this reason. `noun`
// falls back to the generic "entry" (matching `handleMove`'s toast above) for
// a mount with `table` set but no `copyLabel`; the flow is constructed
// unconditionally — cheap, and keeps composable calls unconditional, same
// reasoning as `bulkSelection` above — but `handleCopyOpen` keeps the
// original guard so nothing opens without both set.
const showPaywall = ref(false);
const copyFlow = useCopyToCampaignFlow({
  noun: copyLabel ?? "entry",
  selectableIds: () => ids,
  pruneTo: bulkSelection.pruneTo,
  stop: bulkSelection.stop,
  onQuotaExceeded: () => { showPaywall.value = true; },
});
const { copyOpen, copyIds, onCopied: handleCopied, onQuotaExceeded: handleCopyQuotaExceeded } = copyFlow;

function handleCopyOpen() {
  if (!table || !copyLabel) return;
  copyFlow.openCopy();
}
</script>
