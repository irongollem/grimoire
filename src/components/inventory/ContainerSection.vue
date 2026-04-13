<template>
  <div class="rounded-lg border border-border bg-card">
    <!-- Header -->
    <div class="px-4 py-2 border-b border-border bg-muted/20 flex items-center gap-2 rounded-t-lg">
      <button class="flex items-center gap-1.5 flex-1 text-left" @click="open = !open">
        <ChevronRight class="h-3 w-3 text-muted-foreground transition-transform" :class="open ? 'rotate-90' : ''" />
        <span class="font-cinzel text-xs font-semibold text-foreground tracking-wider">{{ label }}</span>
        <span class="font-cinzel text-[9px] text-muted-foreground/60 ml-1">
          ({{ items.length }}<template v-if="weight != null"> · {{ formatWeightLb(weight) }}</template>)
        </span>
      </button>
      <button
        v-if="container"
        class="text-muted-foreground/60 hover:text-foreground transition-colors p-0.5"
        title="View item details"
        @click.stop="$emit('open-detail', container)"
      ><Info class="h-3 w-3" /></button>
      <button
        class="font-cinzel text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        @click="showAdd = !showAdd"
      >+ Add</button>
      <button
        v-if="removable"
        class="font-cinzel text-[10px] text-destructive/60 hover:text-destructive transition-colors ml-1"
        @click="$emit('remove-container')"
      >Remove</button>
    </div>

    <!-- Items -->
    <div v-if="open">
      <VueDraggable v-model="localItems" handle=".drag-handle" :animation="150" @end="onReorder">
        <ItemRow
          v-for="item in localItems"
          :key="item.id"
          :item="item"
          :all-containers="allContainers"
          :sellable="sellable"
          @move="(item, loc, cid) => $emit('move', item, loc, cid)"
          @remove="(id) => $emit('remove', id)"
          @adjust-qty="(item, d) => $emit('adjust-qty', item, d)"
          @drop-to-chat="(item) => $emit('drop-to-chat', item)"
          @open-detail="(item) => $emit('open-detail', item)"
          @sell-item="(item) => $emit('sell-item', item)"
        />
      </VueDraggable>
      <div v-if="!items.length && !showAdd" class="px-4 py-3">
        <p class="font-fell text-xs text-muted-foreground/50 italic">Empty.</p>
      </div>

      <!-- Inline add form -->
      <form v-if="showAdd" class="px-4 py-2.5 border-t border-border flex items-center gap-2" @submit.prevent="submit">
        <div class="relative flex-1 min-w-0">
          <input
            v-model="addName"
            type="text"
            placeholder="Search vault…"
            autocomplete="off"
            class="w-full bg-muted/30 border border-border rounded px-2 py-1 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            :class="addName && !addSelectedId ? 'border-amber-500/50' : ''"
            @input="onInput"
            @focus="onInput"
            @keydown.escape="showSuggestions = false"
          />
          <div
            v-if="showSuggestions && suggestions.length"
            class="absolute left-0 bottom-full mb-0.5 z-20 w-full rounded border border-border bg-card shadow overflow-hidden max-h-40 overflow-y-auto"
          >
            <button
              v-for="it in suggestions"
              :key="it.id"
              type="button"
              class="w-full text-left px-2 py-1 font-fell text-xs text-foreground hover:bg-muted transition-colors"
              @click="selectSuggestion(it)"
            >{{ it.name }}</button>
          </div>
          <div v-if="showSuggestions" class="fixed inset-0 z-10" @click="showSuggestions = false" />
        </div>
        <button type="submit" class="px-2 py-1 bg-primary text-primary-foreground rounded font-cinzel text-[10px] tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50" :disabled="!addSelectedId">
          Add
        </button>
        <button type="button" class="font-cinzel text-[10px] text-muted-foreground hover:text-foreground" @click="showAdd = false">✕</button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ChevronRight, Info } from "lucide-vue-next";
import { VueDraggable } from "vue-draggable-plus";
import type { PartyInventoryItem, InventoryLocation } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import { formatWeightLb } from "@/lib/utils";
import ItemRow from "./ItemRow.vue";

const props = defineProps<{
  label: string;
  items: PartyInventoryItem[];
  allContainers: PartyInventoryItem[];
  allItems: Item[];
  resolvedMemberId: string | null;
  container?: PartyInventoryItem;
  containerId?: string;
  isDefault?: boolean;
  removable?: boolean;
  sellable?: boolean;
  weight?: number;
}>();


const emit = defineEmits<{
  add: [name: string, itemId: string | null];
  move: [item: PartyInventoryItem, location: InventoryLocation | 'stash', containerId: string | null];
  remove: [id: string];
  'remove-container': [];
  'adjust-qty': [item: PartyInventoryItem, delta: number];
  'drop-to-chat': [item: PartyInventoryItem];
  'open-detail': [item: PartyInventoryItem];
  'sell-item': [item: PartyInventoryItem];
  reorder: [items: PartyInventoryItem[]];
}>();

const open = ref(true);
const localItems = ref<PartyInventoryItem[]>([...props.items]);
watch(() => props.items, (newItems) => { localItems.value = [...newItems]; });
function onReorder() { emit('reorder', localItems.value); }
const showAdd = ref(false);
const addName = ref("");
const addSelectedId = ref("");
const showSuggestions = ref(false);

const suggestions = computed((): Item[] => {
  const q = addName.value.trim().toLowerCase();
  if (!q) return props.allItems.slice(0, 6);
  return props.allItems.filter(it => it.name.toLowerCase().includes(q)).slice(0, 6);
});

function onInput() { addSelectedId.value = ""; showSuggestions.value = true; }
function selectSuggestion(it: Item) { addName.value = it.name; addSelectedId.value = it.id; showSuggestions.value = false; }

function submit() {
  if (!addSelectedId.value) return;
  emit('add', addName.value.trim(), addSelectedId.value || null);
  addName.value = ""; addSelectedId.value = ""; showAdd.value = false;
}
</script>
