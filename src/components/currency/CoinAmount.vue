<template>
  <span class="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-semibold" :class="size === 'sm' ? 'text-label-lg' : 'text-body'">
    <span
      v-for="part in parts"
      :key="part.denomination.key"
      :title="part.denomination.name"
      :style="{ color: part.denomination.color }"
    >{{ part.count }} {{ part.denomination.abbr }}</span>
    <span v-if="!parts.length" class="font-normal text-muted-foreground">{{ empty }}</span>
  </span>
</template>

<script setup lang="ts">
/**
 * A purse shown in the campaign's own coins (#934): highest value first, each
 * part tinted by its denomination's colour. Replaces the hand-rolled
 * "5 GP 3 SP" spans that each hard-coded the five D&D coins.
 */
import { computed } from "vue";
import { useCurrency } from "@/composables/currency/useCurrency";
import { coinParts, type Coins, type CurrencyConfig } from "@/lib/currency/currency";

const { coins, currency, size = "md", empty = "—" } = defineProps<{
  coins: Coins;
  /** Overrides the active campaign's currency. */
  currency?: CurrencyConfig;
  size?: "sm" | "md";
  /** Shown when the purse holds nothing. */
  empty?: string;
}>();

const active = useCurrency().currency;
const parts = computed(() => coinParts(coins, currency ?? active.value));
</script>
