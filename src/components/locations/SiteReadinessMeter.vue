<template>
  <div class="flex flex-wrap items-center gap-1.5" role="img" :aria-label="ariaLabel">
    <span
      class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-2xs font-bold text-muted-foreground"
      aria-hidden="true"
    >1</span>
    <span class="font-cinzel text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Floor plan</span>

    <span
      v-for="pill in pills"
      :key="pill.key"
      class="rounded px-1.5 py-0.5 text-label"
      :class="pill.ok ? 'bg-tone-success/15 text-ink-success' : 'bg-tone-caution/15 text-ink-caution'"
    >
      {{ pill.label }}
    </span>

    <span v-if="readiness.caption" class="text-caption text-muted-foreground italic">{{ readiness.caption }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * "Floor plan" callout beside the scale rail (#868, frame 02) — five pills
 * that say what a site is missing before a session, not during one. The site
 * analogue of the Quest Board's gap chips: this reads `SiteReadiness`
 * (`lib/locations/siteReadiness.ts`) rather than deriving anything of its
 * own, so the meter and `SiteMapSourceStrip`'s staleness never disagree about
 * the same site.
 */
import { computed } from "vue";
import type { SiteReadiness } from "@/lib/locations/siteReadiness";

const { readiness } = defineProps<{ readiness: SiteReadiness }>();

const pills = computed(() => [
  { key: "mapped", label: "Mapped", ok: readiness.mapped },
  { key: "calibrated", label: "Calibrated", ok: readiness.calibrated },
  { key: "traced", label: "Traced", ok: readiness.traced },
  { key: "bound", label: "Bound", ok: readiness.bound },
  { key: "waysOut", label: "Ways out", ok: readiness.waysOut },
]);

const ariaLabel = computed(() => {
  const missing = pills.value.filter((p) => !p.ok).map((p) => p.label);
  if (!missing.length) return "Floor plan ready: mapped, calibrated, traced, bound, ways out";
  return `Floor plan missing: ${missing.join(", ")}${readiness.caption ? ` — ${readiness.caption}` : ""}`;
});
</script>
