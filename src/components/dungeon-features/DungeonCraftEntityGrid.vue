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
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppButton from "@/components/common/AppButton.vue";
import BulkScopeBar from "@/components/common/BulkScopeBar.vue";
import { useBulkSelection } from "@/composables/useBulkSelection";
import { useBulkCampaignScope, type BulkScopeTable } from "@/composables/campaign/useBulkCampaignScope";
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
</script>
