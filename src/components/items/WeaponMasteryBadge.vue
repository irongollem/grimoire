<template>
  <!-- Sheet-style block: label + full rules text, used on item detail pages. -->
  <div v-if="is2024 && def && variant === 'block'" class="mt-1 flex flex-col gap-0.5">
    <p class="font-stat text-sm font-bold text-foreground">
      Mastery: {{ def.label }}
    </p>
    <p class="font-stat text-sm text-muted-foreground">
      {{ def.description }}
    </p>
  </div>

  <!-- Stat-row style: label/value pair with the rules text as a tooltip, used
       in compact stat block summaries (e.g. ItemStatBlock). -->
  <div
    v-else-if="is2024 && def && variant === 'row'"
    class="flex justify-between gap-3"
    :title="def.description"
  >
    <span class="text-muted-foreground shrink-0">Mastery</span>
    <span class="text-right font-bold">{{ def.label }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { WEAPON_MASTERY_DEFINITIONS } from "@/data/weaponMastery";
import { useRuleset } from "@/composables/useRuleset";
import type { WeaponMasteryProperty } from "@/types/item.types";

/**
 * Shared weapon mastery display — label + rules text from
 * WEAPON_MASTERY_DEFINITIONS, gated to 2024 campaigns only (the gate is
 * internal, via useRuleset(), so callers don't need to re-check is2024).
 * Two layouts cover the sheet-style block (ItemSheet) and the compact
 * stat-row (ItemStatBlock) — pick with `variant`.
 */
const { mastery, variant = "block" } = defineProps<{
  mastery?: WeaponMasteryProperty | null;
  variant?: "block" | "row";
}>();

const { is2024 } = useRuleset();

const def = computed(() => (mastery ? WEAPON_MASTERY_DEFINITIONS[mastery] : null));
</script>
