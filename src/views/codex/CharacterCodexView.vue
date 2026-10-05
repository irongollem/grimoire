<template>
  <!--
    Consolidated compendium for player character options — Species,
    Backgrounds, Classes, and Archetypes. Same tabbed shell as the Rules
    Reliquary, with each tab a self-contained list + import flow.

    Tab state is kept in `useUiStore.codexActiveTab` so navigating away and
    back preserves which compendium you were on. The URL path segment
    (/codex/species, /codex/backgrounds, …) is the source of truth — we
    sync the tab ref to it on mount + watch, and each tab click pushes a
    new route so deep links like `/codex/backgrounds` work directly.
  -->
  <ListPageLayout title="Character Codex" description="Species, backgrounds, classes, archetypes, abilities & feats for your players">
    <template #title-suffix>
      <ManualHelpLink :page="manualPage" />
    </template>

    <template #actions>
      <template v-if="isDM">
        <!-- Species tab -->
        <ListActionButton
          v-if="activeTab === 'species'"
          :icon="IconDownload"
          label="Import Open5e"
          @click="ui.speciesOpen5ePanelOpen = true"
        />
        <ListActionButton
          v-if="activeTab === 'species'"
          :active="speciesListRef?.bulkSelecting ?? false"
          :icon="IconCheck"
          label="Select"
          @click="speciesListRef?.toggleBulkSelectMode()"
        />
        <ListActionButton
          v-if="activeTab === 'species' && isAiEnabled"
          :icon="IconGenerate"
          label="Generate"
          @click="ui.speciesGeneratorOpen = true"
        />
        <ListActionButton
          v-if="activeTab === 'species'"
          variant="primary"
          :icon="IconAdd"
          label="New Species"
          mobile-label="Species"
          to="/species/new"
        />

        <!-- Backgrounds tab -->
        <template v-if="activeTab === 'backgrounds'">
          <ListActionButton
            v-if="isAiEnabled"
            :icon="IconGenerate"
            label="Generate"
            @click="ui.backgroundGeneratorOpen = true"
          />
          <ListActionButton
            variant="primary"
            :icon="IconAdd"
            label="New Background"
            mobile-label="Background"
            to="/backgrounds/new"
          />
        </template>

        <!-- Classes tab -->
        <template v-if="activeTab === 'classes'">
          <ListActionButton
            v-if="isAiEnabled"
            :icon="IconGenerate"
            label="Generate"
            @click="ui.customClassGeneratorOpen = true"
          />
          <ListActionButton
            variant="primary"
            :icon="IconAdd"
            label="New Class"
            mobile-label="Class"
            to="/levelup/classes/new"
          />
        </template>

        <!-- Archetypes tab -->
        <template v-if="activeTab === 'archetypes'">
          <ListActionButton
            v-if="isAiEnabled"
            :icon="IconGenerate"
            label="Generate"
            @click="ui.customSubclassGeneratorOpen = true"
          />
          <ListActionButton
            variant="primary"
            :icon="IconAdd"
            label="New Archetype"
            mobile-label="Archetype"
            to="/levelup/custom/new"
          />
        </template>

        <!-- Abilities tab -->
        <template v-if="activeTab === 'abilities'">
          <ListActionButton
            v-if="isAiEnabled"
            :icon="IconGenerate"
            label="Generate"
            @click="ui.classFeatureGeneratorOpen = true"
          />
          <ListActionButton
            variant="primary"
            :icon="IconAdd"
            label="New Ability"
            mobile-label="Ability"
            to="/features/new"
          />
        </template>

        <!-- Feats tab -->
        <template v-if="activeTab === 'feats'">
          <ListActionButton
            variant="primary"
            :icon="IconAdd"
            label="New Feat"
            mobile-label="Feat"
            to="/feats/new"
          />
        </template>
      </template>
    </template>

    <!-- One #filters slot; the active tab picks which filter bar renders.
         (Multiple same-named slot templates trigger Vue's "duplicate slot" warning.) -->
    <template #filters>
      <ListFilterBar
        v-if="activeTab === 'species'"
        :has-active-filters="ui.speciesHasActiveFilters"
        @clear="ui.resetSpeciesFilters()"
      >
        <ListSearchInput v-model="ui.speciesSearch" placeholder="Search species…" />
        <ListFilterGroup
          v-model="ui.speciesFilterSize"
          :options="SIZE_OPTIONS"
          aria-label="Species size filter"
        />
      </ListFilterBar>
      <ListFilterBar
        v-else-if="activeTab === 'backgrounds'"
        :has-active-filters="ui.backgroundsHasActiveFilters"
        @clear="ui.resetBackgroundsFilters()"
      >
        <ListSearchInput v-model="ui.backgroundsSearch" placeholder="Search backgrounds…" />
        <ListFilterGroup
          v-model="ui.backgroundsFilterSource"
          :options="BACKGROUND_SOURCE_OPTIONS"
          aria-label="Background source filter"
        />
      </ListFilterBar>
      <ListFilterBar
        v-else-if="activeTab === 'classes'"
        :has-active-filters="ui.customClassesHasActiveFilters"
        @clear="ui.resetCustomClassesFilters()"
      >
        <ListSearchInput v-model="ui.customClassesSearch" placeholder="Search classes…" />
      </ListFilterBar>
      <ListFilterBar
        v-else-if="activeTab === 'archetypes'"
        :has-active-filters="ui.archetypesHasActiveFilters"
        @clear="ui.resetArchetypesFilters()"
      >
        <ListSearchInput v-model="ui.archetypesSearch" placeholder="Search archetypes…" />
        <ListFilterSelect v-model="ui.archetypesFilterClass">
          <option value="all">All classes</option>
          <option v-for="cls in archetypeClassNames" :key="cls" :value="cls">{{ cls }}</option>
        </ListFilterSelect>
      </ListFilterBar>
      <ListFilterBar
        v-else-if="activeTab === 'abilities'"
        :has-active-filters="ui.featuresHasActiveFilters"
        @clear="ui.resetFeaturesFilters()"
      >
        <ListSearchInput v-model="ui.featuresSearch" placeholder="Search abilities…" />
        <ListFilterSelect v-model="ui.featuresFilterActivation">
          <option value="all">All activations</option>
          <option value="passive">Passive</option>
          <option v-for="a in ACTIVATIONS" :key="a" :value="a">{{ ACTIVATION_LABELS[a] }}</option>
        </ListFilterSelect>
      </ListFilterBar>
      <ListFilterBar
        v-else-if="activeTab === 'feats'"
        :has-active-filters="ui.featsHasActiveFilters"
        @clear="ui.resetFeatsFilters()"
      >
        <ListSearchInput v-model="ui.featsSearch" placeholder="Search feats…" />
        <ListFilterSelect v-model="ui.featsFilterCategory">
          <option value="all">All categories</option>
          <option v-for="c in FEAT_CATEGORIES" :key="c" :value="c">{{ FEAT_CATEGORY_LABELS[c] }}</option>
        </ListFilterSelect>
        <ListFilterSelect v-model="ui.featsFilterEdition">
          <option value="all">Both editions</option>
          <option value="2014">2014</option>
          <option value="2024">2024</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <!-- Tab bar -->
    <TabBar :tabs="TABS" v-model="activeTab" wrapper-class="mb-6 overflow-x-auto" />

    <SpeciesList v-if="activeTab === 'species'" :readonly="!isDM" ref="speciesListRef" />
    <BackgroundList v-else-if="activeTab === 'backgrounds'" :readonly="!isDM" />
    <ClassList v-else-if="activeTab === 'classes'" />
    <ArchetypeList v-else-if="activeTab === 'archetypes'" ref="archetypeListRef" />
    <AbilityList v-else-if="activeTab === 'abilities'" />
    <FeatList v-else-if="activeTab === 'feats'" />

    <!-- Species import panel -->
    <SpeciesOpen5ePanel v-if="activeTab === 'species'" />
  </ListPageLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { IconAdd, IconBookUser, IconGenerate, IconAward, IconCheck, IconDownload, IconLevel, IconLightning, IconPopulate, IconSpecies } from '@/lib/icons';
import TabBar from "@/components/common/TabBar.vue";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import SpeciesList from "@/components/species/SpeciesList.vue";
import SpeciesOpen5ePanel from "@/components/species/SpeciesOpen5ePanel.vue";
import BackgroundList from "@/components/backgrounds/BackgroundList.vue";
import { BACKGROUND_SOURCE_OPTIONS } from "@/components/backgrounds/backgroundSourceOptions";
import ClassList from "@/components/levelup/ClassList.vue";
import ArchetypeList from "@/components/levelup/ArchetypeList.vue";
import AbilityList from "@/components/features/AbilityList.vue";
import FeatList from "@/components/feats/FeatList.vue";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useAllSystemClasses, useAllCustomClasses } from "@/composables/rules/useCustomClasses";
import { ACTIVATIONS, FEAT_CATEGORIES } from "@/rules/features/mechanics.types";
import { ACTIVATION_LABELS, FEAT_CATEGORY_LABELS } from "@/types/feature.types";

