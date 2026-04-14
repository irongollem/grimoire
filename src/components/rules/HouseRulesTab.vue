<template>
  <div>
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

      <p v-if="!filteredRules.length" class="font-fell text-sm text-muted-foreground italic text-center py-6">
        No rules match your filter.
      </p>

      <div v-else class="flex flex-col gap-1">
        <div
          v-for="rule in filteredRules"
          :key="rule.id"
          class="rounded-lg border border-border bg-card overflow-hidden"
        >
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

          <div v-if="openRules.has(rule.id)" class="px-4 pb-4 border-t border-border">
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
</template>

<script setup lang="ts">
import { ref, computed, shallowRef } from "vue";
import { ChevronRight } from "lucide-vue-next";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { usePlayerVisibleRules } from "@/composables/useRules";

const { data: rules, isLoading } = usePlayerVisibleRules();

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

const openRules = shallowRef(new Set<string>());
function toggleRule(id: string) {
  const next = new Set(openRules.value);
  if (next.has(id)) { next.delete(id); } else { next.add(id); }
  openRules.value = next;
}
</script>
