<template>
  <!-- ═══ CONTAINERS ═══ -->
  <div>
    <div class="flex items-center justify-between mb-2">
      <p class="text-label-lg font-semibold text-muted-foreground">
        Containers
      </p>
      <AppButton
        variant="ghost"
        size="inline-xs"
        icon-size="xs"
        :icon="IconAdd"
        label="Add container"
        @click="$emit('toggle-container-picker')"
      />
    </div>

    <!-- Container picker -->
    <div
      v-if="showContainerPicker"
      class="mb-2 rounded-lg border border-border bg-card p-3 flex flex-col gap-2"
    >
      <p class="text-label text-muted-foreground">
        Pick an item from your inventory:
      </p>
      <AppInput
        v-model="containerSearchModel"
        type="text"
        tone="muted"
        size="body-xs"
        placeholder="Filter items…"
      />
      <div v-if="containerCandidates.length" class="rounded border border-border overflow-hidden">
        <AppButton
          v-for="item in containerCandidates"
          :key="item.id"
          variant="menu"
          size="body"
          block
          :label="item.name"
          class="rounded-none border-b border-border last:border-0"
          @click="$emit('promote-container', item)"
        />
      </div>
      <p v-else class="text-caption text-muted-foreground/50 italic">
        No items in inventory.
      </p>
      <AppButton
        variant="ghost"
        size="inline-xs"
        label="Cancel"
        class="self-end"
        @click="$emit('close-container-picker')"
      />
    </div>

    <!-- Default backpack always shown -->
    <ContainerSection
      label="Backpack"
      location="backpack"
      :is-default="true"
      :sellable="true"
      :items="backpackItems"
      :weight="backpackWeight"
      :all-containers="allContainers"
      :all-items="allItems"
      :resolved-member-id="resolvedMemberId ?? null"
      @add="(name, itemId) => $emit('add-to-location', 'backpack', null, name, itemId)"
      @move="(item, loc, cid) => $emit('move', item, loc, cid)"
      @remove="(id) => $emit('remove', id)"
      @adjust-qty="(item, delta) => $emit('adjust-qty', item, delta)"
      @drop-to-chat="(inv) => $emit('drop-to-chat', inv)"
      @split-stack="(inv) => $emit('split-stack', inv)"
      @open-detail="(item) => $emit('open-detail', item)"
      @sell-item="(item) => $emit('sell-item', item)"
      @reorder="(items) => $emit('reorder', items)"
    />

    <!-- Belt -->
    <ContainerSection
      label="Belt"
      location="belt"
      :sellable="true"
      :items="beltItems"
      :weight="beltWeight"
      :all-containers="allContainers"
      :all-items="allItems"
      :resolved-member-id="resolvedMemberId ?? null"
      class="mt-2"
      @add="(name, itemId) => $emit('add-to-location', 'belt', null, name, itemId)"
      @move="(item, loc, cid) => $emit('move', item, loc, cid)"
      @remove="(id) => $emit('remove', id)"
      @adjust-qty="(item, delta) => $emit('adjust-qty', item, delta)"
      @drop-to-chat="(inv) => $emit('drop-to-chat', inv)"
      @split-stack="(inv) => $emit('split-stack', inv)"
      @open-detail="(item) => $emit('open-detail', item)"
      @sell-item="(item) => $emit('sell-item', item)"
      @reorder="(items) => $emit('reorder', items)"
    />

    <!-- Custom containers -->
    <ContainerSection
      v-for="c in customContainers"
      :key="c.id"
      :label="c.name"
      location="container"
      :container="c"
      :container-id="c.id"
      :sellable="true"
      :items="itemsInContainer(c.id)"
      :weight="containerWeight(c.id)"
      :all-containers="allContainers"
      :all-items="allItems"
      :resolved-member-id="resolvedMemberId ?? null"
      :removable="true"
      class="mt-2"
      @add="(name, itemId) => $emit('add-to-location', 'container', c.id, name, itemId)"
      @move="(item, loc, cid) => $emit('move', item, loc, cid)"
      @remove="(id) => $emit('remove', id)"
      @remove-container="$emit('remove', c.id)"
      @adjust-qty="(item, delta) => $emit('adjust-qty', item, delta)"
      @drop-to-chat="(inv) => $emit('drop-to-chat', inv)"
      @split-stack="(inv) => $emit('split-stack', inv)"
      @open-detail="(item) => $emit('open-detail', item)"
      @sell-item="(item) => $emit('sell-item', item)"
      @reorder="(items) => $emit('reorder', items)"
    />
  </div>

  <!-- ═══ STORED (owned but not on person) ═══ -->
  <div>
    <p class="text-label-lg font-semibold text-muted-foreground mb-2">
      Stored Elsewhere
    </p>
    <div class="rounded-lg border border-border bg-card overflow-hidden min-h-10">
      <VueDraggable
        v-model="localStoredItems"
        group="inventory"
        handle=".drag-handle"
        :animation="150"
        @add="onStoredAdd"
      >
        <ItemRow
          v-for="item in localStoredItems"
          :key="item.id"
          :item="item"
          :all-containers="allContainers"
          :sellable="true"
          :weight-per-unit="weightPerUnit(item)"
          @remove="(id) => $emit('remove', id)"
          @adjust-qty="(item, delta) => $emit('adjust-qty', item, delta)"
          @drop-to-chat="(inv) => $emit('drop-to-chat', inv)"
          @split-stack="(inv) => $emit('split-stack', inv)"
          @open-detail="(item) => $emit('open-detail', item)"
          @sell-item="(item) => $emit('sell-item', item)"
        />
      </VueDraggable>
      <p v-if="!localStoredItems.length" class="px-4 py-3 text-body text-muted-foreground italic">
        Nothing stored away.
      </p>
    </div>
  </div>

  <!-- ═══ PARTY STASH ═══ -->
  <div>
    <p class="text-label-lg font-semibold text-muted-foreground mb-2">
      Party Stash
    </p>
    <div class="rounded-lg border border-border bg-card overflow-hidden min-h-10">
      <VueDraggable
        v-model="localStashItems"
        group="inventory"
        handle=".drag-handle"
        :animation="150"
        @add="onStashAdd"
      >
        <ItemRow
          v-for="item in localStashItems"
          :key="item.id"
          :item="item"
          :show-carrier="true"
          :party-members="partyMembers"
          :all-containers="allContainers"
          :weight-per-unit="weightPerUnit(item)"
          @remove="(id) => $emit('remove', id)"
          @adjust-qty="(item, delta) => $emit('adjust-qty', item, delta)"
          @drop-to-chat="(inv) => $emit('drop-to-chat', inv)"
          @split-stack="(inv) => $emit('split-stack', inv)"
          @open-detail="(item) => $emit('open-detail', item)"
        />
      </VueDraggable>
      <p v-if="!localStashItems.length" class="px-4 py-3 text-body text-muted-foreground italic">
        The party stash is empty.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import { IconAdd } from '@/lib/icons';
