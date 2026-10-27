<template>
  <article
    class="pack flex min-w-0 flex-col transition-opacity duration-200"
    :class="[faded ? 'opacity-45' : '', stacked ? 'border-t border-border first:border-t-0' : 'border-l border-border first:border-l-0']"
    :data-pack="column.key"
  >
    <component
      :is="headTag"
      v-bind="headAttrs"
      class="pack-head flex w-full items-center gap-2.5 border-b border-border bg-muted/20 px-3 py-2.5 text-left transition-colors"
      :class="stacked ? 'min-h-11' : ''"
    >
      <span class="pack-face flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-label-lg font-semibold text-muted-foreground">
        <FocalImage v-if="column.portraitUrl" :src="column.portraitUrl" :alt="column.title" format="token" />
        <IconInventory v-else-if="column.memberId === null" class="h-4 w-4" />
        <template v-else>{{ initials }}</template>
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-heading-xs font-semibold leading-tight text-foreground">{{ column.title }}</span>
        <span class="block truncate text-caption text-muted-foreground tabular-nums">{{ column.subline }}</span>
      </span>
      <IconChevronDown
        v-if="stacked"
        class="h-4 w-4 shrink-0 text-muted-foreground transition-transform"
        :class="open ? 'rotate-180' : ''"
      />
    </component>

    <div v-show="!stacked || open" class="flex min-h-0 flex-1 flex-col pb-1">
      <section v-for="section in column.sections" :key="section.key" class="pt-1.5">
        <div
          v-if="section.label !== null"
          class="flex items-center justify-between gap-1 px-3"
        >
          <p class="truncate text-label text-muted-foreground uppercase">
            <PackHighlight v-if="section.container" :text="section.label" :query="query" />
            <template v-else>{{ section.label }}</template>
          </p>
          <PackRowMenu
            v-if="section.container"
            :item="section.container"
            :give-targets="giveTargetsFor(section.container)"
            :carrier-name="column.title"
            :pack-link="column.link"
            @give="(to, qty) => $emit('give', section.container!, to, qty)"
            @attune="$emit('attune', section.container!)"
            @drop="$emit('drop', section.container!)"
            @remove="$emit('remove', section.container!)"
          />
        </div>
        <VueDraggable
          tag="ul"
          :model-value="section.rows"
          :group="{ name: 'packs', pull: 'clone', put: true }"
          :sort="false"
          draggable=".pack-row"
          :disabled="stacked"
          :animation="150"
          class="min-h-1"
          @add="onAdd"
        >
          <li
            v-for="row in section.rows"
            :key="row.id"
            class="pack-row group flex items-center gap-1.5 px-3 py-1 hover:bg-muted/30"
            :class="stacked ? '' : 'cursor-grab'"
            :data-row-id="row.id"
          >
            <span
              class="h-2 w-2 shrink-0 rounded-full"
              :class="rarityClass(row)"
              :title="rarityTitle(row)"
            />
            <span class="min-w-0 flex-1 truncate text-body text-foreground" :title="row.name">
              <PackHighlight :text="row.name" :query="query" />
            </span>
            <span v-if="row.quantity > 1" class="shrink-0 text-caption text-muted-foreground tabular-nums">×{{ row.quantity }}</span>
            <span v-if="row.is_attuned" class="shrink-0 text-caption text-primary" title="Attuned" aria-label="Attuned">✦</span>
            <span
              v-if="isDmOnly(row)"
              class="shrink-0 rounded-sm border border-dashed border-muted-foreground/60 px-1 text-label text-muted-foreground"
              title="The party does not know this yet"
            >DM</span>
            <PackRowMenu
              :item="row"
              :give-targets="giveTargetsFor(row)"
              :carrier-name="column.title"
              :pack-link="column.link"
              @give="(to, qty) => $emit('give', row, to, qty)"
              @count="(delta) => $emit('count', row, delta)"
              @attune="$emit('attune', row)"
              @drop="$emit('drop', row)"
              @remove="$emit('remove', row)"
            />
          </li>
        </VueDraggable>
      </section>

      <p v-if="column.hidden > 0" class="px-3 py-1.5 text-caption italic text-muted-foreground">
        {{ column.hidden }} {{ column.sections.length > 0 ? "more" : "things" }} hidden
      </p>
      <p v-else-if="column.sections.length === 0 && !faded" class="px-3 py-3 text-caption italic text-muted-foreground">
        {{ column.memberId === null ? "Nothing in the stash." : "Carrying nothing." }}
      </p>

      <!-- The rest of the column is a drop target too, so an empty pack can still be given to. -->
      <VueDraggable
        tag="div"
        :model-value="NO_ROWS"
        :group="{ name: 'packs', pull: false, put: true }"
        :sort="false"
        :disabled="stacked"
        class="min-h-6 flex-1"
        @add="onAdd"
      />
    </div>
  </article>
