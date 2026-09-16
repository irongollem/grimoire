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

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="
        !filtered.length &&
        !props.search &&
        props.statusFilter === 'all' &&
        props.relFilter === 'all' &&
        !props.locationFilter &&
        !props.partyMemberFilter
      "
      title="No NPCs yet"
      description="Populate your realm with merchants, villains, sages, and more."
    >
      <template #icon><IconNavNpcs class="h-16 w-16" /></template>
      <template #action>
        <AppButton variant="primary" size="lg" label="Add your first NPC" @click="handleNew" />
      </template>
    </EmptyState>

    <p
      v-else-if="!filtered.length"
      class="text-center text-body text-muted-foreground italic py-12"
    >
      No NPCs match your filters.
    </p>

    <!-- ── Mobile list (<md): compact rows / gallery ─────────────────────── -->
    <template v-else-if="isMobile">
      <MobileEntityMetaRow
        v-model:layout="layout"
        :shown="filtered.length"
        :total="npcs?.length ?? 0"
        plural="NPCs"
      />
      <div
        :class="
          layout === 'gallery'
            ? 'grid grid-cols-2 gap-3 pb-2'
            : 'flex flex-col gap-2 pb-2'
        "
      >
        <BulkSelectableCard
          v-for="npc in visibleItems"
          :key="npc.id"
          corner="bottom-right"
          :selected="bulk.isSelected(npc.id)"
          :selecting="bulk.selecting.value"
          @toggle="bulk.toggle(npc.id)"
        >
          <EntityMobileCard
            :layout="layout"
            :to="`/npcs/${npc.id}`"
            :title="getNpcDisplayName(npc) ?? '???'"
            :subtitle="npcSubtitle(npc)"
            :image-url="getNpcDisplayPortrait(npc)"
            :focal-point="getNpcDisplayFocalPoint(npc)"
            :placeholder="placeholderUrl('npc')"
            :badge-text="npc.relationship"
            :badge-class="npcRelationshipBg(npc.relationship)"
            :status-class="npcStatusBg(npc.status)"
            :location="
              npc.location_id ? locationName(npc.location_id) : undefined
            "
            :shared="isShared(npc)"
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
        v-for="npc in visibleItems"
        :key="npc.id"
        corner="bottom-right"
        :selected="bulk.isSelected(npc.id)"
        :selecting="bulk.selecting.value"
        @toggle="bulk.toggle(npc.id)"
      >
        <NpcGridCard
          :npc="npc"
          :location-name="
            npc.location_id ? locationName(npc.location_id) : undefined
          "
          :locked="lockedNpcIds.has(npc.id)"
        />
      </BulkSelectableCard>
    </div>

    <div ref="sentinelRef" />

    <p
      v-if="filtered.length && !isMobile"
      class="mt-4 text-caption text-muted-foreground italic text-right"
    >
      {{ filtered.length }} of {{ npcs?.length ?? 0 }} NPCs
    </p>
  </div>

  <PaywallModal v-model="showPaywall" resource="npcs" />

  <CopyToCampaignDialog
    :open="copyOpen"
    table="npcs"
    :ids="copyIds"
    label="NPC"
    @close="copyOpen = false"
    @copied="onCopied"
    @quota-exceeded="onQuotaExceeded"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useMediaQuery } from "@vueuse/core";
import { useInfiniteScroll } from "@/composables/useInfiniteScroll";
import { useScrollRestore } from "@/composables/useScrollRestore";
import { IconNavNpcs } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useNpcPcNotesByPartyMember } from "@/composables/npcs/useNpcPcNotes";
import { useAllLocations, useLocationTree } from "@/composables/locations/useLocations";
import { useUiStore } from "@/stores/ui";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import EntityMobileCard from "@/components/common/EntityMobileCard.vue";
import MobileEntityMetaRow from "@/components/common/MobileEntityMetaRow.vue";
import NpcGridCard from "@/components/npcs/NpcGridCard.vue";
import {
  getNpcDisplayName,
  getNpcDisplayPortrait,
  getNpcDisplayFocalPoint,
  npcRelationshipBg,
  npcStatusBg,
} from "@/lib/npcDisplay";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import type { Npc } from "@/types/npc.types";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useQuota } from "@/composables/billing/useQuota";
import { storeToRefs } from "pinia";
import BulkScopeBar from "@/components/common/BulkScopeBar.vue";
import BulkSelectableCard from "@/components/common/BulkSelectableCard.vue";
import CopyToCampaignDialog from "@/components/common/CopyToCampaignDialog.vue";
import { useBulkSelection } from "@/composables/useBulkSelection";
import { useCopyToCampaignFlow } from "@/composables/campaign/useCopyToCampaignFlow";
import { useMoveToCampaignFlow } from "@/composables/campaign/useMoveToCampaignFlow";
import { useCampaignStore } from "@/stores/campaign";

const router = useRouter();
const { canCreate, quota: npcQuota } = useQuota("npcs");
const showPaywall = ref(false);

function handleNew() {
  if (!canCreate.value) {
    showPaywall.value = true;
    return;
  }
  router.push("/npcs/new");
}

const props = defineProps<{
  search: string;
  statusFilter: string;
  relFilter: string;
  locationFilter: string;
  partyMemberFilter: string;
  sortBy: "name" | "location";
}>();

const { data: npcs, isLoading } = useNpcs();
const ui = useUiStore();
const isMobile = useMediaQuery("(max-width: 767px)");
const layout = computed({
  get: () => ui.entityListLayout,
  set: (v: "rows" | "gallery") => {
    ui.entityListLayout = v;
  },
});

