<template>
  <div class="rounded-lg border border-border bg-card">
    <!-- Header -->
    <div
      ref="headerRef"
      class="px-4 py-2 border-b border-border bg-muted/20 flex items-center gap-2 rounded-t-lg"
      @dragover="onHeaderDragOver"
      @dragleave="onHeaderDragLeave"
    >
      <button class="flex items-center gap-x-1.5 gap-y-0.5 flex-wrap flex-1 min-w-0 text-left" @click="open = !open">
        <IconChevronRight class="h-3 w-3 text-muted-foreground transition-transform" :class="open ? 'rotate-90' : ''" />
        <span class="text-label-lg font-semibold text-foreground">{{ label }}</span>
        <span class="text-label text-muted-foreground/60">({{ meta }})</span>
      </button>
      <AppButton
        v-if="container"
        variant="ghost"
        size="icon-xs"
        tooltip="View item details"
        :icon="IconInfo"
        icon-size="xs"
        @click.stop="$emit('open-detail', container)"
      />
      <AppButton variant="ghost" size="inline-xs" label="+ Add" @click="showAdd = !showAdd" />
      <ItemRowMenu
        v-if="container"
        :item="container"
        :as-container="true"
        :move-targets="containerMoveTargets"
        @remove="$emit('remove-container')"
        @move="(location, containerId) => $emit('move', container!, location, containerId)"
        @toggle-container="$emit('use-as-item', container!)"
      />
    </div>

    <!-- Items — v-show keeps VueDraggable mounted so it's always a valid Sortable drop zone -->
    <div v-show="open">
      <!-- Inline add form -->
      <form v-if="showAdd" class="px-4 py-2.5 border-b border-border flex items-center gap-2" @submit.prevent="submit">
        <div class="relative flex-1 min-w-0">
          <AppInput
            ref="addInputRef"
            v-model="addName"
            type="text"
            tone="muted"
            size="body-xs"
            placeholder="Search vault…"
            autocomplete="off"
            :class="addName && !addSelectedId ? 'border-tone-caution/50' : ''"
            @input="onInput"
            @focus="onInput"
            @keydown.escape="showSuggestions = false"
          />
          <div
            v-if="showSuggestions && suggestions.length"
            class="absolute left-0 top-full mt-0.5 z-20 w-full rounded border border-border bg-card shadow overflow-hidden max-h-40 overflow-y-auto"
          >
            <AppButton
              v-for="it in suggestions"
              :key="it.id"
              variant="menu"
              size="body"
              block
              :label="it.name"
              @click="selectSuggestion(it)"
            />
          </div>
          <div v-if="showSuggestions" class="fixed inset-0 z-10" @click="showSuggestions = false" />
        </div>
        <AppButton type="submit" variant="primary" size="xs" label="Add" :disabled="!addSelectedId" />
        <AppButton variant="ghost" size="inline-xs" label="✕" @click="showAdd = false" />
      </form>

      <VueDraggable v-model="localItems" group="inventory" handle=".drag-handle" :animation="150" @end="onEnd" @add="onCrossAdd">
        <ItemRow
          v-for="item in localItems"
          :key="item.id"
          :item="item"
          :all-containers="allContainers"
          :sellable="sellable"
          :weight-per-unit="weightForItem(item)"
          :has-content="hasContent(item)"
          :can-hold-items="canHoldItems(item)"
          @remove="(id) => $emit('remove', id)"
          @adjust-qty="(item, d) => $emit('adjust-qty', item, d)"
          @drop-to-chat="(item) => $emit('drop-to-chat', item)"
          @open-detail="(item) => $emit('open-detail', item)"
          @sell-item="(item) => $emit('sell-item', item)"
          @split-stack="(item) => $emit('split-stack', item)"
          @move="(item, loc, cid) => $emit('move', item, loc, cid)"
          @use-as-container="(item) => $emit('use-as-container', item)"
        />
      </VueDraggable>
      <div v-if="!items.length && !showAdd" class="px-4 py-3">
        <p class="text-caption text-muted-foreground/50 italic">Empty.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from "vue";
import { IconChevronRight, IconInfo } from '@/lib/icons';
import { VueDraggable } from "vue-draggable-plus";
import type { PartyInventoryItem, InventoryLocation } from "@/types/inventory.types";
import type { Item, ItemIndexEntry } from "@/types/item.types";
import { formatWeightLb, parseWeightLb } from "@/lib/utils";
import ItemRow from "./ItemRow.vue";
import ItemRowMenu, { type MoveTarget } from "./ItemRowMenu.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import type { AppInputHandle } from "@/components/common/fieldVariants";
import { inventoryItemRef, contentItemIds, holderItemIds } from "@/lib/itemRef";

const props = defineProps<{
  label: string;
  items: PartyInventoryItem[];
  allContainers: PartyInventoryItem[];
  /** Resolves the carried rows (weight). */
  allItems: Item[];
  /** What the add box may suggest, slim; the full row is read when one is picked. */
  catalogue: ItemIndexEntry[];
  resolvedMemberId: string | null;
  location: InventoryLocation;
  container?: PartyInventoryItem;
  containerId?: string;
  sellable?: boolean;
  weight?: number;
}>();

