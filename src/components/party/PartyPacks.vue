<template>
  <section class="mt-6 rounded-lg border border-border bg-card" aria-labelledby="packs-title">
    <header class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-muted/20 px-4 py-2.5">
      <h2 id="packs-title" class="flex items-center gap-1.5 text-heading-xs font-semibold text-primary">
        <IconInventory class="h-4 w-4" /> Packs
      </h2>
      <div class="min-w-44 max-w-72 flex-1">
        <AppInput
          v-model="ui.packsSearch"
          type="search"
          size="body-xs"
          placeholder="Find in any pack…"
          aria-label="Find in any pack"
          autocomplete="off"
        />
      </div>
      <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Narrow the packs">
        <AppButton variant="chip" size="xs" label="Attuned" :active="ui.packsAttuned" :aria-pressed="ui.packsAttuned" @click="ui.packsAttuned = !ui.packsAttuned" />
        <AppButton variant="chip" size="xs" label="Magic" :active="ui.packsMagic" :aria-pressed="ui.packsMagic" @click="ui.packsMagic = !ui.packsMagic" />
        <AppButton variant="chip" size="xs" label="Cursed" :active="ui.packsCursed" :aria-pressed="ui.packsCursed" @click="ui.packsCursed = !ui.packsCursed" />
        <AppButton v-if="ui.packsHasActiveFilters" variant="link" size="inline-xs" label="Clear" @click="ui.resetPacksFilters()" />
      </div>
      <AppButton class="ml-auto" variant="primary" size="sm" :icon="IconAdd" label="Add item" :disabled="adding" @click="adding = true" />
    </header>

    <PacksAddItem v-if="adding" :members="party" @close="adding = false" />

    <ListSkeleton v-if="isLoading" variant="rows" :count="3" class="p-3" />
    <p v-else-if="isError" class="px-4 py-6 text-center text-caption italic text-muted-foreground">
      The packs would not open. Try again in a moment.
    </p>
    <p v-else-if="rows.length === 0" class="px-4 py-6 text-center text-caption italic text-muted-foreground">
      Nobody is carrying anything yet. Loot found on the road is gathered here.
    </p>
    <template v-else>
      <PacksAnswer v-if="search.active" :result="search" :query="ui.packsSearch" class="m-3" />

      <div v-if="stacked" class="flex flex-col">
        <PackColumn v-for="column in columns" :key="column.key" v-bind="columnProps(column)" @give="give" @count="count" @attune="attune" @drop="dropToChat" @remove="remove" @receive="receive" />
      </div>
      <div v-else class="overflow-x-auto">
        <div class="grid" :style="gridStyle">
          <PackColumn v-for="column in columns" :key="column.key" v-bind="columnProps(column)" @give="give" @count="count" @attune="attune" @drop="dropToChat" @remove="remove" @receive="receive" />
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * Packs (#1112): every pack in the campaign side by side, the party stash first and then
 * each character in the party's order, with one search across all of them. The DM writes
 * any row; a give goes through `give_inventory_item`, the same door a player uses.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import { IconAdd, IconInventory } from "@/lib/icons";
import { useBelow } from "@/composables/useBreakpoint";
import { useConfirm } from "@/composables/useConfirm";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { useChatSendFailure } from "@/composables/campaign/chatSendErrors";
import { usePartyInventory, useRemoveInventoryItem, useUpdateInventoryItem } from "@/composables/items/usePartyInventory";
import { useGiveInventoryItem } from "@/composables/items/useGiveInventory";
import { useStoredItemRefs } from "@/composables/items/useStoredItemRefs";
import { useSpeciesNames } from "@/composables/rules/useSpecies";
import { usePartyUiStore } from "@/stores/ui/party";
import { isCursedItem, isHiddenCurse } from "@/lib/dashboard/cursedItems";
import { extradimensionalCheck, itemWeightMap, packSections, packSlices, packWeights } from "@/lib/inventory/pack";
import { runPackSearch, type PackFilters, type PackSearchContext } from "@/lib/inventory/packSearch";
import { inventoryItemRef } from "@/lib/itemRef";
import { carryCapacity } from "@/lib/utils";
import { inventoryItemWeight } from "@/rules/inventoryWeight";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item, ItemRarity } from "@/types/item.types";
import type { PartyMember } from "@/types/party.types";
import PackColumn, { type PackColumnData } from "./PackColumn.vue";
import type { PackGiveTarget } from "./PackRowMenu.vue";
import PacksAddItem from "./PacksAddItem.vue";
import PacksAnswer from "./PacksAnswer.vue";

/** Packs that share the width; more than this scroll sideways inside the section. */
const SHARED_COLUMNS = 6;
const ATTUNEMENT_SLOTS = 3;

const { party } = defineProps<{ party: PartyMember[] }>();

const ui = usePartyUiStore();
const { confirm } = useConfirm();
const { sendItemDrop } = useCampaignMessages();
const { reportChatFailure } = useChatSendFailure();
const { data: inventory, isLoading, isError } = usePartyInventory();
const { mutate: giveItem } = useGiveInventoryItem();
const { mutate: updateItem } = useUpdateInventoryItem();
const { mutateAsync: removeItem } = useRemoveInventoryItem();
const stacked = useBelow("sm");
const adding = ref(false);

