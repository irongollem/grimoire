<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h1 class="font-cinzel text-xl font-bold text-foreground">Reliquary</h1>
    </div>

    <!-- Tab bar -->
    <div class="flex gap-1 border-b border-border overflow-x-auto">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="flex items-center gap-1.5 px-3 py-2 text-label-lg font-semibold transition-colors border-b-2 -mb-px shrink-0"
        :class="activeTab === tab.id
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="setTab(tab.id)"
      >
        <component :is="tab.icon" class="h-3.5 w-3.5" />
        {{ tab.label }}
      </button>
    </div>

    <ScreenTab v-if="activeTab === 'screen'" />
    <CompendiumTab v-else-if="activeTab === 'compendium'" />
    <CodexTab v-else-if="activeTab === 'codex'" />
    <HouseRulesTab v-else-if="activeTab === 'houserules'" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconBookMarked, IconMonitor, IconPopulate, IconQuest } from '@/lib/icons';
import ScreenTab from "@/components/rules/ScreenTab.vue";
import CompendiumTab from "@/components/rules/CompendiumTab.vue";
import CodexTab from "@/components/rules/CodexTab.vue";
import HouseRulesTab from "@/components/rules/HouseRulesTab.vue";

const tabs = [
  { id: "screen",     label: "Reference",   icon: IconMonitor },
  { id: "compendium", label: "Compendium",  icon: IconPopulate },
  { id: "codex",      label: "Codex",       icon: IconBookMarked },
  { id: "houserules", label: "House Rules", icon: IconQuest },
] as const;

type TabId = (typeof tabs)[number]["id"];

const route = useRoute();
const router = useRouter();

const VALID_TABS = new Set<string>(tabs.map((t) => t.id));

const activeTab = computed<TabId>(() => {
  const q = route.query.tab;
  return VALID_TABS.has(q as string) ? (q as TabId) : "screen";
});

function setTab(id: TabId) {
  router.replace({ query: { ...route.query, tab: id } });
}
</script>
