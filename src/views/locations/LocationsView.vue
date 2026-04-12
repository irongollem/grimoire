<template>
  <ListPageLayout
    title="Atlas"
    description="Continents, cities, dungeons, and every place in between"
  >
    <template #actions>
      <ListActionButton
        :icon="planarMutation.isPending.value ? Loader2 : Globe"
        :label="planarStatusLabel"
        :disabled="planarMutation.isPending.value"
        @click="handlePopulatePlanes"
      />
      <ListActionButton
        :icon="populateMutation.isPending.value ? Loader2 : MapPin"
        :label="populateStatusLabel"
        :disabled="populateMutation.isPending.value"
        @click="handlePopulate"
      />
      <ListActionButton
        :icon="Plus"
        label="New Location"
        variant="primary"
        to="/locations/new"
      />
    </template>

    <template #filters>
      <ListFilterBar>
        <ListSearchInput v-model="search" placeholder="Search locations…" />
        <ListFilterSelect v-model="typeFilter" aria-label="Location type filter">
          <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <LocationList :search="search" :type-filter="typeFilter" />
  </ListPageLayout>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Plus, Loader2, MapPin, Globe } from "lucide-vue-next";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import LocationList from "@/components/locations/LocationList.vue";
import { usePopulateLocations, usePopulatePlanarLocations } from "@/composables/useLocations";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  ...Object.entries(LOCATION_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

const search = ref("");
const typeFilter = ref("all");

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
    planarError.value = e instanceof Error ? e.message : String(e);
  }
  setTimeout(() => {
    planarStatus.value = "idle";
    planarError.value = null;
  }, 8000);
}
</script>
