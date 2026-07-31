<template>
  <div v-if="originFeat" class="rounded-lg border border-primary/30 bg-primary/5 overflow-hidden">
    <div class="px-3 py-2 border-b border-primary/20 bg-primary/10 flex items-center gap-2">
      <span class="text-label-lg font-semibold text-primary">Origin Feat</span>
      <span class="text-eyebrow text-primary/60">2024 PHB</span>
    </div>
    <div class="p-4 flex flex-col gap-2">
      <div class="flex items-center gap-2 flex-wrap">
        <RouterLink
          v-if="resolved?.feature"
          :to="`/features/${resolved.feature.id}`"
          class="font-cinzel text-sm font-bold text-primary hover:underline"
        >{{ originFeat.name }}</RouterLink>
        <p v-else class="font-cinzel text-sm font-bold text-foreground">{{ originFeat.name }}</p>
        <span
          v-if="originFeat.variant"
          class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
        >{{ originFeat.variant }}</span>
      </div>
      <p v-if="!resolved?.feature" class="text-caption text-amber-600 dark:text-amber-400 italic">
        Not yet imported — import SRD feats from
        <RouterLink to="/codex/abilities" class="underline font-semibold">Codex → Abilities</RouterLink>
        to link this grant to its full text.
      </p>
      <!-- Optional supplementary content — e.g. a background's own feat_grant_description. -->
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useAllFeatures } from "@/composables/useFeatures";
import { resolveOriginFeat } from "@/rules/backgroundAsi";
import type { BackgroundOriginFeat } from "@/types/background.types";

const { originFeat } = defineProps<{ originFeat: BackgroundOriginFeat | null }>();

const { data: allFeatures } = useAllFeatures();
const resolved = computed(() => resolveOriginFeat(originFeat, allFeatures.value ?? []));
</script>
