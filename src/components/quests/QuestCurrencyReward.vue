<template>
  <div class="flex flex-col gap-1.5 sm:col-span-2">
    <div class="flex items-center justify-between">
      <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
        Reward Currency
      </label>
      <button
        v-if="!isNew && hasAny"
        type="button"
        class="inline-flex items-center gap-1 font-cinzel text-[10px] font-semibold text-amber-400 hover:opacity-80 transition-opacity tracking-wider"
        @click="$emit('drop-to-chat')"
      >
        <IconCoins class="h-3 w-3" />
        Drop to Chat
      </button>
    </div>
    <div class="grid grid-cols-5 gap-2">
      <div
        v-for="coin in COIN_TYPES"
        :key="coin.key"
        class="flex flex-col gap-0.5"
      >
        <label
          class="font-cinzel text-[9px] font-semibold tracking-wider text-center"
          :style="{ color: coin.color }"
        >
          {{ coin.label }}
        </label>
        <input
          :value="coin.value"
          type="number"
          min="0"
          class="w-full text-center bg-card border border-border rounded px-1 py-1 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @input="coin.onInput($event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconCoins } from "@/lib/icons";

const props = defineProps<{
  pp: number;
  gp: number;
  ep: number;
  sp: number;
  cp: number;
  isNew?: boolean;
}>();

const emit = defineEmits<{
  "update:pp": [value: number];
  "update:gp": [value: number];
  "update:ep": [value: number];
  "update:sp": [value: number];
  "update:cp": [value: number];
  "drop-to-chat": [];
}>();

const hasAny = computed(
  () => props.pp || props.gp || props.ep || props.sp || props.cp,
);

function toNum(e: Event): number {
  return Number((e.target as HTMLInputElement).value) || 0;
}

const COIN_TYPES = [
  {
    key: "pp",
    label: "PP",
    color: "#a855f7",
    get value() { return props.pp; },
    onInput: (e: Event) => emit("update:pp", toNum(e)),
  },
  {
    key: "gp",
    label: "GP",
    color: "#f59e0b",
    get value() { return props.gp; },
    onInput: (e: Event) => emit("update:gp", toNum(e)),
  },
  {
    key: "ep",
    label: "EP",
    color: "#60a5fa",
    get value() { return props.ep; },
    onInput: (e: Event) => emit("update:ep", toNum(e)),
  },
  {
    key: "sp",
    label: "SP",
    color: "#9ca3af",
    get value() { return props.sp; },
    onInput: (e: Event) => emit("update:sp", toNum(e)),
  },
  {
    key: "cp",
    label: "CP",
    color: "#b45309",
    get value() { return props.cp; },
    onInput: (e: Event) => emit("update:cp", toNum(e)),
  },
] as const;
</script>
