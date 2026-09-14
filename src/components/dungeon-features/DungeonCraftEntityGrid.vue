<template>
  <div v-if="isLoading" class="flex justify-center py-16">
    <LoadingSpinner />
  </div>
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
      :busy="bulkScope.isPending.value"
      :campaign-name="activeCampaignName"
      @select-all="bulkSelection.selectAll(ids)"
      @clear="bulkSelection.clear()"
      @stop="bulkSelection.stop()"
      @move="handleMove"
      @copy="handleCopyOpen"
    />
    <p v-if="!filteredCount" class="text-center text-body text-muted-foreground italic py-8">
      {{ noMatchText }}
    </p>
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      <slot name="card" :selecting="selecting" :is-selected="bulkSelection.isSelected" :toggle="bulkSelection.toggle" />
    </div>
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
    :source-campaign-id="campaignStore.activeCampaignId"
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

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppButton from "@/components/common/AppButton.vue";
import BulkScopeBar from "@/components/common/BulkScopeBar.vue";
import CopyToCampaignDialog from "@/components/common/CopyToCampaignDialog.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useBulkSelection } from "@/composables/useBulkSelection";
import { useBulkCampaignScope, type BulkScopeTable } from "@/composables/campaign/useBulkCampaignScope";
import { useCopyToCampaignFlow } from "@/composables/campaign/useCopyToCampaignFlow";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";

const {
  items,
  isLoading,
  search,
  filteredCount,
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
  filteredCount: number;
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

const emit = defineEmits<{
  "update:search": [value: string];
  "empty-action": [];
}>();

// AppInput requires a v-model; this component receives its search value as a
// prop and re-emits `update:search`, so the model is a writable proxy over
// that prop/emit pair rather than a local ref.
const searchModel = computed({
  get: () => search,
  set: (value: string) => emit("update:search", value),
});

// ── Bulk scope (#875) ──────────────────────────────────────────────────────
// Selection state lives here (not `useUiStore`): it is transient and per-visit,
// not a filter over the list. Always constructed — cheap, and keeps composable
// calls unconditional — but only surfaced in the template when `table` is set,
// so a grid without it behaves exactly as it did before this feature existed.
const bulkSelection = useBulkSelection();
const { selecting } = bulkSelection;
const bulkScope = useBulkCampaignScope();
const campaignStore = useCampaignStore();
const activeCampaignName = computed(() => campaignStore.activeCampaign?.name ?? null);
const toast = useToast();

// A DM can edit the search box (or a filter slotted in above) while rows are
// selected; `ids` is every id passing the *current* filters, so a selection
// made before that edit can hold ids for rows no longer shown. Prune on every
// change so the count in BulkScopeBar never lies, and again at move time
// (belt-and-braces) so the batched write can never reach a row the DM can no
// longer see (#875).
watch(() => ids, (next) => bulkSelection.pruneTo(next));

async function handleMove(campaignId: string | null) {
  if (!table) return;
  const moveIds = bulkSelection.pruneTo(ids);
  if (!moveIds.length) return;
  try {
    const { moved } = await bulkScope.mutateAsync({ table, ids: moveIds, campaignId });
    toast.success(`Moved ${moved} ${moved === 1 ? "entry" : "entries"}.`);
    bulkSelection.stop();
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}

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
