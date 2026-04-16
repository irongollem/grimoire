<template>
  <ListPageLayout
    title="NPC Tracker"
    description="The denizens of your realm — allies, enemies, and unknowns"
  >
    <template #actions>
      <ListActionButton :icon="Network" label="Web" to="/npcs/web" />
      <ListActionButton
        v-if="hasSetting"
        :icon="Sparkles"
        :label="populateStatusLabel"
        :disabled="populateMutation.isPending.value"
        @click="handlePopulate"
      />
      <ListActionButton
        :icon="Wand2"
        label="Generate"
        @click="ui.npcGeneratorOpen = true"
      />
      <ListActionButton
        :icon="Plus"
        label="New NPC"
        mobile-label="NPC"
        variant="primary"
        to="/npcs/new"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="hasActiveFilters"
        @clear="clearFilters"
      >
        <!-- Row 1: search (full width) -->
        <template #above>
          <ListSearchInput
            v-model="search"
            placeholder="Search NPCs…"
            :inline="false"
          />
        </template>

        <!-- Row 2: filters + sort (rendered inside the flex-wrap row) -->
        <ListFilterGroup
          v-model="statusFilter"
          :options="STATUS_OPTIONS"
          aria-label="Status filter"
        />
        <ListFilterGroup
          v-model="relFilter"
          :options="REL_OPTIONS"
          aria-label="Relationship filter"
        />

        <EntityCombobox
          :model-value="locationFilter"
          :options="locationOptions"
          placeholder="All locations"
          class="flex-1 min-w-36"
          @update:model-value="locationFilter = $event"
        >
          <template #option="{ opt }">
            <span :style="{ paddingLeft: `${(opt as LocationOption).depth * 12}px` }">{{ opt.name }}</span>
          </template>
        </EntityCombobox>

        <EntityCombobox
          :model-value="partyMemberFilter"
          :options="partyOptions"
          placeholder="Connected to…"
          class="flex-1 min-w-36"
          @update:model-value="partyMemberFilter = $event"
        />

        <ListFilterGroup
          v-model="sortBy"
          :options="SORT_OPTIONS"
          aria-label="Sort by"
        />
      </ListFilterBar>
    </template>

    <NpcList
      :search="search"
      :status-filter="statusFilter"
      :rel-filter="relFilter"
      :location-filter="locationFilter"
      :party-member-filter="partyMemberFilter"
      :sort-by="sortBy"
    />
  </ListPageLayout>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import type { NpcStatus, NpcRelationship } from "@/types/npc.types";
import { Plus, Wand2, Sparkles, Network } from "lucide-vue-next";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import NpcList from "@/components/npcs/NpcList.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useLocationTree } from "@/composables/useLocations";
import { useParty } from "@/composables/useParty";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { getSetting } from "@/settings/index";
import { usePopulateSettingNpcs } from "@/composables/useNpcs";

type LocationOption = { id: string; name: string; depth: number };

const ui = useUiStore();
const campaign = useCampaignStore();
const { locationOptions } = useLocationTree();
const { data: party } = useParty();

const hasSetting = computed(() => !!getSetting(campaign.activeCampaign?.calendar_id ?? ""));

const populateMutation = usePopulateSettingNpcs();
const populateStatus = ref<"idle" | "done" | "uptodate">("idle");
const populatedCount = ref(0);
const populateError = ref<string | null>(null);

const populateStatusLabel = computed(() => {
  if (populateMutation.isPending.value) return "Populating…";
  if (populateError.value) return `Error: ${populateError.value}`;
  if (populateStatus.value === "done") return `Added ${populatedCount.value} NPC${populatedCount.value !== 1 ? "s" : ""}`;
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

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "alive", label: "Alive" },
  { value: "dead", label: "Dead" },
  { value: "missing", label: "Missing" },
  { value: "unknown", label: "?" },
] as const satisfies ReadonlyArray<{ value: NpcStatus | "all"; label: string }>;

const REL_OPTIONS = [
  { value: "all", label: "All" },
  { value: "ally", label: "Ally" },
  { value: "neutral", label: "Neutral" },
  { value: "enemy", label: "Enemy" },
] as const satisfies ReadonlyArray<{ value: NpcRelationship | "all"; label: string }>;

const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "location", label: "Location" },
] as const satisfies ReadonlyArray<{ value: "name" | "location"; label: string }>;

const search = computed({ get: () => ui.npcsSearchQuery, set: (v) => { ui.npcsSearchQuery = v; } });
const statusFilter = computed({ get: () => ui.npcsFilterStatus, set: (v: NpcStatus | "all") => { ui.npcsFilterStatus = v; } });
const relFilter = computed({ get: () => ui.npcsFilterRelationship, set: (v: NpcRelationship | "all") => { ui.npcsFilterRelationship = v; } });
const locationFilter = computed({ get: () => ui.npcsFilterLocation, set: (v) => { ui.npcsFilterLocation = v; } });
const partyMemberFilter = computed({ get: () => ui.npcsFilterPartyMember, set: (v) => { ui.npcsFilterPartyMember = v; } });
const sortBy = computed({ get: () => ui.npcsFilterSortBy, set: (v) => { ui.npcsFilterSortBy = v; } });

const partyOptions = computed(() => (party.value ?? []).map((m) => ({ id: m.id, name: m.name })));

const hasActiveFilters = computed(() => ui.npcsHasActiveFilters);
function clearFilters() { ui.resetNpcsFilters(); }
</script>
