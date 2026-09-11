<template>
  <div>
    <BulkScopeBar
      v-if="bulk.selecting.value"
      :count="bulk.count.value"
      :selectable-count="selectableIds.length"
      :busy="bulkScope.isPending.value"
      :campaign-name="activeCampaign?.name ?? null"
      class="mb-3"
      @select-all="selectAllShown"
      @clear="bulk.clear"
      @stop="bulk.stop"
      @move="moveSelection"
    />

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length && !search && typeFilter === 'all' && sourceFilter === 'custom'"
      title="No custom monsters yet"
      description="Customize an SRD monster or build your own from scratch."
    >
      <template #icon><IconNavBestiary class="h-16 w-16" /></template>
      <template #action>
        <AppButton variant="primary" size="lg" label="Add your first monster" @click="handleNew" />
      </template>
    </EmptyState>

    <p
      v-else-if="!filtered.length"
      class="text-center text-body text-muted-foreground italic py-12"
    >
      No monsters match your filters.
    </p>

    <!-- ── Mobile list (<md): compact rows / gallery ─────────────────────── -->
    <template v-else-if="isMobile">
      <MobileEntityMetaRow
        v-model:layout="layout"
        :shown="filtered.length"
        :total="allMonsters?.length ?? 0"
        plural="monsters"
      />
      <div
        :class="layout === 'gallery'
          ? 'grid grid-cols-2 gap-3 pb-2'
          : 'flex flex-col gap-2 pb-2'"
      >
        <BulkSelectableCard
          v-for="monster in visibleItems"
          :key="monster.id"
          corner="top-right"
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
            :badge-text="crLabel(monster.stat_block.challenge_rating)"
            :badge-class="crBg(monster.stat_block.challenge_rating)"
            :location="monster.habitat || undefined"
            :shared="isDiscovered(monster)"
          />
        </BulkSelectableCard>
      </div>
    </template>

    <!-- ── Desktop grid (≥md): unchanged ─────────────────────────────────── -->
    <div
      v-else
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
    >
      <BulkSelectableCard
        v-for="monster in visibleItems"
        :key="monster.id"
        corner="top-right"
        :selected="bulk.isSelected(monster.id)"
        :selecting="bulk.selecting.value && !monster.is_shared"
        @toggle="bulk.toggle(monster.id)"
      >
        <MonsterGridCard
          :monster="monster"
          :locked="lockedMonsterIds.has(monster.id)"
        />
      </BulkSelectableCard>
    </div>

    <div ref="sentinelRef" />

    <p
      v-if="filtered.length && !isMobile"
      class="mt-4 text-caption text-muted-foreground italic text-right"
    >
      {{ filtered.length }} of {{ allMonsters?.length ?? 0 }} monsters
    </p>
  </div>

  <PaywallModal v-model="showPaywall" resource="monsters" />
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useMediaQuery } from "@vueuse/core";
import { IconNavBestiary } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import { useUiStore } from "@/stores/ui";
import { useInfiniteScroll } from "@/composables/useInfiniteScroll";
import { useScrollRestore } from "@/composables/useScrollRestore";
import { useAllMonsters } from "@/composables/monsters/useMonsters";
import { useCampaignDiscoveries } from "@/composables/encounters/useDiscoveredMonsters";
import MonsterGridCard from "@/components/monsters/MonsterGridCard.vue";
import { crBg, crLabel } from "@/lib/monsterDisplay";
import type { Monster } from "@/types/monster.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import EntityMobileCard from "@/components/common/EntityMobileCard.vue";
import MobileEntityMetaRow from "@/components/common/MobileEntityMetaRow.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useQuota } from "@/composables/billing/useQuota";
import { storeToRefs } from "pinia";
import BulkScopeBar from "@/components/common/BulkScopeBar.vue";
import BulkSelectableCard from "@/components/common/BulkSelectableCard.vue";
import { useBulkSelection } from "@/composables/useBulkSelection";
import { useBulkCampaignScope } from "@/composables/campaign/useBulkCampaignScope";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";

const router = useRouter();
const { canCreate, quota: monsterQuota } = useQuota("monsters");
const showPaywall = ref(false);

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/monsters/new");
}

