<template>
  <ListPageLayout title="Rules Reliquary" description="DM screen, SRD compendium & custom rule systems">
    <template #actions>
      <ListActionButton
        v-if="activeTab === 'custom'"
        :icon="Plus"
        label="New Rule"
        variant="primary"
        to="/rules/new"
      />
    </template>

    <!--
      Tab bar lives in the body because it's not a single-choice filter —
      each tab renders entirely different content. Scrolls with the body.
    -->
    <div class="flex gap-1 mb-6 border-b border-border overflow-x-auto">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="flex items-center gap-1.5 px-4 py-2.5 font-cinzel text-xs font-semibold tracking-wider border-b-2 -mb-px transition-colors shrink-0"
        :class="activeTab === tab.id
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="activeTab = tab.id"
      >
        <component :is="tab.icon" class="h-3.5 w-3.5" />
        {{ tab.label }}
      </button>
    </div>

    <ScreenTab v-if="activeTab === 'screen'" />
    <CompendiumTab v-else-if="activeTab === 'compendium'" />
    <CustomRulesTab v-else-if="activeTab === 'custom'" />
  </ListPageLayout>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Plus, Monitor, BookOpen, Scroll } from "lucide-vue-next";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ScreenTab from "@/components/rules/ScreenTab.vue";
import CompendiumTab from "@/components/rules/CompendiumTab.vue";
import CustomRulesTab from "@/components/rules/CustomRulesTab.vue";

const TABS = [
  { id: "screen",     label: "DM Screen",   icon: Monitor  },
  { id: "compendium", label: "Compendium",  icon: BookOpen },
  { id: "custom",     label: "Custom Rules", icon: Scroll   },
] as const;

type TabId = (typeof TABS)[number]["id"];
const activeTab = ref<TabId>("screen");
</script>
