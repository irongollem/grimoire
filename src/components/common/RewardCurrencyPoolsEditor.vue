<template>
  <div v-if="!embedded" class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-3 py-2 border-b border-border bg-muted/20">
      <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
        Loot Pools
        <span v-if="model.length" class="font-fell font-normal">({{ model.length }})</span>
      </span>
    </div>
    <div class="p-2 flex flex-col gap-2">
      <div
        v-for="pool in model"
        :key="pool.id"
        class="rounded border border-border bg-muted/10 px-2 py-2 flex flex-col gap-1.5"
      >
        <div class="flex items-center gap-2">
          <input
            :value="pool.label"
            type="text"
            placeholder="Label (e.g. Iron Chest)…"
            class="flex-1 bg-transparent border-b border-border px-1 py-0.5 font-fell text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
            @input="updatePool(pool.id, 'label', ($event.target as HTMLInputElement).value)"
          />
          <button
            type="button"
            :disabled="!hasCoins(pool)"
            :title="'Drop \'' + (pool.label || 'Pool') + '\' to chat'"
            class="shrink-0 inline-flex items-center gap-1 font-cinzel text-2xs font-semibold text-amber-400 hover:opacity-80 transition-opacity disabled:opacity-30 tracking-wider"
            @click="drop(pool)"
          >
            <IconCoins class="h-3 w-3" />
            Drop
          </button>
          <button
            type="button"
            class="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
            @click="remove(pool.id)"
          >
            <IconClose class="h-3.5 w-3.5" />
          </button>
        </div>
        <div class="grid grid-cols-5 gap-1.5">
          <div v-for="coin in COIN_TYPES" :key="coin.key" class="flex flex-col gap-0.5">
            <label class="font-cinzel text-[0.5625rem] font-semibold tracking-wider text-center" :style="{ color: coin.color }">
              {{ coin.label }}
            </label>
            <input
              :value="pool[coin.key as keyof typeof pool]"
              type="number"
              min="0"
              class="w-full text-center bg-card border border-border rounded px-1 py-0.5 font-fell text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              @input="updatePool(pool.id, coin.key, Number(($event.target as HTMLInputElement).value) || 0)"
            />
          </div>
        </div>
      </div>
      <button
        type="button"
        class="flex items-center gap-1.5 font-cinzel text-2xs font-semibold text-muted-foreground hover:text-primary transition-colors tracking-wider px-1 pt-1"
        @click="addPool"
      >
        <IconAdd class="h-3.5 w-3.5" />
        Add Loot Pool
      </button>
    </div>
  </div>

  <!-- Embedded mode: no card wrapper, renders pool list + add button inline -->
  <template v-else>
    <div
      v-for="pool in model"
      :key="pool.id"
      class="rounded border border-border bg-muted/10 px-2 py-2 flex flex-col gap-1.5"
    >
      <div class="flex items-center gap-2">
        <input
          :value="pool.label"
          type="text"
          placeholder="Label (e.g. Iron Chest)…"
          class="flex-1 bg-transparent border-b border-border px-1 py-0.5 font-fell text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
          @input="updatePool(pool.id, 'label', ($event.target as HTMLInputElement).value)"
        />
        <button
          type="button"
          :disabled="!hasCoins(pool)"
          :title="'Drop \'' + (pool.label || 'Pool') + '\' to chat'"
          class="shrink-0 inline-flex items-center gap-1 font-cinzel text-2xs font-semibold text-amber-400 hover:opacity-80 transition-opacity disabled:opacity-30 tracking-wider"
          @click="drop(pool)"
        >
          <IconCoins class="h-3 w-3" />
          Drop
        </button>
        <button
          type="button"
          class="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
          @click="remove(pool.id)"
        >
          <IconClose class="h-3.5 w-3.5" />
        </button>
      </div>
      <div class="grid grid-cols-5 gap-1.5">
        <div v-for="coin in COIN_TYPES" :key="coin.key" class="flex flex-col gap-0.5">
          <label class="font-cinzel text-[0.5625rem] font-semibold tracking-wider text-center" :style="{ color: coin.color }">
            {{ coin.label }}
          </label>
          <input
            :value="pool[coin.key as keyof typeof pool]"
            type="number"
            min="0"
            class="w-full text-center bg-card border border-border rounded px-1 py-0.5 font-fell text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @input="updatePool(pool.id, coin.key, Number(($event.target as HTMLInputElement).value) || 0)"
          />
        </div>
      </div>
    </div>
    <button
      type="button"
      class="flex items-center gap-1.5 font-cinzel text-2xs font-semibold text-muted-foreground hover:text-primary transition-colors tracking-wider px-1 pt-1"
      @click="addPool"
    >
      <IconAdd class="h-3.5 w-3.5" />
      Add Currency Pool
    </button>
  </template>
</template>

<script setup lang="ts">
import { IconAdd, IconClose, IconCoins } from '@/lib/icons';
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import type { RewardCurrencyPool } from "@/types/quest.types";

const model = defineModel<RewardCurrencyPool[]>({ required: true });
defineProps<{ embedded?: boolean }>();

const { sendCurrencyDrop } = useCampaignMessages();

const COIN_TYPES = [
  { key: "pp", label: "PP", color: "#a855f7" },
  { key: "gp", label: "GP", color: "#f59e0b" },
  { key: "ep", label: "EP", color: "#60a5fa" },
  { key: "sp", label: "SP", color: "#9ca3af" },
  { key: "cp", label: "CP", color: "#b45309" },
];

function hasCoins(pool: RewardCurrencyPool) {
  return pool.pp + pool.gp + pool.ep + pool.sp + pool.cp > 0;
}

function addPool() {
  model.value = [
    ...model.value,
    { id: crypto.randomUUID(), label: "", pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
  ];
}

function remove(id: string) {
  model.value = model.value.filter(p => p.id !== id);
}

function updatePool(id: string, key: string, value: string | number) {
  model.value = model.value.map(p =>
    p.id === id ? { ...p, [key]: value } : p
  );
}

async function drop(pool: RewardCurrencyPool) {
  await sendCurrencyDrop(pool.pp, pool.gp, pool.ep, pool.sp, pool.cp, pool.label || undefined);
}
</script>
