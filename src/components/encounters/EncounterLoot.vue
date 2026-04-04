<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-3 py-2 border-b border-border bg-muted/20">
      <span
        class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
      >
        Loot
        <span v-if="totalCount" class="font-fell font-normal"
          >({{ totalCount }})</span
        >
      </span>
    </div>
    <div class="p-2 flex flex-col gap-1">
      <!-- Empty state -->
      <p
        v-if="!totalCount"
        class="font-fell text-xs text-muted-foreground italic px-2 py-1"
      >
        No loot added yet.
      </p>

      <!-- Linked items (grouped with qty) -->
      <div
        v-for="{ item, qty } in linkedItemGroups"
        :key="item.id"
        class="flex items-center gap-2 group rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
      >
        <Package class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <RouterLink
          :to="`/vault/${item.id}`"
          class="font-fell text-sm text-foreground flex-1 truncate hover:text-primary transition-colors"
          >{{ item.name }}</RouterLink
        >

        <!-- Qty controls -->
        <div class="flex items-center gap-1 shrink-0">
          <button
            type="button"
            class="w-5 h-5 rounded bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            @click="decrementItem(item.id)"
          >
            <Minus class="h-3 w-3" />
          </button>
          <span
            class="font-cinzel text-xs font-bold text-foreground w-5 text-center"
            >{{ qty }}</span
          >
          <button
            type="button"
            class="w-5 h-5 rounded bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            @click="incrementItem(item.id)"
          >
            <Plus class="h-3 w-3" />
          </button>
        </div>

        <button
          type="button"
          class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
          title="Drop to chat"
          @click="emit('drop-item', { item, qty })"
        >
          <Gift class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
          title="Remove all"
          @click="removeAllOfItem(item.id)"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </div>

      <!-- Currency pools -->
      <div
        v-for="pool in currencyPools"
        :key="pool.id"
        class="rounded border border-border bg-muted/10 px-2 py-2 flex flex-col gap-1.5"
      >
        <div class="flex items-center gap-2">
          <input
            :value="pool.label"
            type="text"
            placeholder="Label (e.g. Iron Chest)…"
            class="flex-1 bg-transparent border-b border-border px-1 py-0.5 font-fell text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
            @input="
              updatePool(
                pool.id,
                'label',
                ($event.target as HTMLInputElement).value,
              )
            "
          />
          <button
            type="button"
            :disabled="!hasCoins(pool)"
            :title="'Drop \'' + (pool.label || 'Pool') + '\' to chat'"
            class="shrink-0 inline-flex items-center gap-1 font-cinzel text-[10px] font-semibold text-amber-400 hover:opacity-80 transition-opacity disabled:opacity-30 tracking-wider"
            @click="emit('drop-pool', pool)"
          >
            <Coins class="h-3 w-3" />
            Drop
          </button>
          <button
            type="button"
            class="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
            @click="removePool(pool.id)"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
        <div class="grid grid-cols-5 gap-1.5">
          <div
            v-for="coin in COIN_TYPES"
            :key="coin.key"
            class="flex flex-col gap-0.5"
          >
            <label
              class="font-cinzel text-[9px] font-semibold tracking-wider text-center"
              :style="{ color: coin.color }"
              >{{ coin.label }}</label
            >
            <input
              :value="pool[coin.key as keyof typeof pool]"
              type="number"
              min="0"
              class="w-full text-center bg-card border border-border rounded px-1 py-0.5 font-fell text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              @input="
                updatePool(
                  pool.id,
                  coin.key,
                  Number(($event.target as HTMLInputElement).value) || 0,
                )
              "
            />
          </div>
        </div>
      </div>

      <!-- Art objects -->
      <div
        v-for="obj in artObjects"
        :key="obj.id"
        class="rounded border border-border bg-muted/10 overflow-hidden"
      >
        <!-- Collapsed row -->
        <div
          v-if="expandedArtObject !== obj.id"
          class="flex items-center gap-2 group px-2 py-1.5 hover:bg-muted/40 transition-colors cursor-pointer"
          @click="expandedArtObject = obj.id"
        >
          <Gem class="h-3.5 w-3.5 text-purple-400 shrink-0" />
          <img
            v-if="obj.image_url"
            :src="obj.image_url"
            alt=""
            class="h-6 w-6 rounded object-cover shrink-0"
          />
          <span class="font-fell text-sm text-foreground flex-1 truncate">{{
            obj.name || "Unnamed art object"
          }}</span>
          <span class="font-cinzel text-[10px] text-amber-400 shrink-0"
            >{{ obj.value_gp }} gp</span
          >
          <button
            type="button"
            class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
            title="Drop to chat"
            @click.stop="emit('drop-art-object', obj)"
          >
            <Gift class="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
            title="Remove"
            @click.stop="removeArtObject(obj.id)"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>

        <!-- Expanded edit form -->
        <div v-else class="p-2 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span
              class="font-cinzel text-[10px] text-purple-400 tracking-wider font-semibold"
              >Art Object</span
            >
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground transition-colors"
              @click="expandedArtObject = null"
            >
              <ChevronUp class="h-3.5 w-3.5" />
            </button>
          </div>
          <!-- Image upload -->
          <div class="flex gap-2 items-start">
            <div class="w-20 shrink-0">
              <ImageUpload
                :model-value="obj.image_url"
                bucket="asset-images"
                aspect="square"
                placeholder="Art image"
                @update:model-value="
                  updateArtObject(obj.id, 'image_url', $event)
                "
              />
            </div>
            <div class="flex-1 flex flex-col gap-1.5">
              <input
                :value="obj.name"
                type="text"
                placeholder="Name…"
                class="w-full bg-transparent border-b border-border px-1 py-0.5 font-fell text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
                @input="
                  updateArtObject(
                    obj.id,
                    'name',
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
              <div class="flex items-center gap-1.5">
                <span
                  class="font-cinzel text-[9px] text-muted-foreground tracking-wider"
                  >GP</span
                >
                <input
                  :value="obj.value_gp"
                  type="number"
                  min="0"
                  class="w-24 bg-card border border-border rounded px-1.5 py-0.5 font-fell text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  @input="
                    updateArtObject(
                      obj.id,
                      'value_gp',
                      Number(($event.target as HTMLInputElement).value) || 0,
                    )
                  "
                />
              </div>
            </div>
          </div>
          <!-- Description -->
          <textarea
            :value="obj.description ?? ''"
            rows="2"
            placeholder="Description (optional)…"
            class="w-full resize-none bg-transparent border border-border rounded px-2 py-1 font-fell text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
            @input="
              updateArtObject(
                obj.id,
                'description',
                ($event.target as HTMLTextAreaElement).value || null,
              )
            "
          />
          <div class="flex gap-2 pt-0.5">
            <button
              type="button"
              class="inline-flex items-center gap-1 font-cinzel text-[10px] tracking-wider text-amber-400 hover:opacity-80 transition-opacity"
              @click="
                emit('drop-art-object', obj);
                expandedArtObject = null;
              "
            >
              <Gift class="h-3 w-3" />
              Drop to chat
            </button>
            <button
              type="button"
              class="ml-auto font-cinzel text-[10px] tracking-wider text-destructive hover:opacity-80 transition-opacity"
              @click="
                removeArtObject(obj.id);
                expandedArtObject = null;
              "
            >
              Remove
            </button>
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
          <button
            type="button"
            :disabled="!selectedItemId"
            class="text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 shrink-0"
            @click="addItem"
          >
            <Plus class="h-4 w-4" />
          </button>
        </div>
        <!-- Add art object -->
        <button
          type="button"
          class="w-full flex items-center gap-2 rounded-md border border-border px-3 py-2 font-fell text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
          @click="addArtObject"
        >
          <Plus class="h-3.5 w-3.5 shrink-0" />
          Add art object
        </button>
        <!-- Add currency pool -->
        <button
          type="button"
          class="w-full flex items-center gap-2 rounded-md border border-border px-3 py-2 font-fell text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
          @click="addPool"
        >
          <Plus class="h-3.5 w-3.5 shrink-0" />
          Add currency pool
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import {
  Package,
  X,
  Plus,
  Minus,
  Coins,
  Gift,
  Gem,
  ChevronUp,
} from "lucide-vue-next";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import ImageUpload from "@/components/common/ImageUpload.vue";
import type { Item } from "@/types/item.types";
import type { RewardCurrencyPool } from "@/types/quest.types";
import type { ArtObject } from "@/types/encounter.types";

const props = withDefaults(
  defineProps<{
    itemIds: string[];
    allItems: Item[];
    currencyPools: RewardCurrencyPool[];
    artObjects?: ArtObject[];
  }>(),
  {
    artObjects: () => [],
  },
);

const emit = defineEmits<{
  "update:itemIds": [v: string[]];
  "update:currencyPools": [v: RewardCurrencyPool[]];
  "update:artObjects": [v: ArtObject[]];
  "drop-pool": [pool: RewardCurrencyPool];
  "drop-item": [payload: { item: Item; qty: number }];
  "drop-art-object": [obj: ArtObject];
}>();

const expandedArtObject = ref<string | null>(null);

const COIN_TYPES = [
  { key: "pp", label: "PP", color: "#a855f7" },
  { key: "gp", label: "GP", color: "#f59e0b" },
  { key: "ep", label: "EP", color: "#60a5fa" },
  { key: "sp", label: "SP", color: "#9ca3af" },
  { key: "cp", label: "CP", color: "#b45309" },
];

// Count occurrences of each item_id to support multiple of the same item
const itemCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const id of props.itemIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
});

