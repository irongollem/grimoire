<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h1 class="text-heading-lg font-bold text-foreground">Reliquary</h1>
    </div>

    <!-- Tab bar -->
    <TabBar :tabs="tabs" v-model="activeTab" wrapper-class="overflow-x-auto" />

    <ScreenTab v-if="activeTab === 'screen'" />
    <CompendiumTab v-else-if="activeTab === 'compendium'" />
    <CodexTab v-else-if="activeTab === 'codex'" />
    <HouseRulesTab v-else-if="activeTab === 'houserules'" />
    <LicensesTab v-else-if="activeTab === 'licenses'" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconBookMarked, IconLandmark, IconMonitor, IconPopulate, IconQuest } from '@/lib/icons';
import TabBar from "@/components/common/TabBar.vue";
import ScreenTab from "@/components/rules/ScreenTab.vue";
import CompendiumTab from "@/components/rules/CompendiumTab.vue";
import CodexTab from "@/components/rules/CodexTab.vue";
import HouseRulesTab from "@/components/rules/HouseRulesTab.vue";
import LicensesTab from "@/components/rules/LicensesTab.vue";

const tabs = [
  { id: "screen",     label: "Reference",   icon: IconMonitor },
  { id: "compendium", label: "Compendium",  icon: IconPopulate },
  { id: "codex",      label: "Codex",       icon: IconBookMarked },
  { id: "houserules", label: "House Rules", icon: IconQuest },
  { id: "licenses",   label: "Licenses",    icon: IconLandmark },
] as const;

type TabId = (typeof tabs)[number]["id"];

const route = useRoute();
const router = useRouter();

const VALID_TABS = new Set<string>(tabs.map((t) => t.id));

const activeTab = computed<TabId>({
  get: () => {
    const q = route.query.tab;
    return VALID_TABS.has(q as string) ? (q as TabId) : "screen";
  },
  set: (id) => {
    router.replace({ query: { ...route.query, tab: id } });
  },
});
</script>
