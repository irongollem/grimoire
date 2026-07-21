<template>
  <div class="flex flex-col gap-5 max-w-2xl">
    <!-- Action bar -->
    <div class="flex items-center justify-end gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        @click="handleDelete"
      >
        <IconDelete class="h-3.5 w-3.5" />
        Delete
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        @click="router.push({ query: { ...route.query, edit: 'true' } })"
      >
        <IconEdit class="h-3.5 w-3.5" />
        Edit
      </button>
    </div>

    <!-- Identity: image + name / type / tags -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="p-4 flex gap-4">
        <div class="shrink-0 w-28 aspect-square rounded-md overflow-hidden bg-muted flex items-center justify-center">
          <FocalImage
            :src="feature.image_url"
            :alt="feature.name"
            format="portrait"
            :focal-point="feature.image_focal_point ?? null"
            :lightbox="true"
            placeholder="/assets/placeholders/dungeonfeature.webp"
            class="w-full h-full"
          />
        </div>
        <div class="flex-1 flex flex-col gap-2">
          <h1 class="font-cinzel text-xl font-bold text-foreground leading-tight">{{ feature.name }}</h1>
          <span class="text-label font-semibold bg-muted/60 text-muted-foreground rounded px-2 py-0.5 self-start">
            {{ feature.feature_type }}
          </span>
          <div v-if="feature.tags.length" class="flex flex-wrap gap-1">
            <span
              v-for="tag in feature.tags"
              :key="tag"
              class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
            >{{ tag }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Discovery DCs -->
    <div
      v-if="feature.perception_dc || feature.investigation_dc || feature.arcana_dc"
      class="rounded-lg border border-border bg-card overflow-hidden"
    >
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Discovery</span>
      </div>
      <div class="p-4 grid grid-cols-3 gap-x-6">
        <div v-if="feature.perception_dc">
          <span class="text-eyebrow font-semibold text-muted-foreground">Perception DC</span>
          <p class="font-cinzel text-2xl font-bold text-foreground">{{ feature.perception_dc }}</p>
        </div>
        <div v-if="feature.investigation_dc">
          <span class="text-eyebrow font-semibold text-muted-foreground">Investigation DC</span>
          <p class="font-cinzel text-2xl font-bold text-foreground">{{ feature.investigation_dc }}</p>
        </div>
        <div v-if="feature.arcana_dc">
          <span class="text-eyebrow font-semibold text-muted-foreground">Arcana DC</span>
          <p class="font-cinzel text-2xl font-bold text-foreground">{{ feature.arcana_dc }}</p>
        </div>
      </div>
    </div>

    <!-- Trigger -->
    <div
      v-if="feature.trigger_type || feature.trigger_description"
      class="rounded-lg border border-border bg-card overflow-hidden"
    >
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Trigger</span>
      </div>
      <div class="p-4 flex flex-col gap-2">
        <span
          v-if="feature.trigger_type"
          class="text-label font-semibold bg-amber-500/10 text-amber-400 rounded px-2.5 py-1 self-start"
        >{{ feature.trigger_type }}</span>
        <p v-if="feature.trigger_description" class="font-fell text-sm text-foreground italic">
          {{ feature.trigger_description }}
        </p>
      </div>
    </div>

    <!-- Contents -->
    <div v-if="hasContents" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Contents / What's Inside</span>
      </div>
      <div class="p-4">
        <RichTextViewer :content="feature.contents_description" />
      </div>
    </div>

    <!-- Description -->
    <div v-if="hasDescription" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Description</span>
      </div>
      <div class="p-4">
        <RichTextViewer :content="feature.description" />
      </div>
    </div>

    <!-- DM Notes -->
    <div v-if="hasNotes" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">DM Notes</span>
      </div>
      <div class="p-4">
        <RichTextViewer :content="feature.notes" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconDelete, IconEdit } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import { useDeleteDungeonFeature } from "@/composables/useDungeonFeatures";
import type { DungeonFeature } from "@/types/dungeonFeature.types";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";

const props  = defineProps<{ feature: DungeonFeature }>();
const route  = useRoute();
const router = useRouter();
const { confirm } = useConfirm();

const deleteMut = useDeleteDungeonFeature();

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

const hasContents    = computed(() => hasContent(props.feature.contents_description));
const hasDescription = computed(() => hasContent(props.feature.description));
const hasNotes       = computed(() => hasContent(props.feature.notes));

async function handleDelete() {
  const ok = await confirm(`Delete "${props.feature.name}"? This cannot be undone.`, {
    title: "Delete Feature",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  router.push("/dungeon-craft");
  await deleteMut.mutateAsync(props.feature);
}
</script>
