<template>
  <div class="flex flex-col gap-5 max-w-3xl">
    <!-- Action bar -->
    <div class="flex items-center justify-end gap-2">
      <AppButton variant="destructive" size="md" :icon="IconDelete" label="Delete" @click="handleDelete" />
      <AppButton
        variant="primary"
        size="md"
        :icon="IconEdit"
        label="Edit"
        @click="router.push({ query: { ...route.query, edit: 'true' } })"
      />
    </div>

    <!-- Metadata row -->
    <div class="flex flex-wrap items-center gap-2">
      <span v-if="rule.category" class="text-label-lg font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
        {{ rule.category }}
      </span>
      <span v-if="rule.is_player_visible" class="text-label-lg font-semibold px-2 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
        Visible to players
      </span>
      <span
        v-for="tag in rule.tags"
        :key="tag"
        class="px-2 py-0.5 rounded-full bg-muted text-caption text-muted-foreground"
      >
        {{ tag }}
      </span>
    </div>

    <!-- Content -->
    <div v-if="hasContent(rule.content)" class="rounded-lg border border-border bg-card p-4">
      <RichTextViewer :content="JSON.stringify(rule.content)" />
    </div>
    <p v-else class="text-body text-muted-foreground italic">No content yet.</p>

    <!-- Tracker summary -->
    <div v-if="rule.tracker" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
        <div>
          <span class="text-label-lg font-semibold text-muted-foreground">TRACKER</span>
          <span v-if="rule.tracker.label" class="ml-2 font-cinzel text-xs font-semibold text-foreground">{{ rule.tracker.label }}</span>
        </div>
        <span class="font-cinzel text-2xs text-muted-foreground capitalize px-2 py-0.5 rounded bg-muted">
          {{ rule.tracker.type }} · {{ rule.tracker.min }}–{{ rule.tracker.max }}
        </span>
      </div>

      <!-- Levels -->
      <div v-if="rule.tracker.type === 'level' && rule.tracker.levels?.length" class="px-4 py-3 space-y-1.5">
        <div
          v-for="lvl in rule.tracker.levels"
          :key="String(lvl.value)"
          class="flex items-center gap-2"
        >
          <span
            class="w-6 text-center font-cinzel text-xs font-bold shrink-0"
            :class="levelColorClass(lvl.color)"
          >
            {{ lvl.value }}
          </span>
          <span class="text-body text-foreground">{{ lvl.label }}</span>
          <span v-if="lvl.effects?.length" class="text-caption text-muted-foreground italic ml-1">
            ({{ lvl.effects.length }} effect{{ lvl.effects.length === 1 ? '' : 's' }})
          </span>
        </div>
      </div>

      <!-- DM Buttons -->
      <div v-if="rule.tracker.dmButtons?.length" class="px-4 py-3 border-t border-border flex flex-wrap gap-2">
        <span class="w-full text-label text-muted-foreground mb-0.5">DM BUTTONS</span>
        <span
          v-for="btn in rule.tracker.dmButtons"
          :key="btn.label"
          class="inline-flex items-center gap-1 px-2 py-1 rounded border border-border bg-muted text-caption text-foreground"
        >
          {{ btn.label }}
          <span class="font-cinzel text-2xs text-muted-foreground">{{ btn.delta > 0 ? `+${btn.delta}` : btn.delta }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconDelete, IconEdit } from '@/lib/icons';
import { useRoute, useRouter } from "vue-router";
import { useConfirm } from "@/composables/useConfirm";
import { useDeleteRule } from "@/composables/rules/useRules";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import AppButton from "@/components/common/AppButton.vue";
import type { Rule } from "@/types/rule.types";

const props = defineProps<{ rule: Rule }>();

const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const deleteMut = useDeleteRule();

function hasContent(content: object | null | undefined): boolean {
  if (!content) return false;
  const doc = content as { content?: unknown[] };
  if (!Array.isArray(doc?.content) || doc.content.length === 0) return false;
  return doc.content.some(
    (n: unknown) => {
      const node = n as { type: string; content?: unknown[] };
      return node.type !== "paragraph" || (node.content && node.content.length > 0);
    },
  );
}

const LEVEL_COLOR_CLASSES: Record<string, string> = {
  green:  "text-green-600 dark:text-green-400",
  yellow: "text-yellow-600 dark:text-yellow-400",
  orange: "text-orange-600 dark:text-orange-400",
  red:    "text-red-600 dark:text-red-400",
  blue:   "text-blue-600 dark:text-blue-400",
  purple: "text-purple-600 dark:text-purple-400",
};

function levelColorClass(color?: string): string {
  return color ? (LEVEL_COLOR_CLASSES[color] ?? "text-foreground") : "text-foreground";
}

async function handleDelete() {
  const ok = await confirm(`Delete "${props.rule.title}"? This cannot be undone.`, {
    title: "Delete Rule",
    confirmLabel: "Delete",
  });
  if (!ok) return;
  await deleteMut.mutateAsync(props.rule.id);
  router.push("/rules");
}
</script>
