<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-4 py-2.5 border-b border-border">
      <p class="text-label-lg font-semibold text-muted-foreground">Proficiencies & Languages</p>
    </div>
    <div class="divide-y divide-border">
      <div v-if="languages?.length" class="flex gap-3 px-4 py-2.5">
        <span class="text-label text-muted-foreground w-32 shrink-0 pt-0.5">Languages</span>
        <div class="flex flex-wrap gap-1.5">
          <template v-for="lang in languages" :key="lang">
            <RouterLink
              v-if="isOwner && isChoicePlaceholder(lang)"
              to="/play/character/edit?tab=profs"
              class="inline-flex items-center rounded-md bg-primary/8 border border-primary/30 border-dashed px-2 py-0.5 text-body text-primary/70 hover:text-primary hover:bg-primary/15 transition-colors"
              :title="'Tap to choose a language'"
            >{{ lang }}</RouterLink>
            <span
              v-else
              class="inline-flex items-center rounded-md bg-muted/50 border border-border px-2 py-0.5 text-body text-foreground"
            >{{ lang }}</span>
          </template>
        </div>
      </div>
      <div v-if="toolProficiencies?.length" class="flex gap-3 px-4 py-2.5">
        <span class="text-label text-muted-foreground w-32 shrink-0 pt-0.5">Tools</span>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="tool in toolProficiencies"
            :key="tool"
            class="inline-flex items-center rounded-md bg-muted/50 border border-border px-2 py-0.5 text-body text-foreground"
          >{{ tool }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";

const { languages, toolProficiencies, isOwner } = defineProps<{
  languages?: string[] | null;
  toolProficiencies?: string[] | null;
  isOwner?: boolean;
}>();

function isChoicePlaceholder(s: string): boolean {
  return s.toLowerCase().includes("choice");
}
</script>
