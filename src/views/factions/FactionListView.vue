<template>
  <ListPageLayout title="Factions" description="Guilds, cults, governments, and other organisations">
    <template #title-suffix>
      <ManualHelpLink page="factions" />
    </template>

    <template #actions>
      <ListActionButton
        v-if="hasSetting"
        :icon="IconPopulate"
        :loading="populateMutation.isPending.value"
        :label="populateStatusLabel"
        :disabled="populateMutation.isPending.value"
        @click="handlePopulate"
      />
      <ListActionButton
        v-if="isAiEnabled"
        :icon="IconGenerate"
        label="Generate"
        @click="generatorsUi.factionGeneratorOpen = true"
      />
      <ListActionButton
        :active="selecting"
        :icon="IconCheck"
        label="Select"
        @click="toggleSelecting"
      />
      <ListActionButton
        variant="primary"
        :icon="IconAdd"
        label="New Faction"
        mobile-label="Faction"
        @click="handleNew"
      />
      <ListLayoutToggle v-model="layout" />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="factionsUi.factionsHasActiveFilters"
        @clear="factionsUi.resetFactionsFilters()"
      >
        <ListSearchInput v-model="factionsUi.factionsSearch" placeholder="Filter factions…" />
        <ListFilterSelect v-model="factionsUi.factionsFilterType" aria-label="Faction type filter">
          <option value="">All types</option>
          <option v-for="t in FACTION_TYPES" :key="t" :value="t">{{ t }}</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <ListSkeleton v-if="isLoading" :variant="layout === 'grid' ? 'grid' : 'tiles'" :columns="3" :count="9" />

    <EmptyState
      v-else-if="!factions?.length"
      title="No factions yet"
      description="Create guilds, cults, governments and other organisations."
    >
      <template #icon><IconNavFactions class="h-16 w-16" /></template>
    </EmptyState>

    <template v-else>
    <BulkScopeBar
      v-if="selecting"
      :count="selectedCount"
      :selectable-count="selectableIds.length"
      :busy="isMovingScope"
      :campaign-name="campaign.activeCampaign?.name ?? null"
      :allow-general-scope="allowGeneralScope"
      class="mb-3"
      @select-all="selectAll(selectableIds)"
      @clear="clearSelection"
      @stop="stopSelecting"
      @move="handleMove"
      @copy="handleCopyOpen"
    >
      <BulkOpenBookActions
        entity-type="faction"
        noun="faction"
        :selected-ids="[...selectedIds]"
        :is-eligible="factionBookEligible"
        :busy="isMovingScope"
      />
    </BulkScopeBar>
    <!--
      Windowed and position-restoring like the NPC and monster grids. No mobile
      card swap, though, and that is deliberate rather than unfinished:
      `EntityMobileCard`'s "rows" layout is this row, and it is a `RouterLink`
      wrapper, so adopting it would trade a working reveal control for a
      read-only eye at exactly the width where the control is hardest to reach
      another way. `EntityListRow` uses the link-overlay trick precisely so it
      can hold a button, and it already reflows to one column.
    -->
    <EntityCollection
      :items="filtered"
      :item-key="factionKey"
      :layout="layout"
      :grid-columns="columns"
      :grid-row-estimate="GRID_ROW_PX"
      :row-estimate="ROW_PX"
      :row-columns="columns"
    >
      <template #card="{ item: faction }">
        <BulkSelectableCard
          corner="top-left"
          :selected="isSelected(faction.id)"
          :selecting="selecting"
          @toggle="toggleRowSelection(faction.id)"
        >
          <EntityGridCard
            :to="`/factions/${faction.id}`"
            :title="faction.name"
            :image-url="faction.emblem_url"
            :placeholder="placeholderUrl('faction')"
          >
            <template #actions-end>
              <div @click.prevent.stop>
                <AudienceRevealControl
                  :name="faction.name"
                  :visible-to="faction.player_visible_to"
                  :book-entry="{ type: 'faction', id: faction.id }"
                  form="overlay"
                  @change="(next) => revealFaction(faction.id, next)"
                />
              </div>
            </template>
            <template #body>
              <p class="truncate text-heading-xs font-bold text-foreground">{{ faction.name }}</p>
              <p class="truncate text-label text-muted-foreground">{{ faction.faction_type }}</p>
              <RelationshipMark v-if="faction.party_standing !== 'unknown'" :relationship="faction.party_standing" />
              <div v-if="faction.tags.length" class="mt-auto flex flex-wrap gap-1 pt-1">
                <span
                  v-for="tag in faction.tags.slice(0, 3)"
                  :key="tag"
                  class="rounded bg-muted px-1.5 py-0.5 text-label text-muted-foreground"
                >{{ tag }}</span>
              </div>
            </template>
          </EntityGridCard>
        </BulkSelectableCard>
      </template>
      <template #row="{ item: faction }">
        <BulkSelectableCard
          corner="top-left"
          :selected="isSelected(faction.id)"
          :selecting="selecting"
          @toggle="toggleRowSelection(faction.id)"
        >
          <EntityListRow
            :to="`/factions/${faction.id}`"
            :title="faction.name"
            :subtitle="faction.faction_type"
            :image-url="faction.emblem_url"
            :fallback-icon="IconShield"
            :tags="faction.tags"
          >
            <template v-if="faction.party_standing !== 'unknown'" #body>
              <RelationshipMark :relationship="faction.party_standing" class="mt-1.5" />
            </template>
            <template #actions>
              <AudienceRevealControl
                :name="faction.name"
                :visible-to="faction.player_visible_to"
                :book-entry="{ type: 'faction', id: faction.id }"
                form="inline"
                @change="(next) => revealFaction(faction.id, next)"
              />
            </template>
          </EntityListRow>
        </BulkSelectableCard>
      </template>
    </EntityCollection>
    </template>
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="factions" />

  <CopyToCampaignDialog
    :open="copyOpen"
    table="factions"
    :ids="copyIds"
    label="faction"
    @close="copyOpen = false"
    @copied="onCopied"
    @quota-exceeded="onQuotaExceeded"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { IconAdd, IconCheck, IconGenerate, IconNavFactions, IconPopulate, IconShield } from '@/lib/icons';
