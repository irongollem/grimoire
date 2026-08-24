<template>
  <div class="space-y-6 pb-8">
    <!-- ═══ TOP ROW: Paper doll + Coin purse ═══ -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <PlayerPaperDoll
        :equipped-items="equippedItems"
        :other-equipped="otherEquipped"
        :attuned-items="attunedItems"
        :equipped-weight="equippedWeight"
        :has-member="!!member"
        :can-equip-slot="slotCanEquip"
        @open-slot="openSlot"
        @open-detail="openDetail"
      />
      <PlayerCoinPurse
        :has-member="!!member"
        :member-coins="memberCoins"
        :show-coin-drop="showCoinDrop"
        :coin-drop="coinDrop"
        :coin-drop-has-value="coinDropHasValue"
        :coin-drop-over-limit="coinDropOverLimit"
        @set-currency="setCurrency"
        @open-drop="openCoinDrop"
        @cancel-drop="showCoinDrop = false"
        @submit-drop="submitCoinDrop"
        @update-drop="(key, val) => { coinDrop[key] = val }"
      />
    </div>

    <!-- ═══ CARRY WEIGHT ═══ -->
    <PlayerCarryWeight
      :has-member="!!member"
      :burden-level="burdenLevel"
      :powerful-build="powerfulBuild"
      :total-carried-weight="totalCarriedWeight"
      :effective-capacity="effectiveCapacity"
      :carry-percent="carryPercent"
      :carry-color="carryColor"
      :encumbered-threshold="encumberedThreshold"
      :heavy-threshold="heavyThreshold"
      :encumbered-marker-pct="encumberedMarkerPct"
      :heavy-marker-pct="heavyMarkerPct"
      :editing-capacity="editingCapacity"
      :capacity-draft="capacityDraftRef"
      :has-capacity-override="member?.carry_capacity_override != null"
      :capacity-override="member?.carry_capacity_override ?? null"
      @open-capacity="openCapacityEdit"
      @save-capacity="onSaveCapacity"
      @reset-capacity="resetCapacity"
      @cancel-capacity="editingCapacity = false"
      @update-capacity-draft="onUpdateCapacityDraft"
    />

    <!-- ═══ INVENTORY GRID (containers + stored + stash) ═══ -->
    <PlayerInventoryGrid
      :backpack-items="backpackItems"
      :backpack-weight="backpackWeight"
      :belt-items="beltItems"
      :belt-weight="beltWeight"
      :custom-containers="customContainers"
      :stored-items="mergedStoredItems"
      :party-stash="partyStash"
      :party-members="partyMembers ?? []"
      :all-containers="allContainers"
      :all-items="allItems ?? []"
      :resolved-member-id="resolvedMemberId"
      :show-container-picker="showContainerPicker"
      :container-picker-search="containerPickerSearch"
      :container-candidates="containerCandidates"
      :items-in-container="itemsInContainer"
      :container-weight="containerWeight"
      :weight-per-unit="invWeightPerUnit"
      @toggle-container-picker="showContainerPicker = !showContainerPicker; containerPickerSearch = ''"
      @close-container-picker="showContainerPicker = false"
      @update-container-search="(v) => { containerPickerSearch = v }"
      @promote-container="promoteToContainer"
      @add-to-location="addToLocation"
      @move="moveItem"
      @remove="removeItem"
      @adjust-qty="adjustQty"
      @drop-to-chat="dropItemToChat"
      @split-stack="splitStack"
      @open-detail="openDetail"
      @sell-item="openDetailWithSell"
      @reorder="handleReorder"
    />

    <!-- ═══ ADD ITEM (floating form) ═══ -->
    <PlayerAddItemPanel
      :all-items="allItems ?? []"
      @submit="addItem"
    />

    <!-- Item detail panel -->
    <ItemDetailPanel
      ref="detailPanel"
      :inv="selectedInv"
      :vault-item="selectedVaultItem"
      :attuned-count="attunedItems.length"
      :can-identify="auth.isDM && !ui.dmPreviewMode"
      @close="selectedInv = null"
      @unequip="unequipSelected"
      @sell="handleSell"
      @consume="handleConsume"
    />

    <!-- Slot assignment modal -->
    <PlayerSlotEquipModal
      :slot="slotModal"
      :slot-item="slotModal ? slotItem(slotModal) : null"
      :candidates="slotModal ? candidatesForSlot(slotModal) : []"
      @equip="(item) => slotModal && equipToSlot(item, slotModal)"
      @unequip="slotModal && unequipSlot(slotModal)"
      @close="slotModal = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, nextTick } from "vue";