</template>

<script setup lang="ts">
/**
 * One pack in the Packs section (#1112): the party stash or a character, side by side on
 * a wide screen and stacked as collapsible packs on a phone. It draws what it is handed
 * and reports what the DM does; the section decides what each action writes.
 */
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { VueDraggable } from "vue-draggable-plus";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { IconChevronDown, IconInventory } from "@/lib/icons";
import { RARITY_SURFACE_BG, type ItemRarity } from "@/types/item.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import PackHighlight from "./PackHighlight.vue";
import PackRowMenu, { type PackGiveTarget } from "./PackRowMenu.vue";

export interface PackColumnData {
  /** `stash` or the member id. */
  key: string;
  memberId: string | null;
  title: string;
  subline: string;
  portraitUrl: string | null;
  /** The character's inventory tab; the stash has none. */
  link: string | null;
  /** Only what is shown: with a search on, matching rows. */
  sections: { key: string; label: string | null; container: PartyInventoryItem | null; rows: PartyInventoryItem[] }[];
  /** Things a search keeps out of sight. */
  hidden: number;
}

const { column, query, stacked, faded, startOpen, rarityOf, isDmOnly, giveTargetsFor } = defineProps<{
  column: PackColumnData;
  query: string;
  /** Phone layout: the head folds the pack open and shut, and dragging is off. */
  stacked: boolean;
  faded: boolean;
  startOpen: boolean;
  rarityOf: (row: PartyInventoryItem) => ItemRarity | null;
  isDmOnly: (row: PartyInventoryItem) => boolean;
  giveTargetsFor: (row: PartyInventoryItem) => PackGiveTarget[];
}>();

const emit = defineEmits<{
  give: [row: PartyInventoryItem, toMemberId: string | null, quantity: number | undefined];
  count: [row: PartyInventoryItem, delta: number];
  attune: [row: PartyInventoryItem];
  drop: [row: PartyInventoryItem];
  remove: [row: PartyInventoryItem];
  /** A row was dragged onto this pack. */
  receive: [rowId: string, toMemberId: string | null];
}>();

/** The empty drop zone holds nothing and never changes. */
const NO_ROWS: PartyInventoryItem[] = [];

const open = ref(startOpen);
watch(() => startOpen, (v) => { open.value = v; });

const initials = computed(() =>
  column.title.split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join(""),
);

const headTag = computed(() => (stacked ? "button" : column.link ? RouterLink : "div"));
const headAttrs = computed(() => {
  if (stacked) return { type: "button", "aria-expanded": open.value, onClick: () => { open.value = !open.value; } };
  return column.link ? { to: column.link } : {};
});

function rarityClass(row: PartyInventoryItem): string {
  const rarity = rarityOf(row);
  return rarity ? RARITY_SURFACE_BG[rarity] : "border border-dashed border-border";
}
function rarityTitle(row: PartyInventoryItem): string | undefined {
  return rarityOf(row)?.replace("_", " ");
}

interface SortAddEvent { item: HTMLElement }
/** The dragged row is a clone: remove it, so the data (not the DOM) decides where things are. */
function onAdd(event: SortAddEvent) {
  const rowId = event.item.dataset.rowId;
  event.item.remove();
  if (rowId) emit("receive", rowId, column.memberId);
}
</script>

<style scoped>
.pack-head:is(a):hover {
  background: color-mix(in oklab, var(--primary) 8%, transparent);
}
</style>
