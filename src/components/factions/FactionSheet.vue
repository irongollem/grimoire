<template>
  <div class="grid grid-cols-1 lg:grid-cols-[15rem_1fr] gap-5">
    <!-- Left: emblem + meta chips -->
    <div class="flex flex-col gap-4">
      <div class="relative aspect-square rounded-lg border border-border overflow-hidden bg-muted">
        <FocalImage
          :src="faction.emblem_url"
          :alt="faction.name + ' emblem'"
          format="portrait"
          :lightbox="true"
          placeholder="/assets/placeholders/faction.webp"
          class="w-full h-full"
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <div v-if="faction.faction_type">
          <span class="text-eyebrow font-semibold text-muted-foreground">Type</span>
          <p class="text-body text-foreground">{{ faction.faction_type }}</p>
        </div>
        <div v-if="faction.alignment" class="mt-2">
          <span class="text-eyebrow font-semibold text-muted-foreground">Alignment</span>
          <p class="text-body text-foreground">{{ faction.alignment }}</p>
        </div>
        <div v-if="faction.tags?.length" class="mt-2">
          <span class="text-eyebrow font-semibold text-muted-foreground">Tags</span>
          <div class="flex flex-wrap gap-1 mt-1">
            <span
              v-for="tag in faction.tags"
              :key="tag"
              class="text-label bg-muted/60 text-muted-foreground rounded px-2 py-0.5"
            >{{ tag }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: name + description + actions -->
    <div class="flex flex-col gap-4">
      <div class="flex items-start justify-between gap-3">
        <h1 class="text-title font-bold text-foreground leading-tight flex-1">{{ faction.name }}</h1>
        <div class="flex items-center gap-2 shrink-0">
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
      </div>

      <div v-if="hasDescription">
        <RichTextViewer :content="faction.description" />
      </div>
      <p v-else class="text-body text-muted-foreground italic">
        No description recorded for this faction.
      </p>

      <!-- Patron Deities -->
      <div class="border-t border-border pt-4">
        <p class="text-eyebrow font-semibold text-muted-foreground mb-2">Patron Deities</p>
        <FactionDeitiesSection :faction-id="faction.id" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconDelete, IconEdit } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import { useDeleteFaction } from "@/composables/useFactions";
import type { Faction } from "@/types/faction.types";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import FactionDeitiesSection from "@/components/factions/FactionDeitiesSection.vue";

const props = defineProps<{ faction: Faction }>();
const route  = useRoute();
const router = useRouter();
const { confirm } = useConfirm();

const deleteFaction = useDeleteFaction();

async function handleDelete() {
  if (!(await confirm(`Delete "${props.faction.name}"? This cannot be undone.`))) return;
  router.push("/factions");
  await deleteFaction.mutateAsync(props.faction.id);
}

// Tiptap emptiness guard — skip the section when the doc has no text.
const hasDescription = computed(() => {
  const d = props.faction.description;
  if (!d) return false;
  try {
    const doc = JSON.parse(d);
    const texts: string[] = [];
    function walk(n: { text?: string; content?: unknown[] }) {
      if (n.text) texts.push(n.text);
      (n.content as typeof n[] | undefined)?.forEach(walk);
    }
    walk(doc);
    return texts.join("").trim().length > 0;
  } catch {
    return String(d).trim().length > 0;
  }
});
</script>