const { data: connectedNpcIds } = useNpcPcNotesByPartyMember(
  computed(() => props.partyMemberFilter),
);
const { data: allLocations } = useAllLocations();
const { locationOptions, getDescendantIds } = useLocationTree();

const locationMap = computed(() => {
  const m = new Map<string, string>();
  for (const loc of allLocations.value ?? []) m.set(loc.id, loc.name);
  return m;
});

const locationOrder = computed(() => {
  const m = new Map<string, number>();
  locationOptions.value.forEach((loc, i) => m.set(loc.id, i));
  return m;
});

function locationName(id: string) {
  return locationMap.value.get(id) ?? "Unknown";
}

const filtered = computed(() => {
  let list = npcs.value ?? [];
  if (props.search.trim()) {
    const q = props.search.trim().toLowerCase();
    list = list.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.disguise_name?.toLowerCase().includes(q) ||
        n.race?.toLowerCase().includes(q) ||
        n.occupation?.toLowerCase().includes(q) ||
        (n.location_id
          ? locationMap.value.get(n.location_id)?.toLowerCase().includes(q)
          : false) ||
        n.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  if (props.statusFilter !== "all")
    list = list.filter((n) => n.status === props.statusFilter);
  if (props.relFilter !== "all")
    list = list.filter((n) => n.relationship === props.relFilter);
  if (props.locationFilter) {
    const locationIds = getDescendantIds(props.locationFilter);
    list = list.filter((n) => n.location_id && locationIds.has(n.location_id));
  }
  if (props.partyMemberFilter) {
    const ids = connectedNpcIds.value ?? new Set<string>();
    list = list.filter((n) => ids.has(n.id));
  }
  if (props.sortBy === "location") {
    const order = locationOrder.value;
    list = [...list].sort((a, b) => {
      const ai = a.location_id
        ? (order.get(a.location_id) ?? Infinity)
        : Infinity;
      const bi = b.location_id
        ? (order.get(b.location_id) ?? Infinity)
        : Infinity;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name);
    });
  } else {
    list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  }
  return list;
});

const { savedCount, linkCount } = useScrollRestore("npcs");
// `sentinelRef` must stay destructured: the template binds `ref="sentinelRef"`,
// which is a plain string attribute and therefore never typechecked. Dropping it
// leaves the ref permanently null, so useInfiniteScroll never attaches its
// observer and the grid silently stops at the first 48 — with lint, typecheck
// and build all green.
const { visibleItems, sentinelRef, visibleCount } = useInfiniteScroll(filtered, 48, savedCount);
linkCount(visibleCount);

const lockedNpcIds = computed((): Set<string> => {
  const q = npcQuota.value;
  if (!q || q.unlimited || q.current <= q.limit) return new Set();
  const overCount = q.current - q.limit;
  const sorted = [...(npcs.value ?? [])].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  return new Set(sorted.slice(-overCount).map((n) => n.id));
});



// Mobile-card subtitle — mirrors the desktop "{race} - {occupation}" line,
// gracefully collapsing when one half is missing.
function npcSubtitle(npc: Npc): string | undefined {
  const parts = [npc.race, npc.occupation].filter(Boolean) as string[];
  return parts.length ? parts.join(" - ") : undefined;
}

// ── Sharing ───────────────────────────────────────────────────────────────────
//
// The mobile card still wants to know whether an NPC is shared, to draw its
// badge. Everything else — the audience, the field list, the default fields on
// first reveal, the play-mode narration — is `NpcRevealControl`'s, which is why
// ~90 lines of popover left this file.

function isShared(npc: Npc): boolean {
  return npc.player_visible_to.length > 0;
}

// ── Bulk selection (#885) ───────────────────────────────────────────────────
//
// Owned here, not in useUiStore: transient per-visit selection, not a list
// filter — mirrors MonsterList.vue. Unlike monsters, no NPC row is shared/
// library content, so every filtered row is selectable.
const bulk = useBulkSelection();
const { activeCampaign } = storeToRefs(useCampaignStore());

// Every row a bulk move/copy may legally touch: passes the current filters.
// Reused by "select all" and by the prune below, so both always agree on
// what's selectable.
const selectableIds = computed(() => filtered.value.map((n) => n.id));

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

const { moving: bulkMoving, move: moveSelection } = useMoveToCampaignFlow({
  table: "npcs",
  noun: "NPC",
  selectableIds: () => selectableIds.value,
  pruneTo: bulk.pruneTo,
  stop: bulk.stop,
  campaignName: () => activeCampaign.value?.name ?? null,
});

function toggleSelectMode() {
  if (bulk.selecting.value) bulk.stop();
  else bulk.selecting.value = true;
}

// ── Copy to campaign (#885) ─────────────────────────────────────────────────
//
// Same pruning discipline as moveSelection — `useCopyToCampaignFlow` owns
// that. npcs carries the enforce_quota trigger — the dialog surfaces a
// rejected insert as a `quota-exceeded` event rather than owning a paywall
// itself; this reuses the same PaywallModal this file already mounts for its
// own create flow via the flow's callback.
const {
  copyOpen,
  copyIds,
  openCopy: openCopyDialog,
  onCopied,
  onQuotaExceeded,
} = useCopyToCampaignFlow({
  noun: "NPC",
  selectableIds: () => selectableIds.value,
  pruneTo: bulk.pruneTo,
  stop: bulk.stop,
  onQuotaExceeded: () => { showPaywall.value = true; },
});

defineExpose({ selecting: bulk.selecting, toggleSelectMode });
</script>
