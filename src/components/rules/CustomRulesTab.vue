<template>
  <div class="overflow-y-auto h-full px-4 pt-4 pb-4 md:px-6 md:pt-6">
    <!-- Filters + new button -->
    <div class="flex flex-wrap items-center gap-2 mb-5">
      <div class="relative flex-1 min-w-48">
        <IconSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          v-model="search"
          type="text"
          placeholder="Search custom rules…"
          class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <select
        v-model="categoryFilter"
        class="bg-card border border-border rounded-md px-2.5 py-1.5 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All categories</option>
        <option v-for="cat in RULE_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
      </select>

      <button
        v-if="ui.customRulesHasActiveFilters"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors shrink-0"
        @click="ui.resetCustomRulesFilters()"
      >
        Clear
      </button>
    </div>

    <!-- ── Active built-in optional rules ──────────────────────────────── -->
    <div v-if="enabledBuiltIns.length" class="mb-6 space-y-2">
      <p class="font-cinzel text-2xs font-semibold tracking-widest text-muted-foreground uppercase">Active Optional Rules</p>
      <div class="flex flex-col gap-1">
        <div
          v-for="def in enabledBuiltIns"
          :key="def.key"
          class="rounded-lg border border-border bg-card overflow-hidden"
        >
          <button
            type="button"
            class="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
            @click="toggleBuiltIn(def.key)"
          >
            <IconChevronRight
              class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200"
              :class="openBuiltIns.has(def.key) ? 'rotate-90' : ''"
            />
            <span class="font-cinzel text-sm font-bold text-foreground flex-1">{{ def.name }}</span>
            <span class="shrink-0 px-1.5 py-0.5 rounded bg-emerald-500/10 font-cinzel text-2xs text-emerald-400 tracking-wider">active</span>
          </button>
          <div v-if="openBuiltIns.has(def.key)" class="px-4 pb-4 border-t border-border">
            <p class="font-fell text-xs text-muted-foreground italic mt-3 mb-2">{{ def.summary }}</p>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="prose-grimoire" v-html="renderMarkdown(def.description)" />
          </div>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length && !search && !categoryFilter"
      title="No custom rules yet"
      description="Document your crafting systems, fishing rules, weather tables, and homebrew mechanics."
    >
      <template #action>
        <RouterLink
          to="/rules/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          Write your first rule
        </RouterLink>
      </template>
    </EmptyState>

    <p
      v-else-if="!filtered.length"
      class="text-center font-fell text-sm text-muted-foreground italic py-12"
    >
      No rules match your filters.
    </p>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <RouterLink
        v-for="rule in filtered"
        :key="rule.id"
        :to="`/rules/${rule.id}`"
        class="group flex flex-col gap-2 rounded-lg border border-border bg-card p-4 hover:border-primary/50 transition-colors"
      >
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight line-clamp-2 flex-1">
            {{ rule.title }}
          </h3>
          <div class="flex items-center gap-1 shrink-0">
            <IconReveal v-if="rule.is_player_visible" class="h-3 w-3 text-primary/60" title="Visible to players" />
            <span
              v-if="rule.category"
              class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-2xs text-muted-foreground tracking-wider"
            >
              {{ rule.category }}
            </span>
          </div>
        </div>
        <div v-if="rule.tags.length" class="flex flex-wrap gap-1">
          <span
            v-for="tag in rule.tags.slice(0, 4)"
            :key="tag"
            class="px-1.5 py-0.5 rounded bg-primary/10 font-cinzel text-2xs text-primary tracking-wider"
          >
            {{ tag }}
          </span>
          <span v-if="rule.tags.length > 4" class="font-fell text-2xs text-muted-foreground italic self-center">
            +{{ rule.tags.length - 4 }}
          </span>
        </div>
        <p class="font-fell text-xs text-muted-foreground mt-auto">
          {{ formatDate(rule.updated_at) }}
        </p>
      </RouterLink>
    </div>

    <p v-if="filtered.length" class="mt-4 font-fell text-xs text-muted-foreground italic text-right">
      {{ filtered.length }} of {{ rules?.length ?? 0 }} rules
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, shallowRef } from "vue";
import { renderBasicMarkdown } from "@/lib/sanitizeHtml";
import { IconChevronRight, IconReveal, IconSearch } from '@/lib/icons';
import { useRules } from "@/composables/useRules";
import { RULE_CATEGORIES } from "@/types/rule.types";
import { useOptionalRules, isRuleEffectivelyEnabled } from "@/composables/useOptionalRules";
import { listOptionalRules } from "@/rules/optionalRules";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import { useUiStore } from "@/stores/ui";

const { data: rules, isLoading } = useRules();
const { data: campaignRules } = useOptionalRules();
const ui = useUiStore();
const search = computed({
  get: () => ui.customRulesSearch,
  set: (v) => { ui.customRulesSearch = v; },
});
const categoryFilter = computed({
  get: () => ui.customRulesFilterCategory,
  set: (v) => { ui.customRulesFilterCategory = v; },
});

const enabledBuiltIns = computed(() =>
  listOptionalRules().filter((def) => isRuleEffectivelyEnabled(campaignRules.value, def.key)),
);

const openBuiltIns = shallowRef(new Set<string>());
function toggleBuiltIn(key: string) {
  const next = new Set(openBuiltIns.value);
  if (next.has(key)) { next.delete(key); } else { next.add(key); }
  openBuiltIns.value = next;
}

function renderMarkdown(text: string): string {
  return renderBasicMarkdown(text);
}

const filtered = computed(() => {
  let list = rules.value ?? [];
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase();
    list = list.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.category?.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q))
    );
  }
  if (categoryFilter.value) list = list.filter((r) => r.category === categoryFilter.value);
  return list;
});

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
</script>
