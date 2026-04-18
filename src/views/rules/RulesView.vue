<template>
  <!-- Page wrapper — fills the main area, establishes flex-col boundaries -->
  <div class="flex flex-col h-full min-h-0 overflow-hidden">
    <!-- Title block -->
    <div class="px-4 pt-4 pb-3 md:px-6 md:pt-6 shrink-0">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h1
            class="font-cinzel text-xl md:text-3xl font-bold text-foreground tracking-wide"
          >
            Rules Reliquary
          </h1>
          <p
            class="font-fell text-sm md:text-base text-muted-foreground italic mt-0.5"
          >
            DM screen, SRD compendium &amp; custom rule systems
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <RouterLink
            v-if="activeTab === 'custom'"
            to="/rules/new"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-cinzel text-xs font-semibold tracking-wide hover:bg-primary/90 transition-colors"
          >
            <Plus class="h-3.5 w-3.5" />
            New Rule
          </RouterLink>
          <DiceRoller class="hidden md:block" />
        </div>
      </div>
      <div class="gold-divider mt-3" />
    </div>

    <!-- Tabs bar -->
    <div
      class="px-4 md:px-6 shrink-0 flex gap-1 border-b border-border overflow-x-auto"
    >
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="flex items-center gap-1.5 px-4 py-2.5 font-cinzel text-xs font-semibold tracking-wider border-b-2 -mb-px transition-colors shrink-0"
        :class="
          activeTab === tab.id
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        "
        @click="activeTab = tab.id"
      >
        <component :is="tab.icon" class="h-3.5 w-3.5" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Tab body — fills the rest, no outer scroll. Padding lives inside each tab so scrollbars sit at the viewport edge. -->
    <div class="flex-1 min-h-0 overflow-hidden">
      <ScreenTab v-if="activeTab === 'screen'" />
      <CompendiumTab v-else-if="activeTab === 'compendium'" />
      <CustomRulesTab v-else-if="activeTab === 'custom'" />
      <ManualTab v-else-if="activeTab === 'manual'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Plus, Monitor, BookOpen, Scroll, BookMarked } from "lucide-vue-next";
import { RouterLink } from "vue-router";
import DiceRoller from "@/components/common/DiceRoller.vue";
import ScreenTab from "@/components/rules/ScreenTab.vue";
import CompendiumTab from "@/components/rules/CompendiumTab.vue";
import CustomRulesTab from "@/components/rules/CustomRulesTab.vue";
import ManualTab from "@/components/rules/ManualTab.vue";

const TABS = [
  { id: "screen", label: "DM Screen", icon: Monitor },
  { id: "compendium", label: "Compendium", icon: BookOpen },
  { id: "custom", label: "Custom Rules", icon: Scroll },
  { id: "manual", label: "DM Manual", icon: BookMarked },
] as const;

type TabId = (typeof TABS)[number]["id"];
const activeTab = ref<TabId>("screen");
</script>
