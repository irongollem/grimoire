<template>
  <ul v-if="hazards.length" class="flex flex-col gap-1.5" aria-label="Weather hazards">
    <li
      v-for="h in hazards"
      :key="h.kind"
      :class="
        cn(
          'flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-caption',
          h.level === 'high' ? 'border-tone-caution/60 bg-tone-caution/15' : 'border-tone-caution/30 bg-tone-caution/5',
        )
      "
    >
      <IconWarning class="mt-0.5 h-3.5 w-3.5 shrink-0 text-tone-caution" aria-hidden="true" />
      <p class="min-w-0 text-foreground">
        <span class="font-semibold">{{ HAZARD_LABELS[h.kind] }} risk: {{ h.level }}</span>
        <span class="text-muted-foreground"> — {{ h.reason }}</span>
      </p>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { IconWarning } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { HAZARD_LABELS, type Hazard } from "@/lib/calendar/weatherHazards";

/**
 * What today's weather makes dangerous (#1086), as a quiet note: caution-toned
 * rather than red, one line per hazard, "high" a shade stronger than
 * "moderate". It names the cause so the table can see it is not arbitrary.
 */
defineProps<{ hazards: readonly Hazard[] }>();
</script>
