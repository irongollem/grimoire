<template>
  <ListPageLayout title="Factions" description="Guilds, cults, governments, and other organisations">
    <template #title-suffix>
      <ManualHelpLink page="factions" />
    </template>

    <template #actions>
      <ListActionButton
        v-if="hasSetting"
        :icon="populateMutation.isPending.value ? IconLoading : IconPopulate"
        :label="populateStatusLabel"
        :disabled="populateMutation.isPending.value"
        @click="handlePopulate"
      />
      <ListActionButton
        :icon="IconGenerate"
        label="Generate"
        @click="ui.factionGeneratorOpen = true"
      />
      <ListActionButton
        variant="primary"
        :icon="IconAdd"
        label="New Faction"
        mobile-label="Faction"
        @click="handleNew"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="ui.factionsHasActiveFilters"
        @clear="ui.resetFactionsFilters()"
      >
        <ListSearchInput v-model="ui.factionsSearch" placeholder="Filter factions…" />
        <ListFilterSelect v-model="ui.factionsFilterType" aria-label="Faction type filter">
          <option value="">All types</option>
          <option v-for="t in FACTION_TYPES" :key="t" :value="t">{{ t }}</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!factions?.length"
      title="No factions yet"
      description="Create guilds, cults, governments and other organisations."
    >
      <template #icon><IconNavFactions class="h-16 w-16" /></template>
    </EmptyState>

    <template v-else>
    <!--
      Paged and position-restoring like the NPC and monster grids. No mobile
      card swap, though, and that is deliberate rather than unfinished:
      `EntityMobileCard`'s "rows" layout is this row, and it is a `RouterLink`
      wrapper — so adopting it would trade a working reveal control for a
      read-only eye at exactly the width where the control is hardest to reach
      another way. `EntityListRow` uses the link-overlay trick precisely so it
      can hold a button, and it already reflows to one column.
    -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <EntityListRow
          v-for="faction in visibleItems"
          :key="faction.id"
          :to="`/factions/${faction.id}`"
          :title="faction.name"
          :subtitle="faction.faction_type"
          :image-url="faction.emblem_url"
          :fallback-icon="IconShield"
          :tags="faction.tags"
        >
          <template #actions>
            <AudienceRevealControl
              :name="faction.name"
              :visible-to="faction.player_visible_to"
              form="inline"
              @change="(next) => revealFaction(faction.id, next)"
            />
          </template>
        </EntityListRow>
      </div>
    </template>

    <div ref="sentinelRef" />
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="factions" />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconGenerate, IconLoading, IconNavFactions, IconPopulate, IconShield } from '@/lib/icons';
import { useAllFactions, usePopulateFactions, useUpdateFaction } from "@/composables/useFactions";
import { FACTION_TYPES } from "@/types/faction.types";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { getSetting } from "@/settings/index";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import AudienceRevealControl from "@/components/common/AudienceRevealControl.vue";
import EntityListRow from "@/components/common/EntityListRow.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useCreateGate } from "@/composables/useCreateGate";
import { useInfiniteScroll } from "@/composables/useInfiniteScroll";
import { useScrollRestore } from "@/composables/useScrollRestore";

const ui = useUiStore();
const campaign = useCampaignStore();
const { data: factions, isLoading } = useAllFactions();
const { mutate: updateFaction } = useUpdateFaction();

function revealFaction(id: string, playerVisibleTo: string[]) {
  updateFaction({ id, update: { player_visible_to: playerVisibleTo } });
}

const { showPaywall, handleNew, gateQuotaError } = useCreateGate("factions", "/factions/new");

const hasSetting = computed(() => !!getSetting(campaign.activeCampaign?.calendar_id ?? ""));

const filtered = computed(() => {
  const q = ui.factionsSearch.trim().toLowerCase();
  return (factions.value ?? []).filter((f) => {
    if (ui.factionsFilterType && f.faction_type !== ui.factionsFilterType) return false;
    if (q && !f.name.toLowerCase().includes(q) && !f.tags.some((t) => t.toLowerCase().includes(q))) return false;
    return true;
  });
});

// `sentinelRef` must stay destructured — the template binds it as a plain
// `ref="sentinelRef"` string, which is never typechecked, so dropping it leaves
// the ref null and the list silently capped at 48 with every gate green.
const { savedCount, linkCount } = useScrollRestore("factions");
const { visibleItems, sentinelRef, visibleCount } = useInfiniteScroll(filtered, 48, savedCount);
linkCount(visibleCount);

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
</script>
