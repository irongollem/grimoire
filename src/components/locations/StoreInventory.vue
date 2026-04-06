<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Inventory</span>
    </div>

    <!-- Item list -->
    <div v-if="items?.length" class="flex flex-col gap-1.5">
      <div
        v-for="si in items"
        :key="si.id"
        class="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
      >
        <!-- Visibility toggle -->
        <button
          type="button"
          :title="si.visible ? 'Visible (click to hide)' : 'Under the counter (click to show)'"
          class="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          @click="toggleVisible(si)"
        >
          <Eye v-if="si.visible" class="h-3.5 w-3.5" />
          <EyeOff v-else class="h-3.5 w-3.5 opacity-40" />
        </button>

        <!-- Item name + type -->
        <div class="flex-1 min-w-0">
          <span class="font-cinzel text-xs font-semibold text-foreground truncate block">{{ si.item.name }}</span>
          <span class="font-fell text-[10px] text-muted-foreground italic">
            {{ ITEM_TYPE_LABELS[si.item.item_type] }}
            <span v-if="!si.visible" class="text-amber-500/70"> · under the counter</span>
          </span>
        </div>

        <!-- Price -->
        <div class="flex items-center gap-1 shrink-0">
          <input
            :value="si.price_override ?? si.item.cost ?? ''"
            type="text"
            placeholder="Price…"
            class="w-20 bg-background border border-border rounded px-2 py-0.5 font-fell text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring text-right"
            @blur="onPriceBlur(si, $event)"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
          />
        </div>

        <!-- Remove -->
        <button
          type="button"
          class="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
          title="Remove from store"
          @click="remove(si.id)"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <p v-else class="font-fell text-xs text-muted-foreground italic">No items yet.</p>

    <!-- Add item -->
    <div class="relative">
      <div class="flex items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2">
        <Plus class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          v-model="search"
          type="text"
          placeholder="Add item to inventory…"
          class="flex-1 bg-transparent font-fell text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          @focus="dropdownOpen = true"
        @input="dropdownOpen = true"
          @blur="onSearchBlur"
          @keydown.escape="dropdownOpen = false"
        />
      </div>
      <div
        v-if="dropdownOpen && searchResults.length"
        class="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border border-border bg-popover shadow-lg overflow-hidden max-h-48 overflow-y-auto"
      >
        <button
          v-for="item in searchResults"
          :key="item.id"
          type="button"
          class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted transition-colors"
          @mousedown.prevent="addItem(item)"
        >
          <span class="font-cinzel text-xs font-semibold text-foreground truncate flex-1">{{ item.name }}</span>
          <span class="font-fell text-[10px] text-muted-foreground shrink-0">{{ ITEM_TYPE_LABELS[item.item_type] }}</span>
          <span v-if="item.cost" class="font-fell text-[10px] text-muted-foreground/70 shrink-0">{{ item.cost }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Eye, EyeOff, Plus, X } from "lucide-vue-next";
import { useItems } from "@/composables/useItems";
import {
  useStoreItems,
  useAddStoreItem,
  useUpdateStoreItem,
  useRemoveStoreItem,
} from "@/composables/useStoreItems";
import type { StoreItem } from "@/composables/useStoreItems";
import type { Item } from "@/types/item.types";
import { ITEM_TYPE_LABELS } from "@/types/item.types";

const props = defineProps<{ locationId: string }>();

const locationIdRef = computed(() => props.locationId);

const { data: items } = useStoreItems(locationIdRef);
const { data: allItems } = useItems();
const { mutate: add } = useAddStoreItem();
const { mutate: update } = useUpdateStoreItem(locationIdRef);
const { mutate: removeItem } = useRemoveStoreItem(locationIdRef);

// ── Add item search ─────────────────────────────────────────────────────────────
const search = ref("");
const dropdownOpen = ref(false);

const existingItemIds = computed(() => new Set((items.value ?? []).map((si) => si.item_id)));

const searchResults = computed(() => {
  const q = search.value.toLowerCase().trim();
  return (allItems.value ?? [])
    .filter((i) => !existingItemIds.value.has(i.id) && (q === "" || i.name.toLowerCase().includes(q)))
    .slice(0, 10);
});

function addItem(item: Item) {
  search.value = "";
  dropdownOpen.value = false;
  add({ location_id: props.locationId, item_id: item.id });
}

function onSearchBlur() {
  setTimeout(() => { dropdownOpen.value = false; }, 150);
}

// ── Toggle visibility ───────────────────────────────────────────────────────────
function toggleVisible(si: StoreItem) {
  update({ id: si.id, update: { visible: !si.visible } });
}

// ── Price override ──────────────────────────────────────────────────────────────
function onPriceBlur(si: StoreItem, e: FocusEvent) {
  const val = (e.target as HTMLInputElement).value.trim() || null;
  const effective = val === si.item.cost ? null : val;
  if (effective !== si.price_override) {
    update({ id: si.id, update: { price_override: effective } });
  }
}

// ── Remove ──────────────────────────────────────────────────────────────────────
function remove(id: string) {
  removeItem(id);
}
</script>
