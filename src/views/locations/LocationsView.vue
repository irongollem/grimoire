<template>
  <ListPageLayout
    title="Atlas"
    description="Continents, cities, dungeons, and every place in between"
  >
    <template #title-suffix>
      <ManualHelpLink page="atlas-locations" />
    </template>

    <template #actions>
      <ListActionButton
        :icon="planarMutation.isPending.value ? IconLoading : IconFaction"
        :label="planarMutation.isPending.value ? 'Populating…' : 'Populate Planes'"
        tooltip="Add the planes of existence as places"
        :disabled="planarMutation.isPending.value"
        @click="handlePopulatePlanes"
      />
      <ListActionButton
        :icon="populateMutation.isPending.value ? IconLoading : IconPopulate"
        :label="populateMutation.isPending.value ? 'Populating…' : 'Populate Setting'"
        tooltip="Add the well-known places of your campaign's setting"
        :disabled="populateMutation.isPending.value"
        @click="handlePopulate"
      />
      <ListActionButton
        v-if="isAiEnabled"
        :icon="IconGenerate"
        label="Generate"
        @click="ui.locationGeneratorOpen = true"
      />
      <ListActionButton
        variant="primary"
        :icon="IconAdd"
        label="New Location"
        mobile-label="Location"
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

    <AtlasExplorer />
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="locations" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useToast } from "@/composables/useToast";
import { pluralizeCount } from "@/lib/utils";
import { IconAdd, IconFaction, IconGenerate, IconLoading, IconPopulate } from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import AtlasExplorer from "@/components/locations/AtlasExplorer.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useCreateGate } from "@/composables/billing/useCreateGate";
import { usePopulateLocations, usePopulatePlanarLocations } from "@/composables/locations/useLocations";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";

const ui = useUiStore();
const campaignStore = useCampaignStore();
const isAiEnabled = computed(() => campaignStore.isAiEnabled);
const { showPaywall, handleNew, gateQuotaError } = useCreateGate("locations", "/locations/new");

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  ...Object.entries(LOCATION_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

// The outcome of a populate is a toast, not the button's label: below `sm` a
// list action collapses to its icon, so a result written into the label
// ("Already up to date", "Added 12 locations", an error) was invisible on a
// phone and the button looked like it did nothing (27 Sep 2026).
const toast = useToast();

const populateMutation = usePopulateLocations();

async function handlePopulate() {
  try {
    const count = await populateMutation.mutateAsync();
    if (count === 0) toast.info("Every place from your setting is already in the Atlas.");
    else toast.success(`Added ${pluralizeCount(count, "place", "places")} from your setting.`);
  } catch (e) {
    if (gateQuotaError(e)) return; // free-tier cap hit → show paywall, not a raw error
    toast.error(toast.fromError(e, "The setting's places could not be added."));
  }
}

const planarMutation = usePopulatePlanarLocations();

async function handlePopulatePlanes() {
  try {
    const count = await planarMutation.mutateAsync();
    if (count === 0) toast.info("Every plane of existence is already in the Atlas.");
    else toast.success(`Added ${pluralizeCount(count, "plane", "planes")}.`);
  } catch (e) {
    if (gateQuotaError(e)) return; // free-tier cap hit → show paywall, not a raw error
    toast.error(toast.fromError(e, "The planes could not be added."));
  }
}
</script>
