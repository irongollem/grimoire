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
        <!-- Filter bar -->
        <div class="flex flex-wrap items-center gap-2">
          <input
            v-model="ruleSearch"
            type="search"
            placeholder="Filter rules…"
            class="flex-1 min-w-40 bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <select
            v-model="ruleCategory"
            class="bg-card border border-border rounded-md px-3 py-1.5 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All categories</option>
            <option v-for="cat in availableCategories" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </div>

        <!-- Empty filter result -->
        <p v-if="!filteredRules.length" class="font-fell text-sm text-muted-foreground italic text-center py-6">
          No rules match your filter.
        </p>

        <!-- Accordion list -->
        <div v-else class="flex flex-col gap-1">
          <div
            v-for="rule in filteredRules"
            :key="rule.id"
            class="rounded-lg border border-border bg-card overflow-hidden"
          >
            <!-- Header (always visible, click to expand) -->
            <button
              type="button"
              class="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              @click="toggleRule(rule.id)"
            >
              <ChevronRight
                class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200"
                :class="openRules.has(rule.id) ? 'rotate-90' : ''"
              />
              <span class="font-cinzel text-sm font-bold text-foreground flex-1">{{ rule.title }}</span>
              <span
                v-if="rule.category"
                class="shrink-0 px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider"
              >
                {{ rule.category }}
              </span>
              <div v-if="rule.tags.length" class="hidden sm:flex flex-wrap gap-1 shrink-0">
                <span
                  v-for="tag in rule.tags"
                  :key="tag"
                  class="px-1.5 py-0.5 rounded bg-primary/10 font-cinzel text-[10px] text-primary tracking-wider"
                >
                  {{ tag }}
                </span>
              </div>
            </button>

            <!-- Expanded content -->
            <div v-if="openRules.has(rule.id)" class="px-4 pb-4 border-t border-border">
              <!-- Tags on mobile (not shown in header) -->
              <div v-if="rule.tags.length" class="flex sm:hidden flex-wrap gap-1 pt-3 pb-1">
                <span
                  v-for="tag in rule.tags"
                  :key="tag"
                  class="px-1.5 py-0.5 rounded bg-primary/10 font-cinzel text-[10px] text-primary tracking-wider"
                >
                  {{ tag }}
                </span>
              </div>
              <RichTextViewer v-if="rule.content" :content="rule.content" class="mt-3" />
              <p v-else class="font-fell text-sm text-muted-foreground italic mt-3">No content.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, shallowRef } from "vue";
import { Monitor, BookOpen, Scroll, ChevronRight } from "lucide-vue-next";
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

// Filter state
const ruleSearch   = ref("");
const ruleCategory = ref("");

const availableCategories = computed(() => {
  const cats = new Set<string>();
  rules.value?.forEach((r) => { if (r.category) cats.add(r.category); });
  return [...cats].sort();
});

const filteredRules = computed(() => {
  const q = ruleSearch.value.trim().toLowerCase();
  const cat = ruleCategory.value;
  return (rules.value ?? []).filter((r) => {
    if (cat && r.category !== cat) return false;
    if (q && !r.title.toLowerCase().includes(q) && !r.tags.some((t) => t.toLowerCase().includes(q))) return false;
    return true;
  });
});

// Accordion state
const openRules = shallowRef(new Set<string>());
function toggleRule(id: string) {
  const next = new Set(openRules.value);
  next.has(id) ? next.delete(id) : next.add(id);
  openRules.value = next;
}
</script>