import { useAllFactions, usePopulateFactions, useUpdateFaction } from "@/composables/factions/useFactions";
import { FACTION_TYPES } from "@/types/faction.types";
import { useFactionsUiStore } from "@/stores/ui/factions";
import { useGeneratorUiStore } from "@/stores/ui/generators";
import { useCampaignStore } from "@/stores/campaign";
import { getSetting } from "@/settings/index";
import ListPageLayout from "@/components/common/list/ListPageLayout.vue";
import ListActionButton from "@/components/common/list/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ListFilterBar from "@/components/common/list/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/list/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/list/ListSearchInput.vue";
import AudienceRevealControl from "@/components/common/reveal/AudienceRevealControl.vue";
import EntityListRow from "@/components/common/entity/EntityListRow.vue";
import RelationshipMark from "@/components/common/entity/RelationshipMark.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { wholeParty } from "@/lib/openBook/eligibility";
import BulkOpenBookActions from "@/components/common/list/BulkOpenBookActions.vue";
import BulkScopeBar from "@/components/common/list/BulkScopeBar.vue";
import BulkSelectableCard from "@/components/common/list/BulkSelectableCard.vue";
import CopyToCampaignDialog from "@/components/common/overlays/CopyToCampaignDialog.vue";
import { useCreateGate } from "@/composables/billing/useCreateGate";
import { useScrollRestore } from "@/composables/useScrollRestore";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import EntityCollection from "@/components/common/list/EntityCollection.vue";
import EntityGridCard from "@/components/common/entity/EntityGridCard.vue";
import ListLayoutToggle from "@/components/common/list/ListLayoutToggle.vue";
import { useListLayout } from "@/composables/useListLayout";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { useBulkSelection } from "@/composables/useBulkSelection";
import { useCopyToCampaignFlow } from "@/composables/campaign/useCopyToCampaignFlow";
import { useMoveToCampaignFlow } from "@/composables/campaign/useMoveToCampaignFlow";
import { bulkScopeAllowsGeneral } from "@/composables/campaign/useBulkCampaignScope";

const factionsUi = useFactionsUiStore();
const generatorsUi = useGeneratorUiStore();
const campaign = useCampaignStore();
const isAiEnabled = computed(() => campaign.isAiEnabled);

// faction_deities has a NOT NULL campaign_id (#885) — a general move can
// never carry a faction's deity links, so the bar never offers it here. See
// bulkScopeAllowsGeneral's docstring and BulkScopeBar's allowGeneralScope.
const allowGeneralScope = bulkScopeAllowsGeneral("factions");
const { data: factions, isLoading } = useAllFactions();
const { mutate: updateFaction } = useUpdateFaction();

function revealFaction(id: string, playerVisibleTo: string[]) {
  updateFaction({ id, update: { player_visible_to: playerVisibleTo } });
}

const { showPaywall, handleNew, gateQuotaError } = useCreateGate("factions", "/factions/new");

const hasSetting = computed(() => !!getSetting(campaign.activeCampaign?.calendar_id ?? ""));