import { useRoute } from "vue-router";
import { COINS, type CoinKey } from "@/rules/currency";
import {
  parseWeightLb,
  hasPowerfulBuild,
  carryCapacity,
} from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useParty, useUpdatePartyMember } from "@/composables/useParty";
import { useSpeciesNameMap } from "@/composables/useSpecies";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { usePlayerVisibleItems } from "@/composables/useItems";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { useInventorySlots } from "@/composables/useInventorySlots";
import { useInventoryMutations } from "@/composables/useInventoryMutations";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import type { PartyMember } from "@/types/party.types";
import ItemDetailPanel from "@/components/inventory/ItemDetailPanel.vue";
import PlayerPaperDoll from "@/components/play/PlayerPaperDoll.vue";
import PlayerCoinPurse from "@/components/play/PlayerCoinPurse.vue";
import PlayerCarryWeight from "@/components/play/PlayerCarryWeight.vue";
import PlayerInventoryGrid from "@/components/play/PlayerInventoryGrid.vue";
import PlayerAddItemPanel from "@/components/play/PlayerAddItemPanel.vue";
import PlayerSlotEquipModal from "@/components/play/PlayerSlotEquipModal.vue";

// ── Stores / composables ───────────────────────────────────────────────────────
const auth = useAuthStore();
const ui = useUiStore();
const { data: partyMembers } = useParty();
const speciesNameMap = useSpeciesNameMap();
const { data: inventory } = usePartyInventory();
const { data: allItems } = usePlayerVisibleItems();
const { mutateAsync: updatePartyMember } = useUpdatePartyMember();
const { sendCurrencyDrop } = useCampaignMessages();

/**
 * Whose inventory this page is showing.
 *
 * `?memberId=` first, because that is how a DM opens one character's
 * inventory from a DM surface — the router guard admits them on exactly that
 * basis (`dmManagingMember` in `src/router/index.ts:52`), and
 * `PlayerLevelUpView.vue:36` and `useCharacterCreationForm.ts:205` already
 * read it the same way.
 *
 * This view did not, which made the guard's exception a door onto the wrong
 * room: a DM following `/play/inventory?memberId=…` passed the check and then
 * saw their own (empty) player context instead of that character's bag. Found
 * while wiring #764's cursed-items widget, which needs exactly that link,
 * since this page is the only place `curse_revealed` can be toggled.
 *
 * Gated on `auth.isDM` deliberately: the param must not let a *player* read
 * another character's inventory by editing the URL. Every read here is still
 * RLS-scoped, so this is defence in depth rather than the only lock.
 */
const route = useRoute();
const resolvedMemberId = computed(() => {
  const requested = route.query.memberId;
  if (auth.isDM && typeof requested === "string" && requested !== "") return requested;
  return ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId;
});

const member = computed<PartyMember | null>(
  () =>
    partyMembers.value?.find((m) => m.id === resolvedMemberId.value) ?? null,
);

// ── Inventory slices ───────────────────────────────────────────────────────────
const myItems = computed(() =>
  (inventory.value ?? []).filter(
    (i) => i.carried_by === resolvedMemberId.value,
  ),
);
const partyStash = computed(() =>
  (inventory.value ?? []).filter((i) => i.carried_by === null),
);
const equippedItems = computed(() =>
  myItems.value.filter((i) => i.location === "equipped"),
);
const beltItems = computed(() =>
  myItems.value.filter((i) => i.location === "belt" && !i.is_container),
);
const backpackItems = computed(() =>
  myItems.value.filter((i) => i.location === "backpack" && !i.is_container),
);
const storedItems = computed(() =>
  myItems.value.filter((i) => i.location === "stored" && !i.is_container),
);
const orphanedItems = computed(() => {
  const containerIds = new Set(customContainers.value.map((c) => c.id));
  return myItems.value.filter(
    (i) =>
      i.location === "container" &&
      !i.is_container &&
      !containerIds.has(i.container_id ?? ""),
  );
});
const mergedStoredItems = computed(() => [...storedItems.value, ...orphanedItems.value]);
const attunedItems = computed(() => myItems.value.filter((i) => i.is_attuned));
const customContainers = computed(() =>
  myItems.value.filter((i) => i.is_container),
);
const allContainers = computed(() => customContainers.value);
const otherEquipped = computed(() =>
  equippedItems.value.filter((i) => i.slot === "other" || !i.slot),
);

function itemsInContainer(cid: string) {
  return myItems.value.filter(
    (i) => i.location === "container" && i.container_id === cid,
  );
}

// ── Weight helpers ─────────────────────────────────────────────────────────────
const itemWeightMap = computed((): Map<string, number> => {
  const m = new Map<string, number>();
  for (const it of allItems.value ?? []) {
    m.set(it.id, parseWeightLb(it.weight));
  }
  return m;
});

