<template>
  <PageHeader
    title="Atlas"
    description="Continents, cities, dungeons, and every place in between"
  >
    <template #actions>
      <button
        type="button"
        :disabled="planarMutation.isPending.value"
        class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
        @click="handlePopulatePlanes"
      >
        <Loader2 v-if="planarMutation.isPending.value" class="size-3.5 animate-spin shrink-0" />
        <Globe v-else class="size-3.5 shrink-0" />
        {{ planarStatusLabel }}
      </button>
      <button
        type="button"
        :disabled="populateMutation.isPending.value"
        class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
        @click="handlePopulate"
      >
        <Loader2 v-if="populateMutation.isPending.value" class="size-3.5 animate-spin shrink-0" />
        <MapPin v-else class="size-3.5 shrink-0" />
        {{ populateStatusLabel }}
      </button>
      <RouterLink
        to="/locations/new"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
      >
        <Plus class="h-3.5 w-3.5" />
        New Location
      </RouterLink>
    </template>

    <template #sticky>
      <div class="flex items-center gap-2">
        <div class="relative flex-1 min-w-48">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            v-model="search"
            type="text"
            placeholder="Search locations…"
            class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <select
          v-model="typeFilter"
          class="bg-card border border-border rounded-md px-2 py-1.5 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
    </template>

    <LocationList :search="search" :type-filter="typeFilter" />
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Plus, Loader2, MapPin, Globe, Search } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
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