const rows = computed(() => inventory.value ?? []);
const { items: resolved } = useStoredItemRefs(() => rows.value.map(inventoryItemRef));
const itemsById = computed(() => new Map<string, Item>(resolved.value.map((i) => [i.id, i] as const)));
function itemOf(row: PartyInventoryItem): Item | undefined {
  const ref = inventoryItemRef(row);
  return ref ? itemsById.value.get(ref) : undefined;
}
function rarityOf(row: PartyInventoryItem): ItemRarity | null {
  return itemOf(row)?.rarity ?? null;
}
/** The DM sees the true name; this marks what the party has not been told. */
function isDmOnly(row: PartyInventoryItem): boolean {
  return !row.is_identified || isHiddenCurse(row, itemOf(row));
}

const filters = computed<PackFilters>(() => ({
  query: ui.packsSearch,
  attuned: ui.packsAttuned,
  magic: ui.packsMagic,
  cursed: ui.packsCursed,
}));
const searchContext: PackSearchContext = { rarityOf, isCursed: (row) => isCursedItem(itemOf(row)) };
const search = computed(() => runPackSearch(rows.value, party, filters.value, searchContext));

// ── Columns ────────────────────────────────────────────────────────────────────
const speciesNameOf = useSpeciesNames(() => party);
const weightMap = computed(() => itemWeightMap(resolved.value));
const isExtradimensional = computed(() => extradimensionalCheck(resolved.value));
const things = (list: readonly PartyInventoryItem[]) => list.reduce((n, r) => n + r.quantity, 0);

function memberSubline(member: PartyMember, slices: ReturnType<typeof packSlices>): string {
  const weights = packWeights(slices, (inv) => inventoryItemWeight(inv, weightMap.value), isExtradimensional.value);
  const capacity = carryCapacity(member.str, speciesNameOf(member), member.carry_capacity_override);
  return `${weights.total} / ${capacity} lb · ✦ ${slices.attuned.length}/${ATTUNEMENT_SLOTS} · ${member.gp} gp`;
}

function buildColumn(member: PartyMember | null): PackColumnData {
  const memberId = member?.id ?? null;
  const slices = packSlices(rows.value, memberId);
  const matched = search.value.matchIds;
  const active = search.value.active;
  const kept = new Set<string>();
  const sections = packSections(slices, member === null)
    .map((section) => {
      const shown = active ? section.rows.filter((r) => matched.has(r.id)) : section.rows;
      const headerShown = section.container !== null && (!active || shown.length > 0 || matched.has(section.container.id));
      shown.forEach((r) => kept.add(r.id));
      if (headerShown && section.container) kept.add(section.container.id);
      return { ...section, rows: shown, headerShown };
    })
    .filter((s) => s.rows.length > 0 || s.headerShown);
  const matchedHere = slices.items.filter((r) => matched.has(r.id));
  // A container kept only as the heading of a match is on screen, so it is not "hidden".
  const hidden = active ? things(slices.items.filter((r) => !kept.has(r.id))) : 0;
  const nothing = active && matchedHere.length === 0;
  const subline = nothing
    ? "nothing matches"
    : member === null
      ? `carried by nobody · ${things(slices.items)} ${things(slices.items) === 1 ? "thing" : "things"}`
      : memberSubline(member, slices);
  return {
    key: memberId ?? "stash",
    memberId,
    title: member?.name ?? "Party stash",
    subline,
    portraitUrl: member?.portrait_url ?? null,
    link: member ? `/party/${member.id}?tab=inventory` : null,
    sections,
    hidden,
  };
}

const columns = computed(() => [buildColumn(null), ...party.map(buildColumn)]);

const gridStyle = computed(() => ({
  gridAutoFlow: "column",
  gridAutoColumns:
    columns.value.length <= SHARED_COLUMNS ? "minmax(13rem, 1fr)" : `max(13rem, calc(100% / ${SHARED_COLUMNS}))`,
}));

function columnProps(column: PackColumnData) {
  const matches = search.value.active && column.sections.length > 0;
  return {
    column,
    query: ui.packsSearch,
    stacked: stacked.value,
    faded: search.value.active && !matches,
    startOpen: search.value.active ? matches : column.memberId === null,
    rarityOf,
    isDmOnly,
    giveTargetsFor,
  };
}

function giveTargetsFor(row: PartyInventoryItem): PackGiveTarget[] {
  return [{ id: null, name: "Party stash" }, ...party.map((m) => ({ id: m.id, name: m.name }))].filter(
    (t) => t.id !== row.carried_by,
  );
}

// ── Actions ────────────────────────────────────────────────────────────────────
function give(row: PartyInventoryItem, toMemberId: string | null, quantity: number | undefined) {
  giveItem({ itemId: row.id, toMemberId, quantity });
}

/** A row dragged onto a pack goes whole; a part of a stack goes through the menu. */
function receive(rowId: string, toMemberId: string | null) {
  const row = rows.value.find((r) => r.id === rowId);
  if (row && row.carried_by !== toMemberId) give(row, toMemberId, undefined);
}

async function remove(row: PartyInventoryItem) {
  if (!(await confirm(`Remove "${row.name}"?`))) return;
  await removeItem(row.id);
}

async function count(row: PartyInventoryItem, delta: number) {
  const quantity = row.quantity + delta;
  if (quantity < 1) {
    await remove(row);
    return;
  }
  updateItem({ id: row.id, update: { quantity } });
}

function attune(row: PartyInventoryItem) {
  updateItem({ id: row.id, update: { is_attuned: !row.is_attuned } });
}

async function dropToChat(row: PartyInventoryItem) {
  // Post first, remove after: a failed post must not cost the party the item.
  try {
    await sendItemDrop(row.name, inventoryItemRef(row), row.quantity, rarityOf(row), { quality: row.quality });
  } catch (e) {
    reportChatFailure(e, "drop the item to the chat");
    return;
  }
  await removeItem(row.id);
}
</script>