const emit = defineEmits<{
  add: [name: string, itemId: string | null];
  move: [item: PartyInventoryItem, location: InventoryLocation | 'stash', containerId: string | null];
  remove: [id: string];
  'remove-container': [];
  'use-as-item': [container: PartyInventoryItem];
  'use-as-container': [item: PartyInventoryItem];
  'adjust-qty': [item: PartyInventoryItem, delta: number];
  'drop-to-chat': [item: PartyInventoryItem];
  'open-detail': [item: PartyInventoryItem];
  'sell-item': [item: PartyInventoryItem];
  'split-stack': [item: PartyInventoryItem];
  reorder: [items: PartyInventoryItem[]];
}>();

const vaultById = computed(() => new Map(props.allItems.map((it) => [it.id, it])));

function vaultItemFor(item: PartyInventoryItem): Item | null {
  const ref = inventoryItemRef(item);
  return ref ? (vaultById.value.get(ref) ?? null) : null;
}

const holderRefs = computed(() => holderItemIds(props.allItems));

function canHoldItems(item: PartyInventoryItem): boolean {
  const ref = inventoryItemRef(item);
  return !item.is_container && ref !== null && holderRefs.value.has(ref);
}

const LOCATION_HINT: Partial<Record<InventoryLocation, string>> = {
  belt: "on belt",
  stored: "stored elsewhere",
  equipped: "worn",
};

/**
 * The header's summary. A container's own weight is not a row in any list, so
 * the header says it: the total with the contents, and what it weighs empty.
 * A container that is not in the backpack says where it is, since the section
 * itself does not move when the container does.
 */
const meta = computed((): string => {
  const n = props.items.length;
  const parts: string[] = [n === 0 ? "empty" : n === 1 ? "1 item" : `${n} items`];
  const c = props.container;
  if (props.weight != null) {
    const own = c ? round1(weightForItem(c) * c.quantity) : 0;
    const weightless = !!c && (vaultItemFor(c)?.tags.includes("extradimensional") ?? false);
    if (weightless) {
      if (own > 0) parts.push(formatWeightLb(own));
      parts.push("contents weigh nothing");
    } else {
      parts.push(formatWeightLb(round1(props.weight + own)));
      if (own > 0 && props.weight > 0) parts.push(`${formatWeightLb(own)} empty`);
    }
  }
  if (c) {
    const inside = c.location === "container" ? props.allContainers.find((p) => p.id === c.container_id) : null;
    const hint = inside ? `in ${inside.name}` : LOCATION_HINT[c.location];
    if (hint) parts.push(hint);
  }
  return parts.join(" · ");
});

/** A container moves between the places on the character. Into the stash would
 *  strand its contents with the character, and into another container is not
 *  offered so two can never hold each other. */
const containerMoveTargets = computed((): MoveTarget[] => {
  const c = props.container;
  if (!c) return [];
  const places: MoveTarget[] = [
    { key: "backpack", label: "Backpack", location: "backpack", containerId: null },
    { key: "belt", label: "Belt", location: "belt", containerId: null },
    { key: "stored", label: "Stored elsewhere", location: "stored", containerId: null },
  ];
  return places.filter((t) => t.location !== c.location);
});

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

const itemWeightMap = computed((): Map<string, number> => {
  const m = new Map<string, number>();
  for (const it of props.allItems) m.set(it.id, parseWeightLb(it.weight));
  return m;
});

/** Items among the carried ones that are a written document (the feather badge). */
const contentRefs = computed(() => contentItemIds(props.allItems));

function hasContent(item: PartyInventoryItem): boolean {
  const ref = inventoryItemRef(item);
  return ref !== null && contentRefs.value.has(ref);
}

function weightForItem(item: PartyInventoryItem): number {
  const ref = inventoryItemRef(item);
  if (!ref) return 0;
  return itemWeightMap.value.get(ref) ?? 0;
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
const addInputRef = ref<AppInputHandle | null>(null);
const addName = ref("");
const addSelectedId = ref("");

watch(showAdd, (v) => { if (v) void nextTick(() => addInputRef.value?.focus()); });
const showSuggestions = ref(false);

const suggestions = computed((): ItemIndexEntry[] => {
  const q = addName.value.trim().toLowerCase();
  if (!q) return props.catalogue.slice(0, 6);
  return props.catalogue
    .filter(it => it.name.toLowerCase().includes(q)
      || it.subtype?.toLowerCase().includes(q)
      || it.tags.some(tag => tag.toLowerCase().includes(q)))
    .slice(0, 6);
});

function onInput() { addSelectedId.value = ""; showSuggestions.value = true; }
function selectSuggestion(it: ItemIndexEntry) { addName.value = it.name; addSelectedId.value = it.id; showSuggestions.value = false; }

function submit() {
  if (!addSelectedId.value) return;
  emit('add', addName.value.trim(), addSelectedId.value || null);
  addName.value = ""; addSelectedId.value = ""; showAdd.value = false;
}
</script>
