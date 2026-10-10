<template>
  <div>
    <BulkScopeBar
      v-if="bulk.selecting.value"
      :count="bulk.count.value"
      :selectable-count="selectableIds.length"
      :busy="bulkMoving"
      :campaign-name="activeCampaign?.name ?? null"
      class="mb-3"
      @select-all="selectAllShown"
      @clear="bulk.clear"
      @stop="bulk.stop"
      @move="moveSelection"
      @copy="openCopyDialog"
    />

    <!-- Follows the mobile rows/gallery preference so the first page lands
         in the shape the DM chose. -->
    <ListSkeleton
      v-if="isLoading"
      :variant="isMobile ? layout : 'grid'"
      :count="isMobile ? 7 : 12"
    />

    <p v-else-if="error" class="text-center text-body text-destructive py-12" role="alert">
      Could not load monsters. {{ error.message }}
    </p>

    <EmptyState
      v-else-if="!total && !search && typeFilter === 'all' && sourceFilter === 'custom'"
      title="No custom monsters yet"
      description="Customize an SRD monster or build your own from scratch."
    >
      <template #icon><IconNavBestiary class="h-16 w-16" /></template>
      <template #action>
        <AppButton variant="primary" size="lg" label="Add your first monster" @click="handleNew" />
      </template>
    </EmptyState>

    <p
      v-else-if="!total"
      class="text-center text-body text-muted-foreground italic py-12"
    >
      No monsters match your filters.
    </p>

    <!-- ── Mobile list (<md): compact rows / gallery ─────────────────────── -->
    <template v-else-if="isMobile">
      <MobileEntityMetaRow
        v-model:layout="layout"
        :shown="total"
        :total="scopeTotal"
        plural="monsters"
      />
      <!-- Windowed: only the rows near the viewport are mounted, so a long bestiary
           never holds every portrait decoded at once. -->
      <EntityMobileGrid :items="rows" :item-key="monsterKey" :layout="layout">
          <template #default="{ item: monster }">
            <BulkSelectableCard
              corner="bottom-right"
              :selected="bulk.isSelected(monster.id)"
              :selecting="bulk.selecting.value && !monster.is_shared"
              @toggle="bulk.toggle(monster.id)"
            >
              <EntityMobileCard
                :layout="layout"
                :to="`/monsters/${monster.id}`"
                :title="monster.name"
                :subtitle="monsterSubtitle(monster)"
                :image-url="monster.image_url"
                :focal-point="monster.portrait_focal_point"
                :placeholder="placeholderUrl('monster')"
                :badge-text="crLabel(monster.challenge_rating)"
                :badge-class="crBg(monster.challenge_rating)"
                :location="monster.habitat || undefined"
                :shared="isDiscovered(monster)"
                @pointerenter="prefetchDetail(monster.id)"
                @focusin="prefetchDetail(monster.id)"
              />
            </BulkSelectableCard>
          </template>
      </EntityMobileGrid>
    </template>

    <!-- ── Desktop grid (≥md): unchanged ─────────────────────────────────── -->
    <VirtualGrid
      v-else
      :items="rows"
      :item-key="monsterKey"
      :columns="desktopColumns"
      :estimate-row-height="GRID_ROW_PX"
    >
      <template #default="{ item: monster }">
        <BulkSelectableCard
          corner="top-right"
          :selected="bulk.isSelected(monster.id)"
          :selecting="bulk.selecting.value && !monster.is_shared"
          @toggle="bulk.toggle(monster.id)"
        >
          <MonsterGridCard
            :monster="monster"
            :locked="lockedMonsterIds.has(monster.id)"
            @pointerenter="prefetchDetail(monster.id)"
            @focusin="prefetchDetail(monster.id)"
          />
        </BulkSelectableCard>
      </template>
    </VirtualGrid>

    <div ref="sentinelRef" />

    <p
      v-if="total && !isMobile"
      class="mt-4 text-caption text-muted-foreground italic text-right"
    >
      {{ total }} of {{ scopeTotal }} monsters
    </p>
  </div>

  <PaywallModal v-model="showPaywall" resource="monsters" />

  <CopyToCampaignDialog
    :open="copyOpen"
    table="monsters"
    :ids="copyIds"
    label="monster"
    @close="copyOpen = false"
    @copied="onCopied"
    @quota-exceeded="onQuotaExceeded"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import { useRouter } from "vue-router";
