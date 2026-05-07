<template>
  <ListPageLayout title="Factions" description="Guilds, cults, governments, and other organisations">
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
        :icon="IconAdd"
        label="New Faction"
        mobile-label="Faction"
        variant="primary"
        to="/factions/new"
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
    />

    <template v-else>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <RouterLink
          v-for="faction in filtered"
          :key="faction.id"
          :to="`/factions/${faction.id}`"
          class="group flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors p-4"
        >
          <div class="shrink-0 h-12 w-12 rounded-lg border border-border bg-muted overflow-hidden flex items-center justify-center">
            <img v-if="faction.emblem_url" :src="faction.emblem_url" alt="" class="w-full h-full object-cover" />
            <IconShield v-else class="h-5 w-5 text-muted-foreground/40" />
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <p class="font-cinzel text-sm font-bold text-foreground truncate flex-1">{{ faction.name }}</p>
              <IconReveal v-if="faction.player_visible_to?.length" class="h-3 w-3 shrink-0 text-elven-green" />
            </div>
            <p v-if="faction.faction_type" class="font-cinzel text-[10px] text-muted-foreground tracking-wider mt-0.5">
              {{ faction.faction_type }}
            </p>
            <div v-if="faction.tags.length" class="flex flex-wrap gap-1 mt-1.5">
              <span
                v-for="tag in faction.tags.slice(0, 3)"
                :key="tag"
                class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider"
              >{{ tag }}</span>
            </div>
          </div>

          <IconChevronRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
        </RouterLink>
      </div>
    </template>
  </ListPageLayout>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconChevronRight, IconGenerate, IconLoading, IconPopulate, IconReveal, IconShield } from '@/lib/icons';
import { useAllFactions, usePopulateFactions } from "@/composables/useFactions";
import { FACTION_TYPES } from "@/types/faction.types";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { getSetting } from "@/settings/index";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";

const ui = useUiStore();
const campaign = useCampaignStore();
const { data: factions, isLoading } = useAllFactions();

const hasSetting = computed(() => !!getSetting(campaign.activeCampaign?.calendar_id ?? ""));

const filtered = computed(() => {
  const q = ui.factionsSearch.trim().toLowerCase();
  return (factions.value ?? []).filter((f) => {
    if (ui.factionsFilterType && f.faction_type !== ui.factionsFilterType) return false;
    if (q && !f.name.toLowerCase().includes(q) && !f.tags.some((t) => t.toLowerCase().includes(q))) return false;
    return true;
  });
});

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
    populateError.value = e instanceof Error ? e.message : "Unknown error";
  }
}
</script>
