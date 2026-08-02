<template>
  <ListPageLayout title="Encounters" description="Build and run combat encounters">
    <template #title-suffix>
      <ManualHelpLink page="encounter-builder" />
    </template>

    <template #actions>
      <ListActionButton
        :icon="IconGenerate"
        label="Generate"
        @click="ui.encounterGeneratorOpen = true"
      />
      <ListActionButton
        :icon="IconAdd"
        label="New Encounter"
        mobile-label="Encounter"
        variant="primary"
        @click="handleNew"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="ui.encountersHasActiveFilters"
        @clear="ui.resetEncountersFilters()"
      >
        <ListSearchInput v-model="ui.encountersSearch" placeholder="Search encounters…" />
        <ListFilterSelect
          v-model="ui.encountersFilterQuestId"
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
        <ListActionButton
          :icon="IconCheckDouble"
          :label="ui.encountersHideFinished ? 'Active' : 'All'"
          :collapse-on-mobile="false"
          :tooltip="ui.encountersHideFinished ? 'Show all encounters' : 'Hide finished encounters'"
          :variant="ui.encountersHideFinished ? 'primary' : 'ghost'"
          @click="ui.encountersHideFinished = !ui.encountersHideFinished"
        />
      </ListFilterBar>
    </template>

    <EncounterList />
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="encounters" />
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { IconAdd, IconCheckDouble, IconGenerate } from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import EncounterList from "@/components/encounters/EncounterList.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useUiStore } from "@/stores/ui";
import { useAllQuests } from "@/composables/useQuests";
import { useQuota } from "@/composables/useQuota";

const router = useRouter();
const ui = useUiStore();
const { data: quests } = useAllQuests();
const { canCreate } = useQuota("encounters");
const showPaywall = ref(false);

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/encounters/new");
}
</script>
