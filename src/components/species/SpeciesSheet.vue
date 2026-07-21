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
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        @click="router.push({ query: { ...route.query, edit: 'true' } })"
      >
        <IconEdit class="h-3.5 w-3.5" />Edit
      </button>
    </div>

    <!-- Identity card: two-column layout -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="p-4 flex gap-4">
        <!-- Portrait column -->
        <div class="shrink-0 w-28 aspect-square rounded-md overflow-hidden bg-muted flex items-center justify-center">
          <FocalImage
            :src="species.image_url"
            :alt="species.name"
            format="portrait"
            :focal-point="species.focal_point ?? null"
            :lightbox="true"
            placeholder="/assets/placeholders/species.webp"
            class="w-full h-full"
          />
        </div>
        <!-- Info column -->
        <div class="flex-1 flex flex-col gap-2">
          <h1 class="font-cinzel text-xl font-bold text-foreground leading-tight">{{ species.name }}</h1>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-if="species.size"
              class="text-label bg-primary/10 text-primary rounded px-2 py-0.5"
            >{{ capitalize(species.size) }}</span>
            <span
              v-if="species.source"
              class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
            >{{ species.source }}</span>
          </div>
          <div v-if="speedPills.length" class="flex flex-wrap gap-1">
            <span
              v-for="pill in speedPills"
              :key="pill"
              class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
            >{{ pill }}</span>
          </div>
          <p v-if="asiText" class="font-fell text-sm text-muted-foreground">{{ asiText }}</p>
          <div v-if="species.languages.length" class="flex flex-wrap gap-1 mt-0.5">
            <span class="text-label text-muted-foreground self-center">Lang:</span>
            <span
              v-for="lang in species.languages"
              :key="lang"
              class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
            >{{ lang }}</span>
          </div>
        </div>
      </div>
      <!-- Tags row -->
      <div v-if="species.tags.length" class="px-4 pb-3 flex flex-wrap gap-1">
        <span
          v-for="tag in species.tags"
          :key="tag"
          class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
        >{{ tag }}</span>
      </div>
    </div>

    <!-- Description card -->
    <div v-if="hasDescription" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Description</span>
      </div>
      <div class="p-4">
        <RichTextViewer :content="species.description" />
      </div>
    </div>

    <!-- Traits card -->
    <div v-if="species.traits?.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Racial Traits</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <div v-for="trait in species.traits" :key="trait.name">
          <span class="inline-block text-label font-semibold bg-primary/10 text-primary rounded px-2 py-0.5 mb-1">
            {{ trait.name }}
          </span>
          <RichTextViewer :content="trait.description" class="font-fell text-sm" />
        </div>
      </div>
    </div>

    <!-- Subraces card -->
    <div v-if="species.subraces?.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Subraces</span>
      </div>
      <div class="p-4 flex flex-col gap-5">
        <div v-for="sub in species.subraces" :key="sub.name">
          <h3 class="font-cinzel text-sm font-bold text-foreground mb-1">{{ sub.name }}</h3>
          <p v-if="asiToString(sub.ability_score_increases ?? null)" class="font-fell text-sm text-muted-foreground mb-2">
            {{ asiToString(sub.ability_score_increases ?? null) }}
          </p>
          <RichTextViewer v-if="sub.description" :content="sub.description" class="mb-2" />
          <div v-if="sub.traits?.length" class="flex flex-col gap-2 pl-3 border-l border-border">
            <div v-for="trait in sub.traits" :key="trait.name">
              <span class="inline-block text-label font-semibold bg-muted/40 text-muted-foreground rounded px-2 py-0.5 mb-0.5">
                {{ trait.name }}
              </span>
              <RichTextViewer :content="trait.description" class="font-fell text-sm" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- DM Notes card -->
    <div v-if="hasNotes" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">DM Notes</span>
      </div>
      <div class="p-4">
        <RichTextViewer :content="species.notes" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconDelete, IconEdit } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import { useDeleteSpecies } from "@/composables/useSpecies";
import type { Species } from "@/types/species.types";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";

const props = defineProps<{ species: Species }>();
const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const deleteMut = useDeleteSpecies();

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

const hasDescription = computed(() => hasContent(props.species.description));
const hasNotes = computed(() => hasContent(props.species.notes));

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const speedPills = computed(() => {
  const s = props.species.speed;
  if (!s) return [];
  const labels: Record<string, string> = {
    walk: "Walk",
    fly: "Fly",
    swim: "Swim",
    climb: "Climb",
    burrow: "Burrow",
  };
  return (Object.keys(s) as (keyof typeof s)[])
    .filter(k => s[k] !== null && s[k] !== undefined && s[k]! > 0)
    .map(k => `${labels[k] ?? capitalize(k)} ${s[k]}ft`);
});

function asiToString(asi: Species["ability_score_increases"]): string {
  if (!asi) return "";
  if ("description" in asi && typeof asi.description === "string") return asi.description as string;
  return Object.entries(asi)
    .map(([k, v]) => `+${v} ${k.toUpperCase()}`)
    .join(", ");
}

const asiText = computed(() => asiToString(props.species.ability_score_increases));

async function handleDelete() {
  const ok = await confirm(`Delete "${props.species.name}"? This cannot be undone.`, {
    title: "Delete Species",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  router.push("/species");
  await deleteMut.mutateAsync(props.species);
}
</script>
