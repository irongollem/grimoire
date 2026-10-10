<template>
  <ListPageLayout title="Encounters" description="Build and run combat encounters">
    <template #title-suffix>
      <ManualHelpLink page="encounter-builder" />
    </template>

    <template #actions>
      <ListActionButton
        v-if="isAiEnabled"
        :icon="IconGenerate"
        label="Generate"
        @click="generatorsUi.encounterGeneratorOpen = true"
      />
      <ListActionButton
        variant="primary"
        :icon="IconAdd"
        label="New Encounter"
        mobile-label="Encounter"
        @click="handleNew"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="encountersUi.encountersHasActiveFilters"
        @clear="encountersUi.resetEncountersFilters()"
      >
        <ListSearchInput v-model="encountersUi.encountersSearch" placeholder="Search encounters…" />
        <ListFilterSelect
          v-model="encountersUi.encountersFilterQuestId"
          aria-label="Quest filter"
        >
          <option value="all">All quests</option>
          <option value="unassigned">Unassigned</option>
          <option v-for="q in quests" :key="q.id" :value="q.id">{{ q.title }}</option>
        </ListFilterSelect>
        <!--
          Active/All toggle — the IconCheckDouble icon alone is ambiguous between
          the two states, so the visible label carries the "Active" / "All"
          information. Tooltip describes the action the next tap would take.
          Primary variant when filtering-to-active so it reads as "on".
        -->
        <AppButton
          size="md"
          :icon="IconCheckDouble"
          :label="encountersUi.encountersHideFinished ? 'Active' : 'All'"
          :tooltip="encountersUi.encountersHideFinished ? 'Show all encounters' : 'Hide finished encounters'"
          :variant="encountersUi.encountersHideFinished ? 'primary' : 'subtle'"
          @click="encountersUi.encountersHideFinished = !encountersUi.encountersHideFinished"
        />
      </ListFilterBar>
    </template>

    <EncounterList />
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="encounters" />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { IconAdd, IconCheckDouble, IconGenerate } from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import AppButton from "@/components/common/AppButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import EncounterList from "@/components/encounters/EncounterList.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useEncountersUiStore } from "@/stores/ui/encounters";
import { useGeneratorUiStore } from "@/stores/ui/generators";
import { useCampaignStore } from "@/stores/campaign";
import { useQuests } from "@/composables/quests/useQuests";
import { useQuota } from "@/composables/billing/useQuota";

const router = useRouter();
const encountersUi = useEncountersUiStore();
const generatorsUi = useGeneratorUiStore();
const campaignStore = useCampaignStore();
const isAiEnabled = computed(() => campaignStore.isAiEnabled);
const { data: quests } = useQuests();
const { canCreate } = useQuota("encounters");
const showPaywall = ref(false);

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/encounters/new");
}
</script>