import type { PartyInventoryItem, InventoryLocation } from '@/types/inventory.types';
import type { PartyMember } from '@/types/party.types';
import type { Item } from '@/types/item.types';
import ContainerSection from '@/components/inventory/ContainerSection.vue';
import ItemRow from '@/components/inventory/ItemRow.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppInput from '@/components/common/AppInput.vue';

const {
  backpackItems,
  backpackWeight,
  beltItems,
  beltWeight,
  customContainers,
  storedItems,
  partyStash,
  partyMembers,
  allContainers,
  allItems,
  resolvedMemberId,
  showContainerPicker,
  containerPickerSearch,
  containerCandidates,
  itemsInContainer,
  containerWeight,
  weightPerUnit,
} = defineProps<{
  backpackItems: PartyInventoryItem[];
  backpackWeight: number;
  beltItems: PartyInventoryItem[];
  beltWeight: number;
  customContainers: PartyInventoryItem[];
  storedItems: PartyInventoryItem[];
  partyStash: PartyInventoryItem[];
  partyMembers: PartyMember[];
  allContainers: PartyInventoryItem[];
  allItems: Item[];
  resolvedMemberId: string | null | undefined;
  showContainerPicker: boolean;
  containerPickerSearch: string;
  containerCandidates: PartyInventoryItem[];
  itemsInContainer: (cid: string) => PartyInventoryItem[];
  containerWeight: (cid: string) => number;
  weightPerUnit: (inv: PartyInventoryItem) => number;
}>();

interface SortAddEvent { newIndex?: number; }

const emit = defineEmits<{
  'toggle-container-picker': [];
  'close-container-picker': [];
  'update-container-search': [value: string];
  'promote-container': [item: PartyInventoryItem];
  'add-to-location': [location: InventoryLocation, containerId: string | null, name: string, itemId: string | null];
  'move': [item: PartyInventoryItem, location: InventoryLocation | 'stash', containerId: string | null];
  'remove': [id: string];
  'adjust-qty': [item: PartyInventoryItem, delta: number];
  'drop-to-chat': [inv: PartyInventoryItem];
  'split-stack': [inv: PartyInventoryItem];
  'open-detail': [item: PartyInventoryItem];
  'sell-item': [item: PartyInventoryItem];
  'reorder': [items: PartyInventoryItem[]];
}>();

// Local drag-and-drop mirror refs for non-ContainerSection sections
const localStoredItems = ref<PartyInventoryItem[]>([]);
watch(
  () => storedItems,
  (v) => { localStoredItems.value = [...v]; },
  { immediate: true },
);

const localStashItems = ref<PartyInventoryItem[]>([]);
watch(
  () => partyStash,
  (v) => { localStashItems.value = [...v]; },
  { immediate: true },
);

function onStoredAdd(event: SortAddEvent) {
  const item = localStoredItems.value[event.newIndex ?? 0];
  if (item) emit('move', item, 'stored', null);
}

function onStashAdd(event: SortAddEvent) {
  const item = localStashItems.value[event.newIndex ?? 0];
  if (item) emit('move', item, 'stash', null);
}

// Bridges the container-picker search prop/emit pair into a two-way model for
// AppInput, which requires v-model — same shape as any other props+emit field.
const containerSearchModel = computed({
  get: () => containerPickerSearch,
  set: (value: string) => emit('update-container-search', value),
});
</script>
