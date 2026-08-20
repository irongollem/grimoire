<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-3 py-2 border-b border-border bg-muted/20">
      <span class="text-label-lg font-semibold text-muted-foreground">
        Loot
        <span v-if="totalCount" class="font-fell font-normal">({{ totalCount }})</span>
      </span>
    </div>
    <div class="p-2 flex flex-col gap-1">
      <!-- Empty state -->
      <p v-if="!totalCount" class="text-caption text-muted-foreground italic px-2 py-1">
        No loot added yet.
      </p>

      <!-- Linked items (grouped with qty) -->
      <div
        v-for="{ item, qty } in linkedItemGroups"
        :key="item.id"
        class="flex items-center gap-2 group rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
      >
        <IconPackage class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <AppButton
          :to="`/vault/${item.id}`"
          variant="ghost"
          tone="primary"
          size="inline-body"
          class="flex-1 justify-start text-left text-foreground truncate"
          :label="item.name"
        />

        <!-- Qty controls -->
        <div class="flex items-center gap-1 shrink-0">
          <AppButton variant="ghost" fill="muted" size="icon-xs" :icon="IconMinus" icon-size="xs" aria-label="Decrease quantity" @click="decrementItem(item.id)" />
          <span class="font-cinzel text-xs font-bold text-foreground w-5 text-center">{{ qty }}</span>
          <AppButton variant="ghost" fill="muted" size="icon-xs" :icon="IconAdd" icon-size="xs" aria-label="Increase quantity" @click="incrementItem(item.id)" />
        </div>

        <AppButton
          variant="ghost"
          size="icon-xs"
          :icon="IconLoot"
          tooltip="Drop to chat"
          class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          @click="emit('drop-item', { item, qty })"
        />
        <AppButton
          variant="ghost"
          tone="danger"
          size="icon-xs"
          :icon="IconClose"
          tooltip="Remove all"
          class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          @click="removeAllOfItem(item.id)"
        />
      </div>

      <!-- Currency pools -->
      <div
        v-for="pool in currencyPools"
        :key="pool.id"
        class="rounded border border-border bg-muted/10 px-2 py-2 flex flex-col gap-1.5"
      >
        <div class="flex items-center gap-2">
          <AppInput
            :model-value="pool.label"
            tone="underline"
            size="caption"
            :block="false"
            class="flex-1"
            placeholder="Label (e.g. Iron Chest)…"
            @update:model-value="(v) => updatePool(pool.id, 'label', v)"
          />
          <AppButton
            variant="link"
            tone="caution"
            size="inline-xs"
            :icon="IconCoins"
            icon-size="xs"
            label="Drop"
            class="shrink-0"
            :disabled="!hasCoins(pool)"
            :tooltip="`Drop '${pool.label || 'Pool'}' to chat`"
            @click="emit('drop-pool', pool)"
          />
          <AppButton
            variant="ghost"
            tone="danger"
            size="icon-xs"
            :icon="IconClose"
            class="shrink-0"
            aria-label="Remove pool"
            @click="removePool(pool.id)"
          />
        </div>
        <div class="grid grid-cols-5 gap-1.5">
          <div v-for="coin in COIN_TYPES" :key="coin.key" class="flex flex-col gap-0.5">
            <label
              class="text-label font-semibold text-center"
              :style="{ color: coin.color }"
            >{{ coin.label }}</label>
            <AppInput
              :model-value="pool[coin.key as keyof typeof pool]"
              type="number"
              min="0"
              tone="card"
              size="caption"
              align="center"
              @update:model-value="updatePool(pool.id, coin.key, Number($event) || 0)"
            />
          </div>
        </div>
      </div>

      <!-- Add controls -->
      <div
        class="flex flex-col gap-1.5"
        :class="totalCount ? 'border-t border-border/50 pt-2 mt-1' : 'pt-1'"
      >
        <!-- Add item -->
        <div v-if="allItems.length" class="flex items-center gap-2">
          <EntityCombobox
            v-model="selectedItemId"
            :options="allItems"
            placeholder="Add loot item…"
          />
          <AppButton
            variant="ghost"
            tone="primary"
            size="inline"
            :icon="IconAdd"
            icon-size="md"
            :disabled="!selectedItemId"
            aria-label="Add loot item"
            class="shrink-0"
            @click="addItem"
          />
        </div>
        <!-- Add currency pool -->
        <AppButton
          variant="subtle"
          size="md"
          block
          :icon="IconAdd"
          label="Add currency pool"
          class="justify-start gap-2 text-body"
          @click="addPool"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import AppInput from "@/components/common/AppInput.vue";
import { IconAdd, IconClose, IconCoins, IconLoot, IconMinus, IconPackage } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useEnsureOwnedItem } from "@/composables/useItems";
import type { Item } from "@/types/item.types";
import type { RewardCurrencyPool } from "@/types/quest.types";

const itemIds = defineModel<string[]>("itemIds", { required: true });
const currencyPools = defineModel<RewardCurrencyPool[]>("currencyPools", { required: true });
const props = defineProps<{
  allItems: Item[];
}>();

const emit = defineEmits<{
  "drop-pool": [pool: RewardCurrencyPool];
  "drop-item": [payload: { item: Item; qty: number }];
}>();

const COIN_TYPES = [
  { key: "pp", label: "PP", color: "#a855f7" },
  { key: "gp", label: "GP", color: "#f59e0b" },
  { key: "ep", label: "EP", color: "#60a5fa" },
  { key: "sp", label: "SP", color: "#9ca3af" },
  { key: "cp", label: "CP", color: "#b45309" },
];

const itemCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const id of itemIds.value) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
});

const linkedItemGroups = computed(() => {
  const seen = new Set<string>();
  const groups: { item: Item; qty: number }[] = [];
  for (const id of itemIds.value) {
    if (seen.has(id)) continue;
    seen.add(id);
    const item = props.allItems.find((i) => i.id === id);
    if (item) groups.push({ item, qty: itemCounts.value.get(id) ?? 1 });
  }
  return groups;
});

const totalCount = computed(() => linkedItemGroups.value.length + currencyPools.value.length);

const selectedItemId = ref("");
const { ensureOwnedItem } = useEnsureOwnedItem();

async function addItem() {
  if (!selectedItemId.value) return;
  const picked = props.allItems.find((i) => i.id === selectedItemId.value);
  if (!picked) return;
  selectedItemId.value = "";
  // reward_item_ids / encounter.item_ids are hard uuid[] columns — an srd slug
  // must become an owned row before it enters the array, not at save time.
  const owned = await ensureOwnedItem(picked);
  itemIds.value = [...itemIds.value, owned.id];
}

function incrementItem(id: string) {
  itemIds.value = [...itemIds.value, id];
}

function decrementItem(id: string) {
  const idx = [...itemIds.value].lastIndexOf(id);
  if (idx === -1) return;
  const next = [...itemIds.value];
  next.splice(idx, 1);
  itemIds.value = next;
}

function removeAllOfItem(id: string) {
  itemIds.value = itemIds.value.filter((i) => i !== id);
}

function addPool() {
  currencyPools.value = [
    ...currencyPools.value,
    { id: crypto.randomUUID(), label: "", pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
  ];
}

function removePool(id: string) {
  currencyPools.value = currencyPools.value.filter((p) => p.id !== id);
}

function updatePool(id: string, key: string, value: string | number) {
  currencyPools.value = currencyPools.value.map((p) => (p.id === id ? { ...p, [key]: value } : p));
}

function hasCoins(pool: RewardCurrencyPool) {
  return pool.pp + pool.gp + pool.ep + pool.sp + pool.cp > 0;
}

</script>
