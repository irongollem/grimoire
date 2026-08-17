<template>
  <!--
    The scale rail.

    An atlas is fundamentally about zoom, and the 17 location types are a ladder
    of scales rather than a flat set of kinds. This rail makes that ladder the
    one persistent piece of furniture on the page: it says how far down you are
    standing, and — by dimming rungs nothing occupies — where a world thins out.

    It is deliberately quiet. Everything else in the pane is restrained so this
    reads as the page's signature rather than competing with it.
  -->
  <div class="flex items-end gap-0.5" role="img" :aria-label="ariaLabel">
    <div v-for="rung in rungs" :key="rung.tier" class="flex-1 min-w-0">
      <!-- The current rung is taller as well as fuller: in a world that occupies
           every tier, opacity alone leaves the rail reading as a rainbow bar. -->
      <div
        class="rounded-full transition-all"
        :class="[rung.current ? 'h-1.5' : 'h-1', rung.lit ? undefined : 'bg-border']"
        :style="
          rung.lit ? { backgroundColor: rung.color, opacity: rung.current ? 1 : 0.35 } : undefined
        "
      />
      <p
        class="mt-1 truncate text-center text-caption-sm transition-colors"
        :class="
          rung.current
            ? 'text-foreground font-semibold'
            : rung.occupied
              ? 'text-muted-foreground'
              : 'text-muted-foreground/40'
        "
      >
        {{ rung.label }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  LOCATION_TIERS,
  TIER_COLORS,
  TIER_RUNG_LABELS,
  tierOf,
} from "@/lib/locations/tiers";
import type { LocationTier } from "@/lib/locations/tiers";
import type { LocationType } from "@/types/location.types";

const { currentType, occupied } = defineProps<{
  /** The selected place's type; its rung is the lit one. */
  currentType: LocationType;
  /** Tiers present beneath the selection — shown at half strength. */
  occupied: ReadonlySet<LocationTier>;
}>();

const currentTier = computed(() => tierOf(currentType));

const rungs = computed(() =>
  LOCATION_TIERS.map((tier) => {
    const current = tier === currentTier.value;
    const isOccupied = occupied.has(tier);
    return {
      tier,
      label: TIER_RUNG_LABELS[tier],
      color: TIER_COLORS[tier],
      current,
      occupied: isOccupied,
      lit: current || isOccupied,
    };
  }),
);

const ariaLabel = computed(() => {
  const here = currentTier.value ? TIER_RUNG_LABELS[currentTier.value] : "unplaced";
  const below = [...occupied].map((t) => TIER_RUNG_LABELS[t]);
  return below.length
    ? `Scale: ${here}. Contains ${below.join(", ")}.`
    : `Scale: ${here}. Nothing inside yet.`;
});
</script>
