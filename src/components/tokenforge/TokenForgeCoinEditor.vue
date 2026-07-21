<template>
  <div class="flex flex-col gap-5">

    <!-- Metal -->
    <div>
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">Metal</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="m in COIN_METALS"
          :key="m.id"
          type="button"
          class="px-3 py-1.5 rounded-md font-cinzel text-[0.6875rem] font-semibold tracking-wider border transition-colors"
          :class="coin.metal === m.id
            ? 'bg-primary/15 text-primary border-primary/40'
            : 'text-muted-foreground border-border hover:border-foreground/30'"
          @click="emit('update:coin', { ...coin, metal: m.id })"
        >{{ m.label }}</button>
      </div>
    </div>

    <!-- Value -->
    <div>
      <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2 block">Centre Value</label>
      <input
        :value="coin.value"
        placeholder="e.g. 10"
        class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-cinzel text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="emit('update:coin', { ...coin, value: ($event.target as HTMLInputElement).value })"
      />
    </div>

    <!-- Emblem / motif -->
    <div>
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">Emblem</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="m in COIN_MOTIFS"
          :key="m.id"
          type="button"
          :title="m.label"
          class="h-8 min-w-8 px-2 rounded-md font-cinzel text-sm border transition-colors flex items-center justify-center"
          :class="coin.motif === m.id
            ? 'bg-primary/15 text-primary border-primary/40'
            : 'text-muted-foreground border-border hover:border-foreground/30'"
          @click="emit('update:coin', { ...coin, motif: m.id })"
        >
          <span v-if="m.symbol" class="text-base leading-none">{{ m.symbol }}</span>
          <span v-else class="font-cinzel text-2xs tracking-wider">None</span>
        </button>
      </div>
    </div>

    <!-- Denomination -->
    <div>
      <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2 block">Denomination Label</label>
      <input
        :value="coin.denomination"
        placeholder="e.g. GP"
        class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-cinzel text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="emit('update:coin', { ...coin, denomination: ($event.target as HTMLInputElement).value })"
      />
    </div>

    <!-- Rim text -->
    <div>
      <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2 block">Rim Text</label>
      <input
        :value="coin.rimText"
        placeholder="e.g. Kingdom of Arendor"
        class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-cinzel text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="emit('update:coin', { ...coin, rimText: ($event.target as HTMLInputElement).value })"
      />
    </div>

    <!-- Print size -->
    <div>
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">Print Size</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="ps in COIN_PRINT_SIZES"
          :key="ps.id"
          type="button"
          class="px-3 py-1.5 rounded-md font-cinzel text-[0.6875rem] font-semibold tracking-wider border transition-colors"
          :class="coin.printSize === ps.id
            ? 'bg-primary/15 text-primary border-primary/40'
            : 'text-muted-foreground border-border hover:border-foreground/30'"
          @click="emit('update:coin', { ...coin, printSize: ps.id })"
        >
          {{ ps.label }}
          <span class="ml-1 font-fell font-normal text-2xs opacity-60">~{{ ps.perSheet }}/sheet</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { COIN_METALS, COIN_MOTIFS, COIN_PRINT_SIZES } from "@/types/coin.types";
import type { CoinDesign } from "@/types/coin.types";

const { coin } = defineProps<{
  coin: CoinDesign;
}>();

const emit = defineEmits<{
  (e: 'update:coin', value: CoinDesign): void;
}>();
</script>