import { useIsMobile } from "@/composables/useBreakpoint";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import VirtualGrid from "@/components/common/list/VirtualGrid.vue";
import EntityMobileGrid from "@/components/common/entity/EntityMobileGrid.vue";
import { IconNavBestiary } from '@/lib/icons';
import AppButton from "@/components/common/controls/AppButton.vue";
import { useAppUiStore } from "@/stores/ui/app";
import { useMonstersUiStore } from "@/stores/ui/monsters";
import { useServerInfiniteScroll } from "@/composables/useServerInfiniteScroll";
import { fetchResolvedMonster, RESOLVED_MONSTER_QUERY_KEY } from "@/composables/monsters/useMonsters";
import { useMonsterBrowse } from "@/composables/monsters/useMonsterBrowse";
import { useCampaignDiscoveries } from "@/composables/encounters/useDiscoveredMonsters";
import MonsterGridCard from "@/components/monsters/MonsterGridCard.vue";
import { crBg, crLabel } from "@/lib/monsterDisplay";
import type { MonsterBrowseRow } from "@/types/monster.types";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import EntityMobileCard from "@/components/common/entity/EntityMobileCard.vue";
import MobileEntityMetaRow from "@/components/common/entity/MobileEntityMetaRow.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { useQuota } from "@/composables/billing/useQuota";
import { storeToRefs } from "pinia";
import BulkScopeBar from "@/components/common/list/BulkScopeBar.vue";
import BulkSelectableCard from "@/components/common/list/BulkSelectableCard.vue";
import CopyToCampaignDialog from "@/components/common/overlays/CopyToCampaignDialog.vue";
import { useBulkSelection } from "@/composables/useBulkSelection";
import { useCopyToCampaignFlow } from "@/composables/campaign/useCopyToCampaignFlow";
import { useMoveToCampaignFlow } from "@/composables/campaign/useMoveToCampaignFlow";
import { useCampaignStore } from "@/stores/campaign";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";

const router = useRouter();
const { canCreate } = useQuota("monsters");
const showPaywall = ref(false);

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/monsters/new");
}

const appUi = useAppUiStore();
const monstersUi = useMonstersUiStore();
const search = computed(() => monstersUi.monstersSearch);
const typeFilter = computed(() => monstersUi.monstersFilterType);
const sourceFilter = computed(() => monstersUi.monstersFilterSource);
const isMobile = useIsMobile();

// Desktop row height before a row is measured (px); the phone layouts' live in
// EntityMobileGrid. It matters less than those: on desktop the sheet opens
// over a list that stays mounted, so nothing has to be restored.
const GRID_ROW_PX = 262;

// Mirrors the grid classes this list used to carry:
// `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`.
const desktopColumns = useBreakpointColumns({ base: 1, sm: 2, lg: 3, xl: 4 });
const monsterKey = (monster: MonsterBrowseRow) => monster.id;

const layout = computed({
  get: () => appUi.entityListLayout,
  set: (v: "rows" | "gallery") => { appUi.entityListLayout = v; },
});

// The page is one server page at a time (#972): `browse_monsters` owns
// membership, order, filters, counts and the quota lock. MonstersView calls it
// with the same filters for the mobile "Show N" count; identical keys share one
// query.
const {
  rows, total, scopeTotal, selectableIds, lockedIds, ready,
  hasNextPage, isFetchingNextPage, fetchNextPage, isLoading, error,
} = useMonsterBrowse(() => ({
  search: monstersUi.monstersSearch,
  source: monstersUi.monstersFilterSource,
  type: monstersUi.monstersFilterType,
}));

// ── Discovery ────────────────────────────────────────────────────────────────
//
// Only the mobile card's "shared" badge still asks. Managing the reveal — the
// audience and the stat-block gate — is MonsterRevealControl's, which is why
// the hand-positioned popover left this file.

