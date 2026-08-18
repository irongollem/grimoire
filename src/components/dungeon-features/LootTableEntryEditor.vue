<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between gap-2">
      <h2 class="font-cinzel text-sm font-bold text-foreground">Entries ({{ entries.length }})</h2>
      <div class="flex items-center gap-1.5">
        <AppButton
          variant="subtle"
          size="sm"
          class="bg-card px-2"
          :icon="IconAdd"
          label="Item"
          @click="emit('add', 'item')"
        />
        <AppButton
          variant="subtle"
          size="sm"
          class="bg-card px-2"
          :icon="IconAdd"
          label="Currency"
          @click="emit('add', 'currency')"
        />
        <AppButton
          variant="subtle"
          size="sm"
          class="bg-card px-2"
          :icon="IconAdd"
          label="Random"
          @click="emit('add', 'random')"
        />
      </div>
    </div>

    <p v-if="entriesError" class="text-caption text-destructive italic">
      {{ entriesError }}
    </p>

    <div v-if="!entries.length" class="rounded-md border border-dashed border-border px-4 py-8 text-center text-body text-muted-foreground italic">
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
          <div class="grid grid-cols-[1fr_5.625rem_7.5rem_auto] gap-2 items-center">
            <EntityCombobox
              :model-value="entry.item_id ?? ''"
              :options="itemOptions"
              placeholder="Pick an item from the Vault…"
              @update:model-value="onPickItem(entry, $event)"
            />
            <div class="flex items-center gap-1">
              <AppInput
                v-model.number="entry.drop_chance"
                type="number" min="1" max="100"
                tone="muted"
                size="xs"
                class="w-14 text-body text-right"
              />
              <span class="text-caption text-muted-foreground">%</span>
            </div>
            <input
              :value="entry.dice ?? ''"
              placeholder="2d4 or 3"
              class="w-full bg-muted border border-border rounded px-2 py-1 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              @input="(e) => onQuantityInput(entry, (e.target as HTMLInputElement).value)"
            />
            <AppButton variant="ghost" size="icon-xs" class="hover:text-destructive" :icon="IconDelete" @click="emit('remove', idx)" />
          </div>
        </template>

        <!-- ── Currency entry ───────────────────────────────────── -->
        <template v-else-if="entry.type === 'currency'">
          <div class="grid grid-cols-[1fr_5.625rem_auto] gap-2 items-center">
            <AppInput
              :model-value="entry.currency_label ?? ''"
              tone="muted"
              size="body"
              placeholder="Label (e.g. Belt pouch)"
              @update:model-value="(v) => { entry.currency_label = typeof v === 'number' ? String(v) : v; }"
            />
            <div class="flex items-center gap-1">
              <AppInput
                v-model.number="entry.drop_chance"
                type="number" min="1" max="100"
                tone="muted"
                size="xs"
                class="w-14 text-body text-right"
              />
              <span class="text-caption text-muted-foreground">%</span>
            </div>
            <AppButton variant="ghost" size="icon-xs" class="hover:text-destructive" :icon="IconDelete" @click="emit('remove', idx)" />
          </div>
          <!-- Coin amounts -->
          <div class="grid grid-cols-5 gap-1.5">
            <div v-for="coin in COINS" :key="coin.key" class="flex flex-col gap-0.5">
              <span class="text-eyebrow font-semibold text-muted-foreground text-center">{{ coin.symbol }}</span>
              <input
                :value="getCoinVal(entry, coin.key)"
                type="number" min="0"
                class="w-full bg-muted border border-border rounded px-1.5 py-1 text-body text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="0"
                @input="setCoinVal(entry, coin.key, ($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
        </template>

        <!-- ── Random-pick entry ───────────────────────────────── -->
        <template v-else-if="entry.type === 'random'">
          <div class="grid grid-cols-[1fr_5.625rem_7.5rem_auto] gap-2 items-center">
            <!-- Rarity + type filter -->
            <div class="flex gap-1.5">
              <AppSelect
                :model-value="entry.rarity ?? ''"
                size="sm"
                class="flex-1 min-w-0 bg-muted"
                @update:model-value="(v) => { entry.rarity = v; }"
              >
                <option value="">— rarity —</option>
                <option v-for="r in ITEM_RARITIES" :key="r" :value="r">{{ ITEM_RARITY_LABELS[r] }}</option>
              </AppSelect>
              <AppSelect
                :model-value="entry.item_type_filter ?? null"
                size="sm"
                class="flex-1 min-w-0 bg-muted"
                @update:model-value="(v) => { entry.item_type_filter = v; }"
              >
                <option :value="null">any type</option>
                <option v-for="t in ITEM_TYPES" :key="t" :value="t">{{ ITEM_TYPE_LABELS[t] }}</option>
              </AppSelect>
            </div>
            <!-- Drop chance -->
            <div class="flex items-center gap-1">
              <AppInput
                v-model.number="entry.drop_chance"
                type="number" min="1" max="100"
                tone="muted"
                size="xs"
                class="w-14 text-body text-right"
              />
              <span class="text-caption text-muted-foreground">%</span>
            </div>
            <!-- Qty -->
            <input
              :value="entry.dice ?? ''"
              placeholder="2d4 or 1"
              class="w-full bg-muted border border-border rounded px-2 py-1 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              @input="(e) => onQuantityInput(entry, (e.target as HTMLInputElement).value)"
            />
            <AppButton variant="ghost" size="icon-xs" class="hover:text-destructive" :icon="IconDelete" @click="emit('remove', idx)" />
          </div>
          <!-- Pool size hint — amber when empty, since the entry can only ever under-deliver -->
          <p
            class="text-caption-sm italic"
            :class="(randomPoolSizes.get(entry.id) ?? 0) === 0 ? 'text-amber-500' : 'text-muted-foreground'"
          >
            {{ randomPoolSizes.get(entry.id) ?? 0 }} matching item{{ randomPoolSizes.get(entry.id) === 1 ? '' : 's' }} in vault{{ (randomPoolSizes.get(entry.id) ?? 0) === 0 ? ' — this entry will drop nothing' : '' }}
          </p>
        </template>

        <!-- ── Notes row (all types) ────────────────────────────── -->
        <textarea
          v-if="entry.notes !== null && entry.notes !== undefined"
          v-model="entry.notes"
          rows="1"
          placeholder="Notes (optional)"
          class="w-full bg-muted border border-border rounded px-2 py-1 text-caption text-muted-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
        />
        <button
          v-else
          type="button"
          class="text-left text-caption-sm text-muted-foreground hover:text-foreground italic"
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
import { COINS, type CoinKey } from '@/rules/currency';
import {
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  ITEM_RARITIES,
  ITEM_RARITY_LABELS,
} from '@/types/item.types';
import type { LootEntry, LootEntryType } from '@/types/lootTable.types';
import AppButton from '@/components/common/AppButton.vue';
import AppInput from '@/components/common/AppInput.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import EntityCombobox from '@/components/common/EntityCombobox.vue';
import { useEnsureOwnedItem } from '@/composables/useItems';
import type { Item } from '@/types/item.types';

const { entries, itemOptions, entriesError, randomPoolSizes, resolveItem } = defineProps<{
  entries: LootEntry[];
  itemOptions: { id: string; name: string }[];
  entriesError: string | null;
  randomPoolSizes: Map<string, number>;
  /** Full item lookup — needed (beyond the display-only `itemOptions`) so a
   *  picked srd row can be cloned into an owned row before it enters `entries`. */
  resolveItem: (id: string) => Item | undefined;
}>();

const { ensureOwnedItem } = useEnsureOwnedItem();

/** Resolves the picked item to its owned (uuid) id BEFORE writing it into
 *  `entry.item_id`, so a table Save during the clone can never persist an srd
 *  slug into the `items` uuid FK column. Already-owned items resolve instantly
 *  (no round-trip), so only a freshly-cloned srd row shows a brief delay. */
async function onPickItem(entry: LootEntry, itemId: string) {
  if (!itemId) { entry.item_id = itemId; return; }
  const picked = resolveItem(itemId);
  if (!picked) { entry.item_id = itemId; return; }
  const owned = await ensureOwnedItem(picked);
  entry.item_id = owned.id;
}

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