type TabId = "species" | "backgrounds" | "classes" | "archetypes" | "abilities" | "feats";

const TABS: Array<{ id: TabId; label: string; icon: typeof IconSpecies }> = [
  { id: "species",     label: "Species",     icon: IconSpecies },
  { id: "backgrounds", label: "Backgrounds", icon: IconBookUser },
  { id: "classes",     label: "Classes",     icon: IconPopulate },
  { id: "archetypes",  label: "Archetypes",  icon: IconLevel },
  { id: "abilities",   label: "Abilities",   icon: IconLightning },
  { id: "feats",       label: "Feats",       icon: IconAward },
];

const SIZE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "tiny", label: "Tiny" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
] as const;

const ui = useUiStore();
const isAiEnabled = computed(() => useCampaignStore().isAiEnabled);
const auth = useAuthStore();
const isDM = auth.isDM;
const route = useRoute();
const router = useRouter();

const activeTab = computed<TabId>({
  get: () => ui.codexActiveTab as TabId,
  set: (id) => selectTab(id),
});

const MANUAL_PAGE_BY_TAB: Record<TabId, string> = {
  species: "species-and-backgrounds",
  backgrounds: "species-and-backgrounds",
  classes: "creating-custom-classes",
  archetypes: "creating-custom-classes",
  abilities: "abilities-compendium",
  feats: "feats-compendium",
};
const manualPage = computed(() => MANUAL_PAGE_BY_TAB[activeTab.value]);

function tabFromRoute(): TabId {
  const p = (route.params.tab as string | undefined) ?? ui.codexActiveTab;
  return (["species", "backgrounds", "classes", "archetypes", "abilities", "feats"] as TabId[]).includes(p as TabId)
    ? (p as TabId)
    : "species";
}

onMounted(() => { ui.codexActiveTab = tabFromRoute(); });
watch(() => route.params.tab, () => { ui.codexActiveTab = tabFromRoute(); });

function selectTab(id: TabId) {
  if (id === activeTab.value) return;
  router.push(`/codex/${id}`);
}

// ── Archetypes: class name list for filter select ─────────────────────────────
const { data: systemClasses } = useAllSystemClasses();
const { data: customClasses } = useAllCustomClasses();
const archetypeClassNames = computed(() => {
  const srd = (systemClasses.value ?? []).map(c => c.class_name);
  const custom = (customClasses.value ?? []).map(c => c.class_name);
  return [...new Set([...srd, ...custom])].sort();
});
const archetypeListRef = ref<InstanceType<typeof ArchetypeList> | null>(null);
const speciesListRef = ref<InstanceType<typeof SpeciesList> | null>(null);
</script>