const { data: discoveries } = useCampaignDiscoveries();

function isDiscovered(monster: MonsterBrowseRow): boolean {
  return !!discoveries.value?.find(
    (d) => (monster.is_shared ? d.library_monster_id === monster.id : d.monster_id === monster.id),
  );
}

// ── Paging ───────────────────────────────────────────────────────────────────
//
// The sentinel under the grid asks for the next server page as it nears the
// viewport; scroll depth is restored on return from a detail.
const { sentinelRef } = useServerInfiniteScroll({
  scrollKey: "monsters",
  loadedCount: () => rows.value.length,
  ready, hasNextPage, isFetchingNextPage, fetchNextPage,
});

const lockedMonsterIds = computed(() => new Set(lockedIds.value));

// Open the detail with its row already in hand: the modal reads the full
// monster, which the slim list row cannot seed.
const queryClient = useQueryClient();
function prefetchDetail(id: string) {
  void queryClient.prefetchQuery({
    queryKey: [RESOLVED_MONSTER_QUERY_KEY, id],
    queryFn: () => fetchResolvedMonster(id),
  });
}

// Mobile-card subtitle — mirrors the desktop "{size} {type}" line.
function monsterSubtitle(monster: MonsterBrowseRow): string {
  return `${monster.size} ${monster.monster_type}`;
}

// ── Bulk selection (#875) ───────────────────────────────────────────────────
//
// Owned here, not in a domain UI store: transient per-visit selection, not a list
// filter. Shared/library monsters (monster.is_shared) are never selectable —
// the same flag MonsterGridCard already reads to show its "Reference" chip
// and hide the Edit action, so this reuses an existing distinction rather
// than inventing a new one.
const bulk = useBulkSelection();
const { activeCampaign } = storeToRefs(useCampaignStore());

// `selectableIds` is the server's: every OWN row passing the current filters,
// across the whole result and not just the loaded pages. Reused by "select all"
// and by the prune below, so both always agree on what's selectable.

// The filters can change (or the underlying list refetch) while rows are
// selected; prune whenever the selectable set changes so a stale id from a
// now-hidden row never lingers in the selection or reaches the mutation
// (#875). Not while page 1 of new filters is still loading: the previous
// result is on screen then, and its ids are not the new answer.
watch([selectableIds, ready], ([ids, isReady]) => { if (isReady) bulk.pruneTo(ids); });

function selectAllShown() {
  // "Shown" means every row passing the current filters, not just the loaded
  // pages — the server's `selectable_ids`, not `rows`.
  bulk.selectAll(selectableIds.value);
}

const { moving: bulkMoving, move: moveSelection } = useMoveToCampaignFlow({
  table: "monsters",
  noun: "monster",
  selectableIds: () => selectableIds.value,
  pruneTo: bulk.pruneTo,
  stop: bulk.stop,
  campaignName: () => activeCampaign.value?.name ?? null,
});

function toggleSelectMode() {
  if (bulk.selecting.value) bulk.stop();
  else bulk.selecting.value = true;
}

// ── Copy to campaign (#598) ─────────────────────────────────────────────────
//
// Same pruning discipline as moveSelection: the selection can go stale
// (refetch, filter edit) between the bar's click and the dialog opening, so
// it's pruned to what's still shown before the dialog ever sees the ids
// (#875, applies identically to copy) — `useCopyToCampaignFlow` owns that.
//
// monsters carries the enforce_quota trigger — the dialog surfaces a rejected
// insert as a `quota-exceeded` event rather than owning a paywall itself (see
// CopyToCampaignDialog.vue's docstring); this reuses the same PaywallModal
// this file already mounts for its own create flow via the flow's callback.
const {
  copyOpen,
  copyIds,
  openCopy: openCopyDialog,
  onCopied,
  onQuotaExceeded,
} = useCopyToCampaignFlow({
  noun: "monster",
  selectableIds: () => selectableIds.value,
  pruneTo: bulk.pruneTo,
  stop: bulk.stop,
  onQuotaExceeded: () => { showPaywall.value = true; },
});

defineExpose({ selecting: bulk.selecting, toggleSelectMode });
</script>