function invWeight(inv: PartyInventoryItem): number {
  if (!inv.item_id) return 0;
  return (itemWeightMap.value.get(inv.item_id) ?? 0) * inv.quantity;
}

function invWeightPerUnit(inv: PartyInventoryItem): number {
  if (!inv.item_id) return 0;
  return itemWeightMap.value.get(inv.item_id) ?? 0;
}

function sumWeight(items: PartyInventoryItem[]): number {
  return Math.round(items.reduce((acc, i) => acc + invWeight(i), 0) * 10) / 10;
}

const equippedWeight = computed(() => sumWeight(equippedItems.value));
const beltWeight = computed(() => sumWeight(beltItems.value));
const backpackWeight = computed(() => sumWeight(backpackItems.value));

const containerWeightMap = computed((): Map<string, number> => {
  const m = new Map<string, number>();
  for (const c of customContainers.value) {
    const vaultItem = allItems.value?.find((it) => it.id === c.item_id);
    const isExtradimensional =
      vaultItem?.tags.includes("extradimensional") ?? false;
    m.set(c.id, isExtradimensional ? 0 : sumWeight(itemsInContainer(c.id)));
  }
  return m;
});

function containerWeight(cid: string) {
  return containerWeightMap.value.get(cid) ?? 0;
}

// Only containers actually carried count toward encumbrance — a container set
// aside as "stored" (and its contents) should not.
const carriedContainers = computed(() =>
  customContainers.value.filter((c) => c.location !== "stored"),
);

const totalCarriedWeight = computed(
  () =>
    Math.round(
      (equippedWeight.value +
        beltWeight.value +
        backpackWeight.value +
        carriedContainers.value.reduce((acc, c) => {
          // Contents of every carried container (0 for an extradimensional bag).
          let w = containerWeight(c.id);
          // Add the container's OWN weight (e.g. a 25-lb chest) only when it sits
          // DIRECTLY in the pack/belt — an equipped container's own weight is
          // already in equippedWeight, and a nested container's own weight is
          // already inside its parent's contents, so counting it here too would
          // double-count.
          if (c.location === "backpack" || c.location === "belt") w += invWeight(c);
          return acc + w;
        }, 0)) *
        10,
    ) / 10,
);

// ── Carry capacity ─────────────────────────────────────────────────────────────
const memberSpeciesName = computed(() => speciesNameMap.value.get(member.value?.species_id ?? '') ?? null);
const powerfulBuild = computed(() => hasPowerfulBuild(memberSpeciesName.value));

const effectiveCapacity = computed(() =>
  carryCapacity(
    member.value?.str ?? 10,
    memberSpeciesName.value,
    member.value?.carry_capacity_override ?? null,
  ),
);

const carryPercent = computed(() =>
  effectiveCapacity.value > 0
    ? Math.min(100, (totalCarriedWeight.value / effectiveCapacity.value) * 100)
    : 0,
);

const carryColor = computed(() => {
  // Thresholds match the burden bands (proportional thirds) so the bar colour and
  // the burden label never disagree at a boundary.
  if (carryPercent.value >= 100) return "bg-destructive";
  if (carryPercent.value >= 66.67) return "bg-amber-500";
  if (carryPercent.value >= 33.33) return "bg-amber-400/70";
  return "bg-green-500";
});

const encumberedThreshold = computed(() => {
  if (!member.value) return 0;
  const mult = powerfulBuild.value ? 2 : 1;
  return member.value.str * 5 * mult;
});

const heavyThreshold = computed(() => {
  if (!member.value) return 0;
  const mult = powerfulBuild.value ? 2 : 1;
  return member.value.str * 10 * mult;
});

// The encumbrance bands are proportional thirds of the effective capacity (which
// honors carry_capacity_override), so the markers sit at fixed 1/3 and 2/3 of the
// bar — deriving them from the raw str thresholds misplaced them under an override.
const encumberedMarkerPct = computed(() => 33.33);
const heavyMarkerPct = computed(() => 66.67);

type BurdenLevel =
  | "unencumbered"
  | "encumbered"
  | "heavily_encumbered"
  | "over_encumbered";

const burdenLevel = computed((): BurdenLevel => {
  if (!member.value) return "unencumbered";
  // Base the label on the SAME effective capacity the bar uses (honoring
  // carry_capacity_override) so an override no longer shows a half-full bar with
  // an "Over Encumbered" label. Bands are proportional thirds of capacity.
  const p = carryPercent.value;
  if (p >= 100) return "over_encumbered";
  if (p >= 66.67) return "heavily_encumbered";
  if (p >= 33.33) return "encumbered";
  return "unencumbered";
});

// capacity override edit
const editingCapacity = ref(false);
const capacityDraftRef = ref("");

