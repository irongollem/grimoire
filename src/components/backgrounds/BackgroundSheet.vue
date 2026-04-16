<template>
  <div class="flex flex-col gap-5 max-w-2xl">
    <!-- Action bar -->
    <div class="flex items-center justify-end gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        @click="handleDelete"
      >
        <Trash2 class="h-3.5 w-3.5" />Delete
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        @click="router.push({ query: { ...route.query, edit: 'true' } })"
      >
        <Pencil class="h-3.5 w-3.5" />Edit
      </button>
    </div>

    <!-- Identity card -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="p-4 flex gap-4">
        <div class="shrink-0 w-28 aspect-square rounded-md overflow-hidden bg-muted flex items-center justify-center">
          <FocalImage
            v-if="background.image_url"
            :src="background.image_url"
            :alt="background.name"
            format="portrait"
            :focal-point="background.focal_point ?? null"
            class="w-full h-full"
          />
          <User2 v-else class="h-8 w-8 text-muted-foreground/30" />
        </div>
        <div class="flex-1 flex flex-col gap-2">
          <h1 class="font-cinzel text-xl font-bold text-foreground leading-tight">{{ background.name }}</h1>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-if="background.source_title || background.source"
              class="font-cinzel text-[10px] tracking-wider bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
            >{{ background.source_title ?? background.source }}</span>
          </div>
          <p
            v-if="background.open5e_import"
            class="font-fell text-xs text-muted-foreground italic"
          >
            Imported from Open5e
          </p>
        </div>
      </div>
    </div>

    <!-- Proficiencies card -->
    <div
      v-if="background.skill_proficiencies.length || background.tool_proficiencies.length || background.languages.length"
      class="rounded-lg border border-border bg-card overflow-hidden"
    >
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Proficiencies</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <div v-if="background.skill_proficiencies.length">
          <span class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase block mb-1.5">Skills</span>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="s in background.skill_proficiencies"
              :key="s"
              class="font-cinzel text-[10px] tracking-wider bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
            >{{ s }}</span>
          </div>
        </div>
        <div v-if="background.tool_proficiencies.length">
          <span class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase block mb-1.5">Tools</span>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="t in background.tool_proficiencies"
              :key="t"
              class="font-cinzel text-[10px] tracking-wider bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
            >{{ t }}</span>
          </div>
        </div>
        <div v-if="background.languages.length">
          <span class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase block mb-1.5">Languages</span>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="l in background.languages"
              :key="l"
              class="font-cinzel text-[10px] tracking-wider bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
            >{{ l }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Tags card -->
    <div v-if="background.tags.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Tags</span>
      </div>
      <div class="p-4 flex flex-wrap gap-1">
        <span
          v-for="tag in background.tags"
          :key="tag"
          class="font-cinzel text-[10px] tracking-wider bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
        >{{ tag }}</span>
      </div>
    </div>

    <!-- Description card -->
    <div v-if="hasDescription" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Description</span>
      </div>
      <div class="p-4">
        <RichTextViewer :content="background.description" />
      </div>
    </div>

    <!-- Equipment card -->
    <div v-if="background.equipment" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Starting Equipment</span>
      </div>
      <div class="p-4">
        <p class="font-fell text-sm text-foreground">{{ background.equipment }}</p>
      </div>
    </div>

    <!-- Background feature card -->
    <div v-if="background.feature_name" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Feature</span>
      </div>
      <div class="p-4 flex flex-col gap-2">
        <p class="font-cinzel text-sm font-bold text-foreground">{{ background.feature_name }}</p>
        <p v-if="background.feature_description" class="font-fell text-sm text-foreground">
          {{ background.feature_description }}
        </p>
      </div>
    </div>

    <!-- Suggested characteristics card -->
    <div v-if="background.suggested_characteristics" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Suggested Characteristics</span>
      </div>
      <div class="p-4">
        <p class="font-fell text-sm text-foreground whitespace-pre-line">{{ background.suggested_characteristics }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Pencil, Trash2, User2 } from "lucide-vue-next";
import { useConfirm } from "@/composables/useConfirm";
import { useDeleteBackground } from "@/composables/useBackgrounds";
import type { Background } from "@/types/background.types";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";

const props = defineProps<{ background: Background }>();
const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const deleteMut = useDeleteBackground();

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

const hasDescription = computed(() => hasContent(props.background.description));

async function handleDelete() {
  const ok = await confirm(`Delete "${props.background.name}"? This cannot be undone.`, {
    title: "Delete Background",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  router.push("/codex/backgrounds");
  await deleteMut.mutateAsync(props.background);
}
</script>
