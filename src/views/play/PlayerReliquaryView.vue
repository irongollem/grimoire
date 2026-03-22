<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h1 class="font-cinzel text-xl font-bold text-foreground">Reliquary</h1>
    </div>

    <!-- Tab bar -->
    <div class="flex gap-1 border-b border-border">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="flex items-center gap-1.5 px-3 py-2 font-cinzel text-xs font-semibold tracking-wider transition-colors border-b-2 -mb-px"
        :class="activeTab === tab.id
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="activeTab = tab.id"
      >
        <component :is="tab.icon" class="h-3.5 w-3.5" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Reference (player DM screen) -->
    <ScreenTab v-if="activeTab === 'screen'" />

    <!-- Compendium (full SRD) -->
    <CompendiumTab v-else-if="activeTab === 'compendium'" />

    <!-- House Rules (player-visible custom rules) -->
    <div v-else-if="activeTab === 'houserules'">
      <div v-if="isLoading" class="flex justify-center py-16">
        <LoadingSpinner />
      </div>

      <EmptyState
        v-else-if="!rules?.length"
        title="No house rules shared yet"
        description="Your DM hasn't shared any custom rules with players."
      />

      <div v-else class="flex flex-col gap-3">
        <div
          v-for="rule in rules"
          :key="rule.id"
          class="rounded-lg border border-border bg-card p-4 flex flex-col gap-2"
        >
          <div class="flex items-start gap-2">
            <h3 class="font-cinzel text-sm font-bold text-foreground flex-1">{{ rule.title }}</h3>
            <span
              v-if="rule.category"
              class="shrink-0 px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider"
            >
              {{ rule.category }}
            </span>
          </div>
          <div v-if="rule.tags.length" class="flex flex-wrap gap-1">
            <span
              v-for="tag in rule.tags"
              :key="tag"
              class="px-1.5 py-0.5 rounded bg-primary/10 font-cinzel text-[10px] text-primary tracking-wider"
            >
              {{ tag }}
            </span>
          </div>
          <RichTextViewer v-if="rule.content" :content="rule.content" class="mt-1" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Monitor, BookOpen, Scroll } from "lucide-vue-next";
import ScreenTab from "@/components/rules/ScreenTab.vue";
import CompendiumTab from "@/components/rules/CompendiumTab.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { usePlayerVisibleRules } from "@/composables/useRules";

const tabs = [
  { id: "screen",      label: "Reference",   icon: Monitor },
  { id: "compendium",  label: "Compendium",  icon: BookOpen },
  { id: "houserules",  label: "House Rules", icon: Scroll },
] as const;

type TabId = (typeof tabs)[number]["id"];
const activeTab = ref<TabId>("screen");

const { data: rules, isLoading } = usePlayerVisibleRules();
</script>
