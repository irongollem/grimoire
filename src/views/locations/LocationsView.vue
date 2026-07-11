<template>
  <ListPageLayout
    title="Atlas"
    description="Continents, cities, dungeons, and every place in between"
  >
    <template #actions>
      <ListActionButton
        :icon="planarMutation.isPending.value ? IconLoading : IconFaction"
        :label="planarStatusLabel"
        :disabled="planarMutation.isPending.value"
        @click="handlePopulatePlanes"
      />
      <ListActionButton
        :icon="populateMutation.isPending.value ? IconLoading : IconPopulate"
        :label="populateStatusLabel"
        :disabled="populateMutation.isPending.value"
        @click="handlePopulate"
      />
      <ListActionButton
        :icon="IconGenerate"
        label="Generate"
        @click="ui.locationGeneratorOpen = true"
      />
      <ListActionButton
        :icon="IconAdd"
        label="New Location"
        mobile-label="Location"
        variant="primary"
        @click="handleNew"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="ui.locationsHasActiveFilters"
        @clear="ui.resetLocationsFilters()"
      >
        <ListSearchInput v-model="ui.locationsSearch" placeholder="Search locations…" />
        <ListFilterSelect v-model="ui.locationsFilterType" aria-label="Location type filter">
          <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <LocationList :search="ui.locationsSearch" :type-filter="ui.locationsFilterType" />
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="locations" />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconFaction, IconGenerate, IconLoading, IconPopulate } from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import LocationList from "@/components/locations/LocationList.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useCreateGate } from "@/composables/useCreateGate";
import { usePopulateLocations, usePopulatePlanarLocations } from "@/composables/useLocations";
import { useUiStore } from "@/stores/ui";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";

const ui = useUiStore();
const { showPaywall, handleNew, gateQuotaError } = useCreateGate("locations", "/locations/new");

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  ...Object.entries(LOCATION_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

const populateMutation = usePopulateLocations();
const populateStatus = ref<"idle" | "done" | "uptodate">("idle");
const populatedCount = ref(0);
const populateError = ref<string | null>(null);

const populateStatusLabel = computed(() => {
  if (populateMutation.isPending.value) return "Populating…";
  if (populateError.value) return `Error: ${populateError.value}`;
  if (populateStatus.value === "done") return `Added ${populatedCount.value} locations`;
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
    populateError.value = e instanceof Error ? e.message : String(e);
  }
  setTimeout(() => {
    populateStatus.value = "idle";
    populateError.value = null;
  }, 8000);
}

const planarMutation = usePopulatePlanarLocations();
const planarStatus = ref<"idle" | "done" | "uptodate">("idle");
const planarCount = ref(0);
const planarError = ref<string | null>(null);

const planarStatusLabel = computed(() => {
  if (planarMutation.isPending.value) return "Populating…";
  if (planarError.value) return `Error: ${planarError.value}`;
  if (planarStatus.value === "done") return `Added ${planarCount.value} planes`;
  if (planarStatus.value === "uptodate") return "Planes up to date";
  return "Populate Planes";
});

async function handlePopulatePlanes() {
  planarStatus.value = "idle";
  planarError.value = null;
  try {
    const count = await planarMutation.mutateAsync();
    planarCount.value = count;
    planarStatus.value = count === 0 ? "uptodate" : "done";
  } catch (e) {
    if (gateQuotaError(e)) return; // free-tier cap hit → show paywall, not a raw error
    planarError.value = e instanceof Error ? e.message : String(e);
  }
  setTimeout(() => {
    planarStatus.value = "idle";
    planarError.value = null;
  }, 8000);
}
</script>
