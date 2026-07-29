<template>
  <div class="rounded-lg border border-border bg-card p-3 space-y-2">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="font-cinzel text-sm font-bold text-foreground">{{ group.source }}</p>
        <p class="text-caption text-muted-foreground">
          {{ group.sound_count.toLocaleString() }}
          {{ group.sound_count === 1 ? "sound" : "sounds" }}
          from {{ group.author_count.toLocaleString() }}
          {{ group.author_count === 1 ? "creator" : "creators" }}
        </p>
      </div>
      <a
        v-if="group.license_url"
        :href="group.license_url"
        target="_blank"
        rel="noopener noreferrer"
        class="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 font-cinzel text-2xs text-primary whitespace-nowrap shrink-0 hover:bg-primary/20 transition-colors"
      >
        {{ group.license }}
      </a>
      <span
        v-else
        class="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 font-cinzel text-2xs text-primary whitespace-nowrap shrink-0"
      >
        {{ group.license }}
      </span>
    </div>

    <!-- CC0 waives the credit requirement. Saying so plainly is better than an
         empty credits list, which reads as though the credits went missing. -->
    <p v-if="!group.requires_credit" class="text-caption text-muted-foreground italic">
      This licence requires no attribution.
    </p>

    <details v-else-if="credits.length" class="group/credits">
      <summary
        class="cursor-pointer text-caption text-primary hover:underline marker:content-none list-none"
      >
        {{ credits.length.toLocaleString() }} credit
        {{ credits.length === 1 ? "line" : "lines" }}
        <span class="group-open/credits:hidden">— show</span>
        <span class="hidden group-open/credits:inline">— hide</span>
      </summary>
      <ul class="mt-2 space-y-1.5">
        <li
          v-for="credit in credits"
          :key="credit"
          class="text-caption text-muted-foreground leading-relaxed"
        >
          {{ credit }}
        </li>
      </ul>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { AudioLicenseGroup } from "@/types/license.types";

const { group } = defineProps<{
  group: AudioLicenseGroup;
}>();

// `attributions` is null when the licence requires no credit — deliberately
// distinct from an empty list, which would mean credits were expected and have
// gone missing. Both states are read explicitly here rather than collapsed
// together, because only one of them is benign.
const credits = computed<readonly string[]>(() =>
  group.requires_credit && group.attributions !== null ? group.attributions : [],
);
</script>