const ui = useUiStore();
const search = computed(() => ui.monstersSearch);
const typeFilter = computed(() => ui.monstersFilterType);
const sourceFilter = computed(() => ui.monstersFilterSource);
const isMobile = useMediaQuery("(max-width: 767px)");
const layout = computed({
  get: () => ui.entityListLayout,
  set: (v: "rows" | "gallery") => { ui.entityListLayout = v; },
});

const { data: allMonsters, isLoading } = useAllMonsters();

// ── Discovery ────────────────────────────────────────────────────────────────
//
// Only the mobile card's "shared" badge still asks. Managing the reveal — the
// audience and the stat-block gate — is MonsterRevealControl's, which is why
// the hand-positioned popover left this file.

const { data: discoveries } = useCampaignDiscoveries();

function isDiscovered(monster: Monster): boolean {
  return !!discoveries.value?.find(
    (d) => (monster.is_shared ? d.library_monster_id === monster.id : d.monster_id === monster.id),
  );
}

const filtered = computed(() => {
  let list = allMonsters.value ?? [];
  if (sourceFilter.value === "custom") list = list.filter((m) => !m.is_shared);
  else if (sourceFilter.value !== "all") list = list.filter((m) => m.source === sourceFilter.value);
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase();
    list = list.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.monster_type.toLowerCase().includes(q) ||
        m.habitat?.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  if (typeFilter.value !== "all")
    list = list.filter((m) => m.monster_type === typeFilter.value);
  return list;
});

const { savedCount, linkCount } = useScrollRestore("monsters");
const { visibleItems, sentinelRef, visibleCount } = useInfiniteScroll(filtered, 48, savedCount);
linkCount(visibleCount);

const lockedMonsterIds = computed((): Set<string> => {
  const q = monsterQuota.value;
  if (!q || q.unlimited || q.current <= q.limit) return new Set();
  const overCount = q.current - q.limit;
  const customMonsters = (allMonsters.value ?? []).filter(m => !m.is_shared);
  const sorted = [...customMonsters].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  return new Set(sorted.slice(-overCount).map(m => m.id));
});

// Mobile-card subtitle — mirrors the desktop "{size} {type}" line.
function monsterSubtitle(monster: Monster): string {
  return `${monster.size} ${monster.monster_type}`;
}

// ── Bulk selection (#875) ───────────────────────────────────────────────────
//
// Owned here, not in useUiStore: transient per-visit selection, not a list
// filter. Shared/library monsters (monster.is_shared) are never selectable —
// the same flag MonsterGridCard already reads to show its "Reference" chip
// and hide the Edit action, so this reuses an existing distinction rather
// than inventing a new one.
const bulk = useBulkSelection();
const bulkScope = useBulkCampaignScope();
const toast = useToast();
const { activeCampaign } = storeToRefs(useCampaignStore());

// Every row a bulk move may legally touch: passes the current filters and
// isn't shared/library content. Reused by "select all" and by the prune
// below, so both always agree on what's selectable.
const selectableIds = computed(() => filtered.value.filter((m) => !m.is_shared).map((m) => m.id));

// The filters can change (or the underlying list refetch) while rows are
// selected; prune whenever the selectable set changes so a stale id from a
// now-hidden row never lingers in the selection or reaches the mutation
// (#875).
watch(selectableIds, (ids) => bulk.pruneTo(ids));

function selectAllShown() {
  // "Shown" means every row passing the current filters, not just the
  // windowed/painted subset — taken from `filtered`, not `visibleItems`.
  bulk.selectAll(selectableIds.value);
}

async function moveSelection(campaignId: string | null) {
  const ids = bulk.pruneTo(selectableIds.value);
  if (!ids.length) return;
  try {
    const { moved } = await bulkScope.mutateAsync({ table: "monsters", ids, campaignId });
    const noun = moved === 1 ? "monster" : "monsters";
    toast.success(
      campaignId
        ? `Moved ${moved} ${noun} to ${activeCampaign.value?.name ?? "the campaign"}.`
        : `Made ${moved} ${noun} available in all campaigns.`,
    );
    bulk.stop();
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}

function toggleSelectMode() {
  if (bulk.selecting.value) bulk.stop();
  else bulk.selecting.value = true;
}

defineExpose({ selecting: bulk.selecting, toggleSelectMode });
</script>
