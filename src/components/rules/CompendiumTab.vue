<template>
  <div class="flex h-full min-h-0">
    <!-- Sidebar: rule tree -->
    <div class="w-64 shrink-0 flex flex-col gap-2 overflow-y-auto px-4 pt-4 pb-4 md:px-6 md:pt-6">
      <div class="relative">
        <IconSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          v-model="search"
          type="text"
          placeholder="Search rules…"
          class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div v-if="isLoading" class="flex justify-center py-8">
        <LoadingSpinner />
      </div>

      <p v-else-if="error" class="text-caption text-destructive italic px-1">
        Failed to load rules. The database may need syncing — contact your DM.
      </p>

      <p v-else-if="!srdRules?.length" class="text-caption text-muted-foreground italic px-1">
        No rules loaded yet. The sync edge function may not have run.
      </p>

      <template v-else>
        <!-- IconSearch results (flat) -->
        <template v-if="search.trim()">
          <button
            v-for="rule in searchResults"
            :key="rule.id"
            class="text-left px-2.5 py-1.5 rounded-md text-body transition-colors"
            :class="selected?.id === rule.id
              ? 'bg-primary/10 text-primary font-semibold'
              : 'text-foreground hover:bg-muted/60'"
            @click="selected = rule"
          >
            {{ rule.name }}
          </button>
          <p v-if="!searchResults.length" class="text-caption text-muted-foreground italic px-1">
            No matches.
          </p>
        </template>

        <!-- Tree (root → children) -->
        <template v-else>
          <div v-for="root in rootRules" :key="root.id">
            <button
              class="w-full text-left px-2.5 py-1.5 rounded-md text-label-lg font-semibold transition-colors"
              :class="selected?.id === root.id
                ? 'bg-primary/10 text-primary'
                : 'text-foreground hover:bg-muted/60'"
              @click="selectRule(root)"
            >
              {{ root.name }}
            </button>
            <div v-if="childrenOf(root.slug).length" class="ml-3 border-l border-border/50 pl-2 mt-0.5 space-y-0.5">
              <button
                v-for="child in childrenOf(root.slug)"
                :key="child.id"
                class="w-full text-left px-2 py-1 rounded text-body transition-colors"
                :class="selected?.id === child.id
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'"
                @click="selected = child"
              >
                {{ child.name }}
              </button>
            </div>
          </div>
        </template>
      </template>
    </div>

    <!-- Main: rule content -->
    <div class="flex-1 overflow-y-auto px-4 pt-4 pb-4 md:px-6 md:pt-6">
      <div v-if="selected" class="max-w-3xl space-y-3">
        <h2 class="font-cinzel text-xl font-bold text-foreground">{{ selected.name }}</h2>
        <div
          class="font-fell text-base text-foreground leading-relaxed whitespace-pre-wrap prose-dm"
          v-html="renderedContent"
        />
      </div>
      <div v-else class="flex items-center justify-center h-full">
        <p class="text-body text-muted-foreground italic">Select a rule from the list.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { renderBasicMarkdown } from "@/lib/sanitizeHtml";
import { IconSearch } from '@/lib/icons';
import { useSrdRules } from "@/composables/useRules";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import type { SrdRule } from "@/types/rule.types";

const { data: srdRules, isLoading, error } = useSrdRules();

const search = ref("");
const selected = ref<SrdRule | null>(null);

const rootRules = computed(() =>
  (srdRules.value ?? []).filter((r) => !r.parent_slug)
);

function childrenOf(slug: string): SrdRule[] {
  return (srdRules.value ?? []).filter((r) => r.parent_slug === slug);
}

const searchResults = computed(() => {
  const q = search.value.toLowerCase().trim();
  if (!q) return [];
  return (srdRules.value ?? []).filter(
    (r) => r.name.toLowerCase().includes(q) || r.content.toLowerCase().includes(q)
  );
});

function selectRule(rule: SrdRule) {
  selected.value = rule;
}

// Convert plain text to basic HTML: blank lines → paragraphs, **bold** (escaped).
const renderedContent = computed(() => renderBasicMarkdown(selected.value?.content));
</script>