const filtered = computed(() => {
  const q = factionsUi.factionsSearch.trim().toLowerCase();
  return (factions.value ?? []).filter((f) => {
    if (factionsUi.factionsFilterType && f.faction_type !== factionsUi.factionsFilterType) return false;
    if (q && !f.name.toLowerCase().includes(q) && !f.tags.some((t) => t.toLowerCase().includes(q))) return false;
    return true;
  });
});

// The whole filtered list is in hand, so only the scroll position needs
// restoring; VirtualGrid windows what is mounted.
useScrollRestore("factions");

// Mirrors the grid classes this list used to carry:
// `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3`.
const columns = useBreakpointColumns({ base: 1, sm: 2, lg: 3 });
// The page header's toggle writes the same key. Rows is today's look.
const layout = useListLayout("factions", "rows");
const factionKey = (faction: { id: string }) => faction.id;

// Row height before a row is measured (px): 82-107px across 26 factions, 88 the median, measured at a 390px
// phone on 8 Oct 2026 over the dev:campaigns fixture. It decides where a
// restored scroll lands, since coming back from a detail re-renders every
// unmeasured row above the viewport.
const ROW_PX = 88;
// Grid card height before it is measured (px): 2 border + 144 artwork + 24
// padding + about 80 body (name, type, standing, tags).
const GRID_ROW_PX = 250;

const populateMutation = usePopulateFactions();
const populateStatus = ref<"idle" | "done" | "uptodate">("idle");
const populatedCount = ref(0);
const populateError = ref<string | null>(null);

const populateStatusLabel = computed(() => {
  if (populateMutation.isPending.value) return "Populating…";
  if (populateError.value) return `Error: ${populateError.value}`;
  if (populateStatus.value === "done") return `Added ${populatedCount.value} faction${populatedCount.value !== 1 ? "s" : ""}`;
  if (populateStatus.value === "uptodate") return "Already up to date";
  return "Populate Setting";
});

async function handlePopulate() {
  populateStatus.value = "idle";
  populateError.value = null;
  try {
    const count = await populateMutation.mutateAsync();
    populatedCount.value = count;
    populateStatus.value = count === 0 ? "uptodate" : "done";
  } catch (e) {
    if (gateQuotaError(e)) return; // free-tier cap hit → show paywall, not a raw error
    populateError.value = e instanceof Error ? e.message : "Unknown error";
  }
}

// ── Bulk selection (#885) ───────────────────────────────────────────────────
//
// Owned here, not in a domain UI store: transient per-visit selection, not a list
// filter — mirrors MonsterList.vue/NpcList.vue. No faction row is shared/
// library content, so every filtered row is selectable.
const {
  selecting,
  count: selectedCount,
  selectedIds,
  isSelected,
  toggle: toggleRowSelection,
  selectAll,
  clear: clearSelection,
  stop: stopSelecting,
  pruneTo,
} = useBulkSelection();

function factionBookEligible(id: string, partyIds: readonly string[]): boolean {
  return wholeParty(factions.value?.find((f) => f.id === id)?.player_visible_to, partyIds);
}

function toggleSelecting() {
  if (selecting.value) stopSelecting();
  else selecting.value = true;
}

// Every row a bulk move/copy may legally touch: passes the current filters.
// Reused by "select all" and by the prune below, so both always agree on
// what's selectable.
const selectableIds = computed(() => filtered.value.map((f) => f.id));

// The filters can change (or the underlying list refetch) while rows are
// selected; prune whenever the selectable set changes so a stale id from a
// now-hidden row never lingers in the selection or reaches the mutation
// (#875).
watch(selectableIds, (ids) => pruneTo(ids));

const { moving: isMovingScope, move: handleMove } = useMoveToCampaignFlow({
  table: "factions",
  noun: "faction",
  selectableIds: () => selectableIds.value,
  pruneTo,
  stop: stopSelecting,
  campaignName: () => campaign.activeCampaign?.name ?? null,
});

// ── Copy to campaign (#885) ─────────────────────────────────────────────────
//
// factions carries the enforce_quota trigger — the dialog surfaces a rejected
// insert as a `quota-exceeded` event rather than owning a paywall itself; this
// reuses the same PaywallModal this file already mounts for its own create
// flow via the flow's callback.
const { copyOpen, copyIds, openCopy: handleCopyOpen, onCopied, onQuotaExceeded } = useCopyToCampaignFlow({
  noun: "faction",
  selectableIds: () => selectableIds.value,
  pruneTo,
  stop: stopSelecting,
  onQuotaExceeded: () => { showPaywall.value = true; },
});
</script>