const linkedItemGroups = computed(() => {
  const seen = new Set<string>();
  const groups: { item: Item; qty: number }[] = [];
  for (const id of props.itemIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const item = props.allItems.find((i) => i.id === id);
    if (item) groups.push({ item, qty: itemCounts.value.get(id) ?? 1 });
  }
  return groups;
});

const totalCount = computed(
  () =>
    linkedItemGroups.value.length +
    props.currencyPools.length +
    props.artObjects.length,
);

const selectedItemId = ref("");

function addItem() {
  if (!selectedItemId.value) return;
  emit("update:itemIds", [...props.itemIds, selectedItemId.value]);
  selectedItemId.value = "";
}

function incrementItem(id: string) {
  emit("update:itemIds", [...props.itemIds, id]);
}

function decrementItem(id: string) {
  const idx = [...props.itemIds].lastIndexOf(id);
  if (idx === -1) return;
  const next = [...props.itemIds];
  next.splice(idx, 1);
  emit("update:itemIds", next);
}

function removeAllOfItem(id: string) {
  emit(
    "update:itemIds",
    props.itemIds.filter((i) => i !== id),
  );
}

function addPool() {
  emit("update:currencyPools", [
    ...props.currencyPools,
    { id: crypto.randomUUID(), label: "", pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
  ]);
}

function removePool(id: string) {
  emit(
    "update:currencyPools",
    props.currencyPools.filter((p) => p.id !== id),
  );
}

function updatePool(id: string, key: string, value: string | number) {
  emit(
    "update:currencyPools",
    props.currencyPools.map((p) => (p.id === id ? { ...p, [key]: value } : p)),
  );
}

function hasCoins(pool: RewardCurrencyPool) {
  return pool.pp + pool.gp + pool.ep + pool.sp + pool.cp > 0;
}

function addArtObject() {
  const obj: ArtObject = {
    id: crypto.randomUUID(),
    name: "",
    value_gp: 0,
    image_url: null,
    description: null,
  };
  emit("update:artObjects", [...props.artObjects, obj]);
  expandedArtObject.value = obj.id;
}

function removeArtObject(id: string) {
  emit(
    "update:artObjects",
    props.artObjects.filter((o) => o.id !== id),
  );
}

function updateArtObject(
  id: string,
  key: keyof ArtObject,
  value: ArtObject[keyof ArtObject],
) {
  emit(
    "update:artObjects",
    props.artObjects.map((o) => (o.id === id ? { ...o, [key]: value } : o)),
  );
}
</script>
