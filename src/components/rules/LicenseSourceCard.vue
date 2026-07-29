<template>
  <div class="rounded-lg border border-border bg-card p-3 space-y-2">
    <div class="flex items-start justify-between gap-3">
      <!-- Never truncate the title or publisher: this is the credit line itself,
           and a product name clipped to fit is a credit that no longer names the
           work it is crediting. -->
      <div class="min-w-0">
        <p class="font-cinzel text-sm font-bold text-foreground">{{ source.title }}</p>
        <p class="text-caption text-muted-foreground">{{ source.publisher }}</p>
      </div>
      <div v-if="source.license_keys.length" class="flex flex-wrap gap-1 shrink-0 justify-end">
        <span
          v-for="key in source.license_keys"
          :key="key"
          class="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 font-cinzel text-2xs text-primary whitespace-nowrap"
        >
          {{ shortName(key) }}
        </span>
      </div>
    </div>

    <div v-if="entryCounts.length" class="flex flex-wrap gap-1.5">
      <span
        v-for="c in entryCounts"
        :key="c.label"
        class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-2xs text-muted-foreground"
      >
        {{ c.count.toLocaleString() }} {{ c.label }}
      </span>
    </div>

    <p v-if="source.copyright_notice" class="text-caption text-muted-foreground italic whitespace-pre-wrap">
      {{ source.copyright_notice }}
    </p>

    <a
      v-if="source.product_url"
      :href="source.product_url"
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1 text-caption text-primary hover:underline"
    >
      Product page
      <IconExternalLink class="h-3 w-3" />
    </a>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconExternalLink } from "@/lib/icons";
import { licenseDescriptor } from "@/lib/contentLicenses";
import type { ContentLicenseSource } from "@/types/license.types";

const { source } = defineProps<{
  source: ContentLicenseSource;
}>();

function shortName(key: string): string {
  return licenseDescriptor(key)?.shortName ?? key;
}

const ENTRY_LABELS = [
  { key: "monster_count", label: "monsters" },
  { key: "spell_count", label: "spells" },
  { key: "item_count", label: "items" },
  { key: "species_count", label: "species" },
  { key: "rule_count", label: "rules" },
  { key: "class_count", label: "classes" },
] as const;

const entryCounts = computed(() =>
  ENTRY_LABELS
    .map(({ key, label }) => ({ label, count: source[key] }))
    .filter((c) => c.count > 0),
);
</script>
