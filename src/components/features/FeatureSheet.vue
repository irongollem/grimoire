<template>
  <div class="flex flex-col gap-5 max-w-2xl">
    <!-- Action bar -->
    <div class="flex items-center justify-end gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        @click="handleDelete"
      >
        <IconDelete class="h-3.5 w-3.5" />Delete
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        @click="router.push({ query: { ...route.query, edit: 'true' } })"
      >
        <IconEdit class="h-3.5 w-3.5" />Edit
      </button>
    </div>

    <!-- Identity card -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="p-4 flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-label font-semibold bg-primary/10 text-primary rounded px-2 py-0.5">
            {{ FEATURE_TYPE_LABELS[feature.feature_type] }}
          </span>
          <span v-if="feature.source" class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5">
            {{ feature.source }}
          </span>
          <span
            class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
          >
            {{ feature.campaign_id ? 'Campaign-scoped' : 'All campaigns' }}
          </span>
        </div>
        <p v-if="feature.prerequisite" class="font-fell text-sm text-muted-foreground italic">
          Prerequisite: {{ feature.prerequisite }}
        </p>
        <div v-if="feature.tags.length" class="flex flex-wrap gap-1">
          <span
            v-for="tag in feature.tags"
            :key="tag"
            class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
          >{{ tag }}</span>
        </div>
      </div>
    </div>

    <!-- Description card -->
    <div v-if="hasDescription" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Description</span>
      </div>
      <div class="p-4">
        <RichTextViewer :content="feature.description" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconDelete, IconEdit } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import { useDeleteFeature } from "@/composables/useFeatures";
import type { ClassFeature } from "@/types/feature.types";
import { FEATURE_TYPE_LABELS } from "@/types/feature.types";
import RichTextViewer from "@/components/common/RichTextViewer.vue";

const props = defineProps<{ feature: ClassFeature }>();
const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const deleteMut = useDeleteFeature();

function hasContent(field: string | null | undefined): boolean {
  if (!field) return false;
  try {
    const doc = JSON.parse(field);
    const texts: string[] = [];
    function walk(n: { text?: string; content?: unknown[] }) {
      if (n.text) texts.push(n.text);
      (n.content as typeof n[] | undefined)?.forEach(walk);
    }
    walk(doc);
    return texts.join("").trim().length > 0;
  } catch {
    return String(field).trim().length > 0;
  }
}

const hasDescription = computed(() => hasContent(props.feature.description));

async function handleDelete() {
  const ok = await confirm(`Delete "${props.feature.name}"? This cannot be undone.`, {
    title: "Delete Ability",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  router.push("/features");
  await deleteMut.mutateAsync(props.feature.id);
}
</script>
