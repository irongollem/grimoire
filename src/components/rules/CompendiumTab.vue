<template>
  <div class="flex h-full min-h-0">
    <!-- Sidebar: rule tree -->
    <div class="w-64 shrink-0 flex flex-col gap-2 overflow-y-auto px-4 pt-4 pb-4 md:px-6 md:pt-6">
      <ListFilterBar
        :has-active-filters="ui.compendiumHasActiveFilters"
        @clear="ui.resetCompendiumFilters()"
      >
        <template #above>
          <ListSearchInput v-model="ui.compendiumSearch" :inline="false" placeholder="Search rules…" />
        </template>
      </ListFilterBar>

      <div v-if="isLoading" class="flex justify-center py-8">
        <LoadingSpinner />
      </div>

      <p v-else-if="error" class="text-caption text-destructive italic px-1">
        Failed to load rules. The database may need syncing — contact your DM.
      </p>

      <p v-else-if="!libraryRules?.length" class="text-caption text-muted-foreground italic px-1">
        No rules loaded yet. The sync edge function may not have run.
      </p>

      <template v-else>
        <!-- IconSearch results (flat) -->
        <template v-if="ui.compendiumSearch.trim()">
          <AppButton
            v-for="rule in searchResults"
            :key="rule.id"
            variant="menu"
            size="body"
            block
            :active="selected?.id === rule.id"
            :class="selected?.id === rule.id ? 'font-semibold' : ''"
            :label="rule.name"
            @click="selected = rule"
          />
          <p v-if="!searchResults.length" class="text-caption text-muted-foreground italic px-1">
            No matches.
          </p>
        </template>

        <!-- Tree (root → children) -->
        <template v-else>
          <div v-for="root in rootRules" :key="root.id">
            <AppButton
              variant="menu"
              size="sm"
              block
              class="font-semibold"
              :active="selected?.id === root.id"
              :label="root.name"
              @click="selectRule(root)"
            />
            <div v-if="childrenOf(root.slug).length" class="ml-3 border-l border-border/50 pl-2 mt-0.5 space-y-0.5">
              <AppButton
                v-for="child in childrenOf(root.slug)"
                :key="child.id"
                variant="ghost"
                fill="muted"
                size="body"
                block
                class="justify-start text-left"
                :active="selected?.id === child.id"
                :class="selected?.id === child.id ? 'font-semibold' : ''"
                :label="child.name"
                @click="selected = child"
              />
            </div>
          </div>
        </template>
      </template>
    </div>

    <!-- Main: rule content -->
    <div class="flex-1 overflow-y-auto px-4 pt-4 pb-4 md:px-6 md:pt-6">
      <div v-if="selected" class="max-w-3xl space-y-3">
        <h2 class="text-heading-lg font-bold text-foreground">{{ selected.name }}</h2>
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
import { useLibraryRules } from "@/composables/rules/useRules";
import { useUiStore } from "@/stores/ui";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import AppButton from "@/components/common/AppButton.vue";
import type { LibraryRule } from "@/types/rule.types";

const { data: libraryRules, isLoading, error } = useLibraryRules();

// Filter State Pattern — the sidebar query survives leaving the Reliquary and
// coming back. `selected` stays local: it is a cursor, not a filter.
const ui = useUiStore();
const selected = ref<LibraryRule | null>(null);

const rootRules = computed(() =>
  (libraryRules.value ?? []).filter((r) => !r.parent_slug)
);

function childrenOf(slug: string): LibraryRule[] {
  return (libraryRules.value ?? []).filter((r) => r.parent_slug === slug);
}

const searchResults = computed(() => {
  const q = ui.compendiumSearch.toLowerCase().trim();
  if (!q) return [];
  return (libraryRules.value ?? []).filter(
    (r) => r.name.toLowerCase().includes(q) || r.content.toLowerCase().includes(q)
  );
});

function selectRule(rule: LibraryRule) {
  selected.value = rule;
}

// Convert plain text to basic HTML: blank lines → paragraphs, **bold** (escaped).
const renderedContent = computed(() => renderBasicMarkdown(selected.value?.content));
</script>
