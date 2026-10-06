<template>
  <div class="rounded-lg border border-border bg-card p-4">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <p class="text-label-lg font-semibold text-muted-foreground">
        Equipped
      </p>
      <div v-if="action.control !== 'none' && doll" class="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
        <template v-if="action.control === 'make'">
          <span v-if="action.askedByPlayer" class="text-caption text-ink-caution">Asked by the player</span>
          <GenerationCostBadge v-if="!isMakingDoll" :credits="dollCost" :byok="false" :show-balance="false" />
          <AppButton
            variant="subtle"
            size="xs"
            :label="action.label"
            :loading="isMakingDoll"
            :disabled="!hasPortrait"
            :tooltip="hasPortrait ? undefined : 'Add a portrait first'"
            @click="$emit('make-doll')"
          />
        </template>
        <AppButton
          v-else-if="action.control === 'ask'"
          variant="subtle"
          size="xs"
          label="Ask my DM"
          :loading="isAskPending"
          :disabled="!hasPortrait"
          :tooltip="hasPortrait ? 'Your DM can draw it from their credits' : 'Add a portrait first'"
          @click="$emit('ask-doll')"
        />
        <template v-else>
          <span class="text-caption text-muted-foreground">Your DM has been asked.</span>
          <AppButton
            variant="ghost"
            size="xs"
            label="Withdraw"
            :loading="isAskPending"
            @click="$emit('withdraw-doll')"
          />
        </template>
      </div>
    </div>
    <p v-if="dollError" class="mb-3 text-caption text-destructive">{{ dollError }}</p>
    <!-- The doll in the middle, the worn slots in a column either side, a hairline from each to its place on the body -->
    <div ref="dollRow" class="relative flex items-stretch gap-3">
      <div class="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
        <EquipSlotRow
          v-for="slot in LEFT_SLOTS"
          :key="slot.slot"
          v-bind="wellProps(slot)"
          data-doll-side="left"
          @click="$emit('open-slot', slot.slot)"
          @pointerenter="active = slot.anchor"
          @pointerleave="active = null"
          @focus="active = slot.anchor"
          @blur="active = null"
        />
      </div>

      <DollFigure
        v-if="doll"
        data-doll-figure
        :picture="doll.figure"
        :alt="memberName"
        class="w-24 shrink-0 self-center sm:w-30"
      >
        <div
          v-if="isMakingDoll"
          class="absolute inset-0 z-20 flex items-center justify-center rounded-md bg-card/70"
        >
          <BannerLoader class="h-10" />
        </div>
      </DollFigure>
      <div
        v-else
        class="flex aspect-1/2 w-24 shrink-0 items-center justify-center self-center rounded-md border border-dashed border-border p-3 text-center text-caption text-muted-foreground sm:w-30"
      >
        No character seated here yet
      </div>

      <div class="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
        <EquipSlotRow
          v-for="slot in RIGHT_SLOTS"
          :key="slot.slot"
          v-bind="wellProps(slot)"
          data-doll-side="right"
          @click="$emit('open-slot', slot.slot)"
          @pointerenter="active = slot.anchor"
          @pointerleave="active = null"
          @focus="active = slot.anchor"
          @blur="active = null"
        />
      </div>

      <svg
        v-if="doll && lines.length"
        class="pointer-events-none absolute inset-0 z-10 overflow-visible"
        :width="size.width"
        :height="size.height"
        aria-hidden="true"
      >
        <g v-for="line in lines" :key="line.slot" :class="lineTone(line.slot)">
          <line :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2" stroke="currentColor" stroke-width="1" />
          <circle :cx="line.x2" :cy="line.y2" r="2.5" fill="currentColor" />
        </g>
      </svg>
    </div>

    <!-- Weapon slots + other -->
    <div class="mt-3 grid grid-cols-2 gap-3">
      <div class="space-y-1.5">
        <p class="text-eyebrow text-muted-foreground/60">Weapons</p>
        <EquipSlotRow
          :item="slotItem('main_hand')"
          label="Main hand"
          @click="$emit('open-slot', 'main_hand')"
        />
        <EquipSlotRow
          :item="slotItem('off_hand')"
          label="Off hand"
          @click="$emit('open-slot', 'off_hand')"
        />
      </div>
      <div class="space-y-1.5">
        <p class="text-eyebrow text-muted-foreground/60">Other</p>
        <EquipSlotRow
          v-for="item in otherEquipped"
          :key="item.id"
          :item="item"
          label="Other"
          @click="$emit('open-detail', item)"
        />
        <EquipSlotRow
          :item="null"
          label="Other"
          :empty="otherEquipped.length ? 'Add another item' : 'Empty'"
          @click="$emit('open-slot', 'other')"
        />
      </div>
    </div>

    <p v-if="isMakingDoll" class="mt-3 text-caption italic text-muted-foreground">
      Drawing your doll, about a minute.
    </p>

    <!-- Attunement slots -->
    <div v-if="hasMember" class="mt-2 flex items-center justify-between gap-2">
      <span class="text-label text-muted-foreground/50">ATTUNEMENT</span>
      <div class="flex items-center gap-1.5">
        <div
          v-for="n in 3"
          :key="n"
          class="h-2 w-2 rounded-full border transition-colors"
          :class="
            n <= attunedItems.length
              ? 'bg-primary border-primary'
              : 'bg-muted border-border'
          "
          :title="n <= attunedItems.length ? attunedItems[n - 1]?.name : 'Empty slot'"
        />
        <span class="text-label text-muted-foreground/50">{{ attunedItems.length }}/3</span>
      </div>
    </div>

    <!-- Equipped weight -->
    <p
      v-if="hasMember && equippedWeight > 0"
      class="text-label text-muted-foreground/50 text-right"
    >
      Equipped: {{ formatWeightLb(equippedWeight) }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { formatWeightLb } from '@/lib/utils';
import type { PartyInventoryItem, InventorySlot } from '@/types/inventory.types';
import EquipSlotRow from '@/components/inventory/EquipSlotRow.vue';
import DollFigure from '@/components/party/DollFigure.vue';
import AppButton from '@/components/common/AppButton.vue';
import BannerLoader from '@/components/brand/BannerLoader.vue';
import GenerationCostBadge from '@/components/common/GenerationCostBadge.vue';
import type { DollAction } from '@/lib/paperDoll/dollAction';
import { useAiCredits } from '@/composables/ai/useAiCredits';
import type { MemberDoll } from '@/composables/party/useDollArt';
import { slotAnchors, type SlotAnchorKey } from '@/lib/paperDoll/slotAnchors';
import { useDollLegend } from '@/composables/party/useDollLegend';

const {
  equippedItems,
  otherEquipped,
  attunedItems,
  equippedWeight,
  hasMember,
  canEquipSlot,
  doll,
  memberName,
  action,
  hasPortrait,
  isAskPending,
  isMakingDoll,
  dollError,
} = defineProps<{
  equippedItems: PartyInventoryItem[];
  otherEquipped: PartyInventoryItem[];
  attunedItems: PartyInventoryItem[];
  equippedWeight: number;
  hasMember: boolean;
  canEquipSlot: (slot: InventorySlot) => boolean;
  /** Null when no character is seated: there is nothing to draw. */
  doll: MemberDoll | null;
  memberName: string;
  /** Which doll control this viewer gets (`dollAction`). */
  action: DollAction;
  isAskPending: boolean;
  hasPortrait: boolean;
  isMakingDoll: boolean;
  dollError: string | null;
}>();

defineEmits<{
  'open-slot': [slot: InventorySlot];
  'open-detail': [item: PartyInventoryItem];
  'make-doll': [];
  'ask-doll': [];
  'withdraw-doll': [];
}>();

const { costOf } = useAiCredits();
const dollCost = computed(() => costOf('character_doll'));

const anchors = computed(() => (doll ? slotAnchors(doll.art.layout.anatomy) : null));

interface WornSlot {
  slot: InventorySlot;
  anchor: SlotAnchorKey;
  label: string;
  /** Where the slot is on the body, in the player's words. */
  place: string;
}

const LEFT_SLOTS: WornSlot[] = [
  { slot: 'head', anchor: 'head', label: 'Head', place: 'head' },
  { slot: 'neck', anchor: 'neck', label: 'Neck', place: 'neck' },
  { slot: 'shoulders', anchor: 'shoulders', label: 'Shoulders', place: 'shoulders' },
  { slot: 'body', anchor: 'body', label: 'Body', place: 'body' },
  { slot: 'clothes', anchor: 'clothes', label: 'Clothes', place: 'body' },
];
// Top to bottom in the order their body parts are (waist, then the hanging
// hands, then the fingers), so every legend line runs across, never down past
// its neighbours.
const RIGHT_SLOTS: WornSlot[] = [
  { slot: 'waist', anchor: 'waist', label: 'Waist', place: 'waist' },
  { slot: 'hands', anchor: 'hands', label: 'Gloves', place: 'hands' },
  { slot: 'ring', anchor: 'ring', label: 'Ring', place: 'fingers' },
  { slot: 'feet', anchor: 'feet', label: 'Boots', place: 'feet' },
];

const dollRow = ref<HTMLElement | null>(null);
const active = ref<SlotAnchorKey | null>(null);
const { lines, size, measure } = useDollLegend(dollRow, () => anchors.value);
watch([anchors, () => equippedItems, () => isMakingDoll], () => nextTick(measure), { flush: 'post' });

function wellProps(w: WornSlot) {
  const item = slotItem(w.slot);
  const fits = canEquipSlot(w.slot);
  return {
    item,
    label: w.label,
    place: w.place,
    warn: !item && w.slot === 'clothes' && fits,
    quiet: !item && !fits,
    'data-doll-slot': w.anchor,
  };
}

function lineTone(key: SlotAnchorKey): string {
  if (active.value === key) return 'text-primary';
  return slotItem(key as InventorySlot) ? 'text-primary/60' : 'text-muted-foreground/35';
}

function slotItem(slot: InventorySlot): PartyInventoryItem | null {
  return equippedItems.find((i) => i.slot === slot) ?? null;
}
</script>
