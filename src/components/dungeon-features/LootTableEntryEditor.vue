<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between gap-2">
      <h2 class="font-cinzel text-sm font-bold text-foreground">Entries ({{ entries.length }})</h2>
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 font-cinzel text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          @click="emit('add', 'item')"
        >
          <IconAdd class="size-3" />Item
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 font-cinzel text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          @click="emit('add', 'currency')"
        >
          <IconAdd class="size-3" />Currency
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 font-cinzel text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          @click="emit('add', 'random')"
        >
          <IconAdd class="size-3" />Random
        </button>
      </div>
    </div>

    <p v-if="entriesError" class="font-fell text-xs text-destructive italic">
      {{ entriesError }}
    </p>

    <div v-if="!entries.length" class="rounded-md border border-dashed border-border px-4 py-8 text-center font-fell text-sm text-muted-foreground italic">
      No entries yet. Add items, currency pools, or art objects — each gets its own drop chance.
    </div>

    <div v-else class="flex flex-col gap-2">
      <div
        v-for="(entry, idx) in entries"
        :key="entry.id"
        class="rounded-md border border-border bg-card p-2 flex flex-col gap-1.5"
      >
        <!-- ── Item entry ───────────────────────────────────────── -->
        <template v-if="(entry.type ?? 'item') === 'item'">
          <div class="grid grid-cols-[1fr_90px_120px_auto] gap-2 items-center">
            <EntityCombobox
              :model-value="entry.item_id ?? ''"
              :options="itemOptions"
              placeholder="Pick an item from the Vault…"
              @update:model-value="entry.item_id = $event"
            />
            <div class="flex items-center gap-1">
              <input
                v-model.number="entry.drop_chance"
                type="number" min="1" max="100"
                class="w-14 bg-muted border border-border rounded px-1.5 py-1 font-fell text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span class="font-fell text-xs text-muted-foreground">%</span>
            </div>
            <input
              :value="entry.dice ?? ''"
              placeholder="2d4 or 3"
              class="w-full bg-muted border border-border rounded px-2 py-1 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              @input="(e) => onQuantityInput(entry, (e.target as HTMLInputElement).value)"
            />
            <button type="button" class="text-muted-foreground hover:text-destructive transition-colors p-1" @click="emit('remove', idx)">
              <IconDelete class="size-3.5" />
            </button>
          </div>
        </template>

        <!-- ── Currency entry ───────────────────────────────────── -->
        <template v-else-if="entry.type === 'currency'">
          <div class="grid grid-cols-[1fr_90px_auto] gap-2 items-center">
            <input
              v-model="entry.currency_label"
              placeholder="Label (e.g. Belt pouch)"
              class="w-full bg-muted border border-border rounded px-2 py-1 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div class="flex items-center gap-1">
              <input
                v-model.number="entry.drop_chance"
                type="number" min="1" max="100"
                class="w-14 bg-muted border border-border rounded px-1.5 py-1 font-fell text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span class="font-fell text-xs text-muted-foreground">%</span>
            </div>
            <button type="button" class="text-muted-foreground hover:text-destructive transition-colors p-1" @click="emit('remove', idx)">
              <IconDelete class="size-3.5" />
            </button>
          </div>
          <!-- Coin amounts -->
          <div class="grid grid-cols-5 gap-1.5">
            <div v-for="coin in COINS" :key="coin.key" class="flex flex-col gap-0.5">
              <span class="font-cinzel text-[9px] font-semibold tracking-wider text-muted-foreground uppercase text-center">{{ coin.symbol }}</span>
              <input
                :value="getCoinVal(entry, coin.key)"
                type="number" min="0"
                class="w-full bg-muted border border-border rounded px-1.5 py-1 font-fell text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="0"
                @input="setCoinVal(entry, coin.key, ($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
        </template>

        <!-- ── Random-pick entry ───────────────────────────────── -->
        <template v-else-if="entry.type === 'random'">
          <div class="grid grid-cols-[1fr_90px_120px_auto] gap-2 items-center">
            <!-- Rarity + type filter -->
            <div class="flex gap-1.5">
              <select
                v-model="entry.rarity"
                class="flex-1 min-w-0 bg-muted border border-border rounded px-2 py-1 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">— rarity —</option>
                <option v-for="r in ITEM_RARITIES" :key="r" :value="r">{{ ITEM_RARITY_LABELS[r] }}</option>
              </select>
              <select
                v-model="entry.item_type_filter"
                class="flex-1 min-w-0 bg-muted border border-border rounded px-2 py-1 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option :value="null">any type</option>
                <option v-for="t in ITEM_TYPES" :key="t" :value="t">{{ ITEM_TYPE_LABELS[t] }}</option>
              </select>
            </div>
            <!-- Drop chance -->
            <div class="flex items-center gap-1">
              <input
                v-model.number="entry.drop_chance"
                type="number" min="1" max="100"
                class="w-14 bg-muted border border-border rounded px-1.5 py-1 font-fell text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span class="font-fell text-xs text-muted-foreground">%</span>
            </div>
            <!-- Qty -->
            <input
              :value="entry.dice ?? ''"
              placeholder="2d4 or 1"
              class="w-full bg-muted border border-border rounded px-2 py-1 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              @input="(e) => onQuantityInput(entry, (e.target as HTMLInputElement).value)"
            />
            <button type="button" class="text-muted-foreground hover:text-destructive transition-colors p-1" @click="emit('remove', idx)">
              <IconDelete class="size-3.5" />
            </button>
          </div>
          <!-- Pool size hint -->
          <p class="font-fell text-[10px] text-muted-foreground italic">
            {{ randomPoolSizes.get(entry.id) ?? 0 }} matching item{{ randomPoolSizes.get(entry.id) === 1 ? '' : 's' }} in vault
          </p>
        </template>

        <!-- ── Notes row (all types) ────────────────────────────── -->
        <textarea
          v-if="entry.notes !== null && entry.notes !== undefined"
          v-model="entry.notes"
          rows="1"
          placeholder="Notes (optional)"
          class="w-full bg-muted border border-border rounded px-2 py-1 font-fell text-xs text-muted-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
        />
        <button
          v-else
          type="button"
          class="text-left font-fell text-[10px] text-muted-foreground hover:text-foreground italic"
          @click="entry.notes = ''"
        >
          + add note
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconAdd, IconDelete } from '@/lib/icons';
import { COINS, type CoinKey } from '@/lib/currency';
import {
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  ITEM_RARITIES,
  ITEM_RARITY_LABELS,
} from '@/types/item.types';
import type { LootEntry, LootEntryType } from '@/types/lootTable.types';
import EntityCombobox from '@/components/common/EntityCombobox.vue';

const { entries, itemOptions, entriesError, randomPoolSizes } = defineProps<{
  entries: LootEntry[];
  itemOptions: { id: string; name: string }[];
  entriesError: string | null;
  randomPoolSizes: Map<string, number>;
}>();

const emit = defineEmits<{
  add: [type: LootEntryType];
  remove: [idx: number];
}>();

function getCoinVal(entry: LootEntry, key: CoinKey): number {
  return (entry as Record<CoinKey, number | undefined>)[key] ?? 0;
}
function setCoinVal(entry: LootEntry, key: CoinKey, raw: string) {
  const n = parseInt(raw, 10);
  (entry as Record<CoinKey, number | undefined>)[key] = Number.isFinite(n) ? Math.max(0, n) : 0;
}

function onQuantityInput(entry: LootEntry, raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    entry.dice = null;
    return;
  }
  const n = Number(trimmed);
  if (Number.isInteger(n) && n >= 0 && /^\d+$/.test(trimmed)) {
    entry.fixed_qty = n;
    entry.dice = null;
  } else {
    entry.dice = trimmed;
  }
}
</script>
