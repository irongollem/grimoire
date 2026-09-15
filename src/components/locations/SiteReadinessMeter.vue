<template>
  <div class="flex flex-wrap items-center gap-1.5" role="img" :aria-label="ariaLabel">
    <span
      class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-2xs font-bold text-muted-foreground"
      aria-hidden="true"
    >1</span>
    <span class="font-cinzel text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Floor plan</span>

    <!-- Mapped links into the Layers panel (#884, S5) — the one pill among
         the five that names something the DM fixes by choosing a layer,
         which is exactly what that panel is for. The other four name a
         tracing/binding gap the map itself (not this meter) is where you'd
         go fix, so they stay plain facts. `AppButton tinted` rather than the
         other four pills' raw span: this one is genuinely interactive, and
         the primitives rule is what governs "a coloured pill whose colour
         means something" once it does something. -->
    <AppButton
      variant="tinted"
      :tone="readiness.mapped ? 'success' : 'caution'"
      emphasis="soft"
      size="xs"
      label="Mapped"
      @click="emit('open-map')"
    />

    <span
      v-for="pill in restPills"
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
 * own, so the meter and the Layers panel's own read of the stack never
 * disagree about the same site.
 */
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import type { SiteReadiness } from "@/lib/locations/siteReadiness";

const { readiness } = defineProps<{ readiness: SiteReadiness }>();

/** Emitted by the Mapped pill (#884, S5) — the caller enters Build and
 *  switches to Map mode, where the Layers panel lives. */
const emit = defineEmits<{ "open-map": [] }>();

const pills = computed(() => [
  { key: "mapped", label: "Mapped", ok: readiness.mapped },
  { key: "calibrated", label: "Calibrated", ok: readiness.calibrated },
  { key: "traced", label: "Traced", ok: readiness.traced },
  { key: "bound", label: "Bound", ok: readiness.bound },
  { key: "waysOut", label: "Ways out", ok: readiness.waysOut },
]);

/** Every pill except Mapped, which renders as its own interactive button
 *  above rather than in this loop. */
const restPills = computed(() => pills.value.filter((p) => p.key !== "mapped"));

const ariaLabel = computed(() => {
  const missing = pills.value.filter((p) => !p.ok).map((p) => p.label);
  if (!missing.length) return "Floor plan ready: mapped, calibrated, traced, bound, ways out";
  return `Floor plan missing: ${missing.join(", ")}${readiness.caption ? ` — ${readiness.caption}` : ""}`;
});
</script>
