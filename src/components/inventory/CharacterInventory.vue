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
        :doll="doll"
        :member-name="member?.name ?? 'Character'"
        :action="dollControl"
        :is-ask-pending="isDollAskPending"
        :has-portrait="!!member?.portrait_url"
        :is-making-doll="isMakingDoll"
        :doll-error="dollError"
        @open-slot="openSlot"
        @open-detail="openDetail"
        @make-doll="onMakeDoll"
        @ask-doll="onAskDoll"
        @withdraw-doll="onWithdrawDoll"
      />
      <PlayerCoinPurse
        :has-member="!!member"
        :member-coins="memberCoins"
        :show-coin-drop="showCoinDrop"
        :coin-drop="coinDrop"
        :coin-drop-has-value="coinDropHasValue"
        :coin-drop-over-limit="coinDropOverLimit"
        :show-coin-give="showCoinGive"
        :coin-give="coinGive"
        :coin-give-to="coinGiveTo"
        :coin-give-recipients="coinGiveRecipients"
        :coin-give-can-send="coinGiveCanSend"
        :coin-give-leaves="coinGiveLeaves"
        :coin-give-label="coinGiveLabel"
        @set-currency="setCurrency"
        @open-drop="openCoinDrop"
        @cancel-drop="showCoinDrop = false"
        @submit-drop="submitCoinDrop"
        @update-drop="(key, val) => { coinDrop[key] = val }"
        @open-give="openCoinGive"
        @cancel-give="showCoinGive = false"
        @submit-give="submitCoinGive"
        @update-give="(key, val) => { coinGive[key] = val }"
        @update-give-to="(id) => { coinGiveTo = id }"
      />
    </div>

    <!-- ═══ CARRY WEIGHT ═══ -->
    <PlayerCarryWeight
      :has-member="!!member"
      :burden-picture="burdenDollPicture"
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
      :capacity-draft="capacityDraft"
      :has-capacity-override="member?.carry_capacity_override != null"
      :capacity-override="member?.carry_capacity_override ?? null"
      @open-capacity="openCapacityEdit"
      @save-capacity="onSaveCapacity"
      @reset-capacity="resetCapacity"
      @cancel-capacity="editingCapacity = false"
      @update-capacity-draft="(v) => { capacityDraft = v }"
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
      :show-stash="showStash"
      :party-members="partyMembers ?? []"
      :all-containers="allContainers"
      :all-items="allItems"
      :catalogue="catalogue ?? []"
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
      @use-as-item="makePlainItem"
      @add-to-location="addToLocation"
      @move="moveItem"
      @give="giveItem"
      @remove="removeItem"
      @adjust-qty="adjustQty"
      @drop-to-chat="dropItemToChat"
      @split-stack="splitStack"
      @open-detail="openDetail"
      @sell-item="openDetailWithSell"
      @reorder="handleReorder"
    />

    <p v-if="!showStash" class="text-body text-muted-foreground">
      Party stash · {{ partyStash.length }} {{ partyStash.length === 1 ? "thing" : "things" }}
      <RouterLink to="/party" class="text-primary hover:opacity-80">Open on the Party page →</RouterLink>
    </p>

    <!-- ═══ ADD ITEM (floating form) ═══ -->
    <PlayerAddItemPanel
      :all-items="catalogue ?? []"
      @submit="addItem"
    />

    <!-- Item detail panel -->
    <ItemDetailPanel
      ref="detailPanel"
      :inv="selectedInv"
      :vault-item="selectedVaultItem"
      :attuned-count="attunedItems.length"
      :can-identify="auth.isDM && !appUi.dmPreviewMode"
      :equip-options="selectedEquipOptions"
      @close="selectedInv = null"
      @unequip="unequipOpenItem"
      @equip="equipSelected"
      @drop-to-chat="dropSelectedToChat"
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
import { ref, computed, nextTick } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useAppUiStore } from "@/stores/ui/app";
import { useParty } from "@/composables/party/useParty";
import { provideCharacterRuleset } from "@/composables/rules/useRuleset";
import { useDollArt } from "@/composables/party/useDollArt";
import { burdenPicture } from "@/lib/paperDoll/dollStack";
import { dollAction } from "@/lib/paperDoll/dollAction";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useCharacterDoll } from "@/composables/party/useCharacterDoll";
import { useCampaignStore } from "@/stores/campaign";
import { usePartyInventory } from "@/composables/items/usePartyInventory";
import { usePlayerItemProjection } from "@/composables/items/useItems";
import { usePlayerItemPicker } from "@/composables/items/usePlayerItemPicker";
import { useStoredItemRefs } from "@/composables/items/useStoredItemRefs";
import { useToast } from "@/composables/useToast";
import { useInventorySlots } from "@/composables/items/useInventorySlots";
import { useInventoryMutations } from "@/composables/items/useInventoryMutations";
import { useGiveInventoryItem } from "@/composables/items/useGiveInventory";
import { useCharacterPurse } from "@/composables/items/useCharacterPurse";
import { inventoryItemRef } from "@/lib/itemRef";
import { extradimensionalCheck, itemWeightMap, packSlices, packWeights, stashRows } from "@/lib/inventory/pack";
import { equipSlotOptions, type EquipOption } from "@/components/inventory/itemDetailSummary";
import { inventoryItemWeight, inventoryItemWeightPerUnit } from "@/rules/inventoryWeight";
import type { InventorySlot, PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import type { PartyMember } from "@/types/party.types";
import ItemDetailPanel from "@/components/inventory/ItemDetailPanel.vue";
import PlayerPaperDoll from "@/components/player/PlayerPaperDoll.vue";
import PlayerCoinPurse from "@/components/player/PlayerCoinPurse.vue";
import PlayerCarryWeight from "@/components/player/PlayerCarryWeight.vue";
import PlayerInventoryGrid from "@/components/player/PlayerInventoryGrid.vue";
import PlayerAddItemPanel from "@/components/player/PlayerAddItemPanel.vue";
import PlayerSlotEquipModal from "@/components/player/PlayerSlotEquipModal.vue";

/**
 * One character's pack: paper doll, purse, carry weight, belt, backpack, containers and
 * the party stash. The player's own Inventory page mounts it, and so does the DM's
 * Inventory tab on the character page (without the stash, which the Party page shows
 * for the whole party).
 */
const { memberId, showStash = true } = defineProps<{
  memberId: string | null;
  showStash?: boolean;
}>();

const auth = useAuthStore();
const appUi = useAppUiStore();
const { data: partyMembers } = useParty();
const { data: inventory } = usePartyInventory();
// `catalogue` is what the add pickers offer, slim (#972); `allItems` is what a carried row
// resolves in (#961): the player's projection plus the library ids read by id, so a
// character keeps its weight and details after an edition or book change.
const { data: catalogue } = usePlayerItemPicker();
const { data: projection } = usePlayerItemProjection();
const { items: allItems } = useStoredItemRefs(
  () => (inventory.value ?? []).map(inventoryItemRef),
  projection,
);
const toast = useToast();

const resolvedMemberId = computed(() => memberId);
const member = computed<PartyMember | null>(
  () => partyMembers.value?.find((m) => m.id === memberId) ?? null,
);

// ── Inventory slices and weight ────────────────────────────────────────────────
const slices = computed(() => packSlices(inventory.value ?? [], memberId));
const myItems = computed(() => slices.value.items);
const partyStash = computed(() => stashRows(inventory.value ?? []));
const equippedItems = computed(() => slices.value.equipped);
const otherEquipped = computed(() => slices.value.otherEquipped);
const beltItems = computed(() => slices.value.belt);
const backpackItems = computed(() => slices.value.backpack);
const mergedStoredItems = computed(() => slices.value.stored);
const attunedItems = computed(() => slices.value.attuned);
const customContainers = computed(() => slices.value.containers);
const allContainers = customContainers;
const itemsInContainer = (cid: string) => slices.value.itemsIn(cid);

const weightMap = computed(() => itemWeightMap(allItems.value));
const invWeight = (inv: PartyInventoryItem) => inventoryItemWeight(inv, weightMap.value);
const invWeightPerUnit = (inv: PartyInventoryItem) => inventoryItemWeightPerUnit(inv, weightMap.value);

const weights = computed(() =>
  packWeights(slices.value, invWeight, extradimensionalCheck(allItems.value)),
);
const equippedWeight = computed(() => weights.value.equipped);
const beltWeight = computed(() => weights.value.belt);
const backpackWeight = computed(() => weights.value.backpack);
const totalCarriedWeight = computed(() => weights.value.total);
const containerWeight = (cid: string) => weights.value.containerContents.get(cid) ?? 0;

// ── Purse, capacity, burden ────────────────────────────────────────────────────
const {
  powerfulBuild,
  effectiveCapacity,
  carryPercent,
  carryColor,
  encumberedThreshold,
  heavyThreshold,
  encumberedMarkerPct,
  heavyMarkerPct,
  burdenLevel,
  editingCapacity,
  capacityDraft,
  openCapacityEdit,
  onSaveCapacity,
  resetCapacity,
  memberCoins,
  setCurrency,
  showCoinDrop,
  coinDrop,
  coinDropHasValue,
  coinDropOverLimit,
  openCoinDrop,
  submitCoinDrop,
  showCoinGive,
  coinGive,
  coinGiveTo,
  coinGiveRecipients,
  coinGiveCanSend,
  coinGiveLeaves,
  coinGiveLabel,
  openCoinGive,
  submitCoinGive,
} = useCharacterPurse(member, totalCarriedWeight);

// ── Paper doll (#975) ──────────────────────────────────────────────────────────
const campaign = useCampaignStore();
const { dollFor } = useDollArt(() => (member.value ? [member.value] : []));
const doll = computed(() => (member.value ? dollFor(member.value) : null));
const burdenDollPicture = computed(() =>
  doll.value ? burdenPicture(doll.value.art, doll.value.outfit, burdenLevel.value) : null,
);
const {
  isGenerating: isMakingDoll,
  error: dollError,
  make: makeDoll,
  ask: askDoll,
  clearAsk: clearDollAsk,
  isAskPending,
} = useCharacterDoll();
const { affordable: canAfford, costOf } = useAiCredits();
// A player with credits makes their own doll; one without asks their DM, who
// draws it from theirs. A DM may draw any character's doll unasked.
const dollControl = computed(() => {
  const m = member.value;
  if (!m || !campaign.isAiEnabled) return dollAction({ isOwner: false, isDm: false, affordable: true, asked: false, hasDoll: false });
  return dollAction({
    isOwner: m.owner_user_id !== null && m.owner_user_id === auth.user?.id,
    isDm: auth.isDM,
    affordable: canAfford(costOf("character_doll")),
    asked: !!m.doll_requested_at,
    hasDoll: doll.value?.art.source === "character",
  });
});
const isDollAskPending = computed(() => (member.value ? isAskPending(member.value.id) : false));
/** Start generation for the seated character, if present; progress and errors live in useCharacterDoll. */
function onMakeDoll() {
  if (member.value) void makeDoll(member.value.id);
}
/** Ask the DM for a doll for the seated character, if present. */
function onAskDoll() {
  if (member.value) void askDoll(member.value.id);
}
/** Clear the seated character's doll request, if present. */
function onWithdrawDoll() {
  if (member.value) void clearDollAsk(member.value.id);
}

// Items are table rules: the item pickers and the weapon block read the campaign's
// edition when this character is seated here, and fall back to the character's own when
// it is not. Weapon mastery is a build rule and always reads the character's edition.
// The scope is provided for those two reads; slots and mutations read no edition.
provideCharacterRuleset(() => member.value);

// ── Giving a row to another character (#1112) ──────────────────────────────────
// Always the RPC: a player may not write another pack with a plain update.
const { mutate: giveInventoryItem } = useGiveInventoryItem();
function giveItem(item: PartyInventoryItem, toMemberId: string, quantity: number | null) {
  giveInventoryItem({ itemId: item.id, toMemberId, ...(quantity !== null ? { quantity } : {}) });
}

// ── Item detail panel ──────────────────────────────────────────────────────────
const selectedInv = ref<PartyInventoryItem | null>(null);
const detailPanel = ref<InstanceType<typeof ItemDetailPanel> | null>(null);

const selectedVaultItem = computed<Item | null>(() => {
  const ref = selectedInv.value ? inventoryItemRef(selectedInv.value) : null;
  if (!ref) return null;
  return allItems.value.find((it) => it.id === ref) ?? null;
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

// Where the open item can be equipped. Only the player's own carried items, never the
// party stash or an item already worn (that one offers Unequip instead).
const selectedEquipOptions = computed<EquipOption[]>(() => {
  const inv = selectedInv.value;
  if (!inv || inv.location === "equipped" || !inv.carried_by || inv.carried_by !== resolvedMemberId.value) return [];
  return equipSlotOptions(
    selectedVaultItem.value,
    (slot) => slotItem(slot) !== null,
    (slot) => candidatesForSlot(slot).some((c) => c.id === inv.id),
  );
});

async function unequipOpenItem() {
  try {
    await unequipSelected();
  } catch (error) {
    toast.error(toast.fromError(error, "Couldn't unequip that."));
  }
}

async function equipSelected(slot: InventorySlot) {
  const inv = selectedInv.value;
  if (!inv) return;
  try {
    await equipToSlot(inv, slot);
    selectedInv.value = null;
  } catch (error) {
    toast.error(toast.fromError(error, "Couldn't equip that."));
  }
}

async function dropSelectedToChat() {
  const inv = selectedInv.value;
  if (!inv) return;
  try {
    await dropItemToChat(inv);
  } catch (error) {
    toast.error(toast.fromError(error, "Couldn't drop that to the chat."));
    return;
  }
  // dropItemToChat asks first and removes the row only on yes: close the panel
  // only if the item is actually gone, so a cancelled prompt leaves it open.
  if (!(inventory.value ?? []).some((i) => i.id === inv.id)) selectedInv.value = null;
}

// ── Mutation composable ────────────────────────────────────────────────────────
const {
  showContainerPicker,
  containerPickerSearch,
  containerCandidates,
  promoteToContainer,
  makePlainItem,
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
  catalogue: computed(() => catalogue.value),
  partyMembers: computed(() => partyMembers.value),
  selectedInv,
});
</script>
