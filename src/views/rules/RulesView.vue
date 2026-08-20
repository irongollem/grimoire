<template>
  <!-- Page wrapper — fills the main area, establishes flex-col boundaries -->
  <div class="flex flex-col h-full min-h-0 overflow-hidden">
    <!-- Title block -->
    <div class="px-4 pt-4 pb-3 md:px-6 md:pt-6 shrink-0">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h1
            class="font-cinzel text-xl md:text-3xl font-bold text-foreground tracking-wide inline-flex items-center gap-2"
          >
            Rules Reliquary
            <ManualHelpLink v-if="manualPage" :page="manualPage" />
          </h1>
          <p
            class="text-body md:text-base text-muted-foreground italic mt-0.5"
          >
            DM screen, compendium &amp; custom rule systems
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <RouterLink
            v-if="activeTab === 'custom'"
            to="/rules/new"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-cinzel text-xs font-semibold tracking-wide hover:bg-primary/90 transition-colors"
          >
            <IconAdd class="h-3.5 w-3.5" />
            New Rule
          </RouterLink>
        </div>
      </div>
      <div class="gold-divider mt-3" />
    </div>

    <!-- Tabs bar -->
    <TabBar :tabs="TABS" v-model="activeTab" wrapper-class="px-4 md:px-6 shrink-0 overflow-x-auto" />

    <!-- Tab body — fills the rest, no outer scroll. Padding lives inside each tab so scrollbars sit at the viewport edge. -->
    <div class="flex-1 min-h-0 overflow-hidden">
      <ScreenTab v-if="activeTab === 'screen'" />
      <CompendiumTab v-else-if="activeTab === 'compendium'" />
      <CustomRulesTab v-else-if="activeTab === 'custom'" />
      <ManualTab v-else-if="activeTab === 'manual'" />
      <LicensesTab v-else-if="activeTab === 'licenses'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconAdd, IconBookMarked, IconLandmark, IconMonitor, IconPopulate, IconQuest } from '@/lib/icons';
import { RouterLink } from "vue-router";
import TabBar from "@/components/common/TabBar.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ScreenTab from "@/components/rules/ScreenTab.vue";
import CompendiumTab from "@/components/rules/CompendiumTab.vue";
import CustomRulesTab from "@/components/rules/CustomRulesTab.vue";
import ManualTab from "@/components/rules/ManualTab.vue";
import LicensesTab from "@/components/rules/LicensesTab.vue";

const TABS = [
  { id: "screen", label: "DM Screen", icon: IconMonitor },
  { id: "compendium", label: "Compendium", icon: IconPopulate },
  { id: "custom", label: "Custom Rules", icon: IconQuest },
  { id: "manual", label: "DM Manual", icon: IconBookMarked },
  { id: "licenses", label: "Licenses", icon: IconLandmark },
] as const;

type TabId = (typeof TABS)[number]["id"];

const route = useRoute();
const router = useRouter();

const VALID_TABS = new Set<string>(TABS.map((t) => t.id));

const activeTab = computed<TabId>({
  get: () => {
    const q = route.query.tab;
    return VALID_TABS.has(q as string) ? (q as TabId) : "screen";
  },
  set: (id) => {
    router.replace({ query: { ...route.query, tab: id, page: undefined } });
  },
});

const MANUAL_PAGE_BY_TAB: Partial<Record<TabId, string>> = {
  screen: "dm-screen",
  // Manual page ids are slugify(frontmatter title), and this page is genuinely
  // titled "SRD Compendium": library_rules holds only srd-2014/srd-2024 rows.
  compendium: "srd-compendium",
  custom: "custom-rules-house-rules",
};
const manualPage = computed(() => MANUAL_PAGE_BY_TAB[activeTab.value]);
</script>
