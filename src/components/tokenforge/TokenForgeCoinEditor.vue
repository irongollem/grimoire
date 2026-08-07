<template>
  <div class="flex flex-col gap-5">

    <!-- Metal -->
    <div>
      <p class="text-label-lg font-semibold text-muted-foreground mb-2">Metal</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="m in COIN_METALS"
          :key="m.id"
          type="button"
          class="px-3 py-1.5 rounded-md text-label-lg font-semibold border transition-colors"
          :class="coin.metal === m.id
            ? 'bg-primary/15 text-primary border-primary/40'
            : 'text-muted-foreground border-border hover:border-foreground/30'"
          @click="emit('update:coin', { ...coin, metal: m.id })"
        >{{ m.label }}</button>
      </div>
    </div>

    <!-- Value -->
    <div>
      <label class="text-label-lg font-semibold text-muted-foreground mb-2 block">Centre Value</label>
      <AppInput
        :model-value="coin.value"
        size="lg"
        tone="muted"
        placeholder="e.g. 10"
        @update:model-value="emit('update:coin', { ...coin, value: $event as string })"
      />
    </div>

    <!-- Emblem / motif -->
    <div>
      <p class="text-label-lg font-semibold text-muted-foreground mb-2">Emblem</p>
      <div class="flex flex-wrap gap-2">
        <AppButton
          v-for="m in COIN_MOTIFS"
          :key="m.id"
          variant="subtle"
          size="sm"
          :active="coin.motif === m.id"
          :tooltip="m.label"
          @click="emit('update:coin', { ...coin, motif: m.id })"
        >
          <span v-if="m.symbol" class="text-base leading-none">{{ m.symbol }}</span>
          <span v-else class="text-label">None</span>
        </AppButton>
      </div>
    </div>

    <!-- Denomination -->
    <div>
      <label class="text-label-lg font-semibold text-muted-foreground mb-2 block">Denomination Label</label>
      <AppInput
        :model-value="coin.denomination"
        size="lg"
        tone="muted"
        placeholder="e.g. GP"
        @update:model-value="emit('update:coin', { ...coin, denomination: $event as string })"
      />
    </div>

    <!-- Rim text -->
    <div>
      <label class="text-label-lg font-semibold text-muted-foreground mb-2 block">Rim Text</label>
      <AppInput
        :model-value="coin.rimText"
        size="lg"
        tone="muted"
        placeholder="e.g. Kingdom of Arendor"
        @update:model-value="emit('update:coin', { ...coin, rimText: $event as string })"
      />
    </div>

    <!-- Print size -->
    <div>
      <p class="text-label-lg font-semibold text-muted-foreground mb-2">Print Size</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="ps in COIN_PRINT_SIZES"
          :key="ps.id"
          type="button"
          class="px-3 py-1.5 rounded-md text-label-lg font-semibold border transition-colors"
          :class="coin.printSize === ps.id
            ? 'bg-primary/15 text-primary border-primary/40'
            : 'text-muted-foreground border-border hover:border-foreground/30'"
          @click="emit('update:coin', { ...coin, printSize: ps.id })"
        >
          {{ ps.label }}
          <span class="ml-1 text-caption-sm font-normal opacity-60">~{{ ps.perSheet }}/sheet</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { COIN_METALS, COIN_MOTIFS, COIN_PRINT_SIZES } from "@/types/coin.types";
import type { CoinDesign } from "@/types/coin.types";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";

const { coin } = defineProps<{
  coin: CoinDesign;
}>();

const emit = defineEmits<{
  (e: 'update:coin', value: CoinDesign): void;
}>();
</script>
