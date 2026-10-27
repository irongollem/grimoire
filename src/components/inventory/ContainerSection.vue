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
        :give-targets="giveTargets"
        @remove="$emit('remove-container')"
        @move="(location, containerId) => $emit('move', container!, location, containerId)"
        @give="(to, qty) => $emit('give', container!, to, qty)"
        @toggle-container="$emit('use-as-item', container!)"
      />
    </div>

    <!-- Items — v-show keeps VueDraggable mounted so it's always a valid Sortable drop zone -->
    <div v-show="open">
      <!-- Inline add form -->
      <form v-if="showAdd" class="px-4 py-2.5 border-b border-border flex items-center gap-2" @submit.prevent="submit">
        <div ref="addFieldRef" class="flex min-w-0 flex-1">
          <EntityCombobox v-model="addSelectedId" :options="catalogue" :match-text="catalogueText" placeholder="Search vault…">
            <template #option="{ opt }">
              <span class="truncate">{{ opt.name }}</span>
            </template>
          </EntityCombobox>
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
          :give-targets="giveTargets"
          @remove="(id) => $emit('remove', id)"
          @adjust-qty="(item, d) => $emit('adjust-qty', item, d)"
          @drop-to-chat="(item) => $emit('drop-to-chat', item)"
          @open-detail="(item) => $emit('open-detail', item)"
          @sell-item="(item) => $emit('sell-item', item)"
          @split-stack="(item) => $emit('split-stack', item)"
          @move="(item, loc, cid) => $emit('move', item, loc, cid)"
          @give="(item, to, qty) => $emit('give', item, to, qty)"
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
import ItemRowMenu, { type GiveTarget, type MoveTarget } from "./ItemRowMenu.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
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
  /** Other party members rows (and the container itself) can be handed to. */
  giveTargets?: GiveTarget[];
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
  give: [item: PartyInventoryItem, toMemberId: string, quantity: number | null];
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
const addFieldRef = ref<HTMLElement | null>(null);
const addSelectedId = ref("");

// EntityCombobox owns its input, so reach it through the wrapper to put the cursor there.
watch(showAdd, (v) => { if (v) void nextTick(() => addFieldRef.value?.querySelector("input")?.focus()); });

// The add box finds an item by its subtype or a tag as well as its name ("potion", "ammunition").
const catalogueText = (it: ItemIndexEntry) => [it.name, it.subtype ?? "", ...it.tags].join(" ");

function submit() {
  const picked = props.catalogue.find((it) => it.id === addSelectedId.value);
  if (!picked) return;
  emit('add', picked.name, picked.id);
  addSelectedId.value = ""; showAdd.value = false;
}
</script>
