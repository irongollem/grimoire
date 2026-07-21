<template>
  <div>
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!customRules?.length && !enabledBuiltIns.length"
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

      <p v-if="!filteredBuiltIns.length && !filteredCustom.length" class="font-fell text-sm text-muted-foreground italic text-center py-6">
        No rules match your filter.
      </p>

      <!-- ── Built-in optional rules (enabled by DM) ────────────────────── -->
      <template v-if="filteredBuiltIns.length">
        <p class="font-cinzel text-2xs font-semibold tracking-widest text-muted-foreground uppercase">
          Optional Rules (active this campaign)
        </p>
        <div class="flex flex-col gap-1">
          <div
            v-for="def in filteredBuiltIns"
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
              <span class="shrink-0 px-1.5 py-0.5 rounded bg-emerald-500/10 text-label text-emerald-400">active</span>
            </button>
            <div v-if="openBuiltIns.has(def.key)" class="px-4 pb-4 border-t border-border">
              <p class="font-fell text-xs text-muted-foreground italic mt-3 mb-2">{{ def.summary }}</p>
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div class="prose-grimoire" v-html="renderMarkdown(def.description)" />
            </div>
          </div>
        </div>
      </template>

      <!-- ── Custom (player-visible) rules ─────────────────────────────── -->
      <template v-if="filteredCustom.length">
        <p v-if="filteredBuiltIns.length" class="font-cinzel text-2xs font-semibold tracking-widest text-muted-foreground uppercase mt-2">
          House Rules
        </p>
        <div class="flex flex-col gap-1">
          <div
            v-for="rule in filteredCustom"
            :key="rule.id"
            class="rounded-lg border border-border bg-card overflow-hidden"
          >
            <button
              type="button"
              class="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              @click="toggleRule(rule.id)"
            >
              <IconChevronRight
                class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200"
                :class="openRules.has(rule.id) ? 'rotate-90' : ''"
              />
              <span class="font-cinzel text-sm font-bold text-foreground flex-1">{{ rule.title }}</span>
              <span
                v-if="rule.category"
                class="shrink-0 px-1.5 py-0.5 rounded bg-muted text-label text-muted-foreground"
              >
                {{ rule.category }}
              </span>
              <div v-if="rule.tags.length" class="hidden sm:flex flex-wrap gap-1 shrink-0">
                <span
                  v-for="tag in rule.tags"
                  :key="tag"
                  class="px-1.5 py-0.5 rounded bg-primary/10 text-label text-primary"
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
                  class="px-1.5 py-0.5 rounded bg-primary/10 text-label text-primary"
                >
                  {{ tag }}
                </span>
              </div>
              <RichTextViewer v-if="rule.content" :content="rule.content" class="mt-3" />
              <p v-else class="font-fell text-sm text-muted-foreground italic mt-3">No content.</p>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, shallowRef } from "vue";
import { renderBasicMarkdown } from "@/lib/sanitizeHtml";
import { IconChevronRight } from '@/lib/icons';
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { usePlayerVisibleRules } from "@/composables/useRules";
import { useOptionalRules, isRuleEffectivelyEnabled } from "@/composables/useOptionalRules";
import { listOptionalRules } from "@/rules/optionalRules";

const { data: customRules, isLoading } = usePlayerVisibleRules();
const { data: campaignRules } = useOptionalRules();

const ruleSearch   = ref("");
const ruleCategory = ref("");

// Built-in optional rules the DM has enabled (player-facing only)
const enabledBuiltIns = computed(() =>
  listOptionalRules().filter(
    (def) => !def.dmOnly && isRuleEffectivelyEnabled(campaignRules.value, def.key),
  ),
);

const availableCategories = computed(() => {
  const cats = new Set<string>();
  customRules.value?.forEach((r) => { if (r.category) cats.add(r.category); });
  return [...cats].sort();
});

const q = computed(() => ruleSearch.value.trim().toLowerCase());

const filteredBuiltIns = computed(() => {
  if (!q.value) return enabledBuiltIns.value;
  return enabledBuiltIns.value.filter(
    (d) => d.name.toLowerCase().includes(q.value) || d.summary.toLowerCase().includes(q.value),
  );
});

const filteredCustom = computed(() => {
  const cat = ruleCategory.value;
  return (customRules.value ?? []).filter((r) => {
    if (cat && r.category !== cat) return false;
    if (q.value && !r.title.toLowerCase().includes(q.value) && !r.tags.some((t) => t.toLowerCase().includes(q.value))) return false;
    return true;
  });
});

// Expand/collapse
const openBuiltIns = shallowRef(new Set<string>());
function toggleBuiltIn(key: string) {
  const next = new Set(openBuiltIns.value);
  if (next.has(key)) { next.delete(key); } else { next.add(key); }
  openBuiltIns.value = next;
}

const openRules = shallowRef(new Set<string>());
function toggleRule(id: string) {
  const next = new Set(openRules.value);
  if (next.has(id)) { next.delete(id); } else { next.add(id); }
  openRules.value = next;
}

function renderMarkdown(text: string): string {
  return renderBasicMarkdown(text);
}
</script>
