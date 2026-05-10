<template>
  <div class="rounded-lg border border-border bg-card">
    <!-- Header -->
    <div
      ref="headerRef"
      class="px-4 py-2 border-b border-border bg-muted/20 flex items-center gap-2 rounded-t-lg"
      @dragover="onHeaderDragOver"
      @dragleave="onHeaderDragLeave"
    >
      <button class="flex items-center gap-1.5 flex-1 text-left" @click="open = !open">
        <IconChevronRight class="h-3 w-3 text-muted-foreground transition-transform" :class="open ? 'rotate-90' : ''" />
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
      ><IconInfo class="h-3 w-3" /></button>
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

    <!-- Items — v-show keeps VueDraggable mounted so it's always a valid Sortable drop zone -->
    <div v-show="open">
      <!-- Inline add form -->
      <form v-if="showAdd" class="px-4 py-2.5 border-b border-border flex items-center gap-2" @submit.prevent="submit">
        <div class="relative flex-1 min-w-0">
          <input
            ref="addInputRef"
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
            class="absolute left-0 top-full mt-0.5 z-20 w-full rounded border border-border bg-card shadow overflow-hidden max-h-40 overflow-y-auto"
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

      <VueDraggable v-model="localItems" group="inventory" handle=".drag-handle" :animation="150" @end="onEnd" @add="onCrossAdd">
        <ItemRow
          v-for="item in localItems"
          :key="item.id"
          :item="item"
          :all-containers="allContainers"
          :sellable="sellable"
          :weight-per-unit="weightForItem(item)"
          @remove="(id) => $emit('remove', id)"
          @adjust-qty="(item, d) => $emit('adjust-qty', item, d)"
          @drop-to-chat="(item) => $emit('drop-to-chat', item)"
          @open-detail="(item) => $emit('open-detail', item)"
          @sell-item="(item) => $emit('sell-item', item)"
          @split-stack="(item) => $emit('split-stack', item)"
        />
      </VueDraggable>
      <div v-if="!items.length && !showAdd" class="px-4 py-3">
        <p class="font-fell text-xs text-muted-foreground/50 italic">Empty.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from "vue";
import { IconChevronRight, IconInfo } from '@/lib/icons';
import { VueDraggable } from "vue-draggable-plus";
import type { PartyInventoryItem, InventoryLocation } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import { formatWeightLb, parseWeightLb } from "@/lib/utils";
import ItemRow from "./ItemRow.vue";

const props = defineProps<{
  label: string;
  items: PartyInventoryItem[];
  allContainers: PartyInventoryItem[];
  allItems: Item[];
  resolvedMemberId: string | null;
  location: InventoryLocation;
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
  'split-stack': [item: PartyInventoryItem];
  reorder: [items: PartyInventoryItem[]];
}>();

const itemWeightMap = computed((): Map<string, number> => {
  const m = new Map<string, number>();
  for (const it of props.allItems) m.set(it.id, parseWeightLb(it.weight));
  return m;
});

function weightForItem(item: PartyInventoryItem): number {
  if (!item.item_id) return 0;
  return itemWeightMap.value.get(item.item_id) ?? 0;
}

const open = ref(true);
const headerRef = ref<HTMLElement | null>(null);

// Drag-to-expand: auto-open after 500ms hover on a collapsed header.
// Uses relatedTarget to avoid false "leave" triggers when moving between child elements.
let expandTimer: ReturnType<typeof setTimeout> | null = null;
function onHeaderDragOver() {
  if (open.value || expandTimer) return;
  expandTimer = setTimeout(() => { open.value = true; expandTimer = null; }, 500);
}
function onHeaderDragLeave(e: DragEvent) {
  if (!expandTimer) return;
  const related = e.relatedTarget as Node | null;
  if (headerRef.value?.contains(related)) return; // moved to a child — stay
  clearTimeout(expandTimer);
  expandTimer = null;
}
onUnmounted(() => { if (expandTimer) clearTimeout(expandTimer); });

const localItems = ref<PartyInventoryItem[]>([...props.items]);
watch(() => props.items, (newItems) => { localItems.value = [...newItems]; });

interface SortEvent { from: Element; to: Element; newIndex?: number; }

function onEnd(event: SortEvent) {
  if (event.from === event.to) {
    emit('reorder', localItems.value);
  }
}

function onCrossAdd(event: SortEvent) {
  const item = localItems.value[event.newIndex ?? 0];
  if (!item) return;
  const cid = props.location === 'container' ? (props.containerId ?? null) : null;
  emit('move', item, props.location, cid);
  emit('reorder', localItems.value);
}
const showAdd = ref(false);
const addInputRef = ref<HTMLInputElement | null>(null);
const addName = ref("");
const addSelectedId = ref("");

watch(showAdd, (v) => { if (v) void nextTick(() => addInputRef.value?.focus()); });
const showSuggestions = ref(false);

const suggestions = computed((): Item[] => {
  const q = addName.value.trim().toLowerCase();
  if (!q) return props.allItems.slice(0, 6);
  return props.allItems.filter(it =>
    it.name.toLowerCase().includes(q) ||
    (it.subtype ?? "").toLowerCase().includes(q) ||
    it.tags.some(t => t.toLowerCase().includes(q))
  ).slice(0, 6);
});

function onInput() { addSelectedId.value = ""; showSuggestions.value = true; }
function selectSuggestion(it: Item) { addName.value = it.name; addSelectedId.value = it.id; showSuggestions.value = false; }

function submit() {
  if (!addSelectedId.value) return;
  emit('add', addName.value.trim(), addSelectedId.value || null);
  addName.value = ""; addSelectedId.value = ""; showAdd.value = false;
}
</script>