function openCapacityEdit() {
  capacityDraftRef.value = member.value?.carry_capacity_override ?? "";
  editingCapacity.value = true;
}

async function saveCapacity() {
  if (!member.value) return;
  const val = capacityDraftRef.value.trim() || null;
  await updatePartyMember({
    id: member.value.id,
    update: { carry_capacity_override: val },
  });
  editingCapacity.value = false;
}

function resetCapacity() {
  if (!member.value) return;
  void updatePartyMember({
    id: member.value.id,
    update: { carry_capacity_override: null },
  });
  editingCapacity.value = false;
}

function onSaveCapacity(draft: string) {
  capacityDraftRef.value = draft;
  void saveCapacity();
}

function onUpdateCapacityDraft(v: string) {
  capacityDraftRef.value = v;
}

// ── Currency ───────────────────────────────────────────────────────────────────
const memberCoins = computed((): Record<CoinKey, number> => ({
  pp: member.value?.pp ?? 0,
  gp: member.value?.gp ?? 0,
  ep: member.value?.ep ?? 0,
  sp: member.value?.sp ?? 0,
  cp: member.value?.cp ?? 0,
}));

function setCurrency(key: CoinKey, value: number) {
  if (!member.value) return;
  void updatePartyMember({ id: member.value.id, update: { [key]: value } });
}

// ── Coin drop form ─────────────────────────────────────────────────────────────
const showCoinDrop = ref(false);
const coinDrop = reactive<Record<CoinKey, number>>({
  pp: 0, gp: 0, ep: 0, sp: 0, cp: 0,
});

const coinDropHasValue = computed(() => COINS.some((c) => coinDrop[c.key] > 0));
const coinDropOverLimit = computed(() =>
  member.value
    ? COINS.some((c) => coinDrop[c.key] > (member.value![c.key] ?? 0))
    : false,
);

function openCoinDrop() {
  COINS.forEach((c) => { coinDrop[c.key] = 0; });
  showCoinDrop.value = true;
}

async function submitCoinDrop() {
  if (!member.value || !coinDropHasValue.value || coinDropOverLimit.value) return;
  // Clamp to non-negative integers up front and deduct exactly what is dropped —
  // sendCurrencyDrop floors internally, so deducting the raw (fractional) input
  // would destroy coin (or debit for a drop that floored to nothing and never sent).
  const coin = (n: number) => Math.max(0, Math.floor(n || 0));
  const clamped: Record<CoinKey, number> = {
    pp: coin(coinDrop.pp), gp: coin(coinDrop.gp), ep: coin(coinDrop.ep), sp: coin(coinDrop.sp), cp: coin(coinDrop.cp),
  };
  if (!COINS.some((c) => clamped[c.key] > 0)) return; // nothing droppable after clamping
  await sendCurrencyDrop(
    clamped.pp, clamped.gp, clamped.ep, clamped.sp, clamped.cp,
    member.value.name ?? undefined,
  );
  for (const c of COINS) {
    if (clamped[c.key] > 0) {
      setCurrency(c.key, Math.max(0, (member.value[c.key] ?? 0) - clamped[c.key]));
    }
  }
  showCoinDrop.value = false;
}

// ── Item detail panel ──────────────────────────────────────────────────────────
const selectedInv = ref<PartyInventoryItem | null>(null);
const detailPanel = ref<InstanceType<typeof ItemDetailPanel> | null>(null);

const selectedVaultItem = computed<Item | null>(() => {
  if (!selectedInv.value?.item_id) return null;
  return (
    allItems.value?.find((it) => it.id === selectedInv.value!.item_id) ?? null
  );
});

function openDetail(inv: PartyInventoryItem) {
  selectedInv.value = inv;
}

async function openDetailWithSell(inv: PartyInventoryItem) {
  selectedInv.value = inv;
  await nextTick();
  detailPanel.value?.openSell();
}

// ── Slot composable ────────────────────────────────────────────────────────────
const {
  slotModal,
  slotItem,
  candidatesForSlot,
  slotCanEquip,
  openSlot,
  unequipSelected,
  equipToSlot,
  unequipSlot,
} = useInventorySlots({ equippedItems, myItems, allItems, selectedInv });

// ── Mutation composable ────────────────────────────────────────────────────────
const {
  showContainerPicker,
  containerPickerSearch,
  containerCandidates,
  promoteToContainer,
  adjustQty,
  moveItem,
  handleReorder,
  removeItem,
  dropItemToChat,
  splitStack,
  addToLocation,
  addItem,
  handleConsume,
  handleSell,
} = useInventoryMutations({
  resolvedMemberId,
  member,
  myItems,
  allItems,
  partyMembers: computed(() => partyMembers.value),
  selectedInv,
});
</script>
