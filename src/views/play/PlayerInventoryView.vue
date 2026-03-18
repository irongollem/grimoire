<template>
  <div class="space-y-6 pb-8">

    <!-- ═══ TOP ROW: Paper doll + Coin purse ═══ -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">

      <!-- Paper doll -->
      <div class="rounded-lg border border-border bg-card p-4">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-3">Equipped</p>
        <div class="flex gap-4">
          <!-- Silhouette -->
          <div class="relative shrink-0 w-24 h-40 select-none">
            <svg viewBox="0 0 80 140" class="w-full h-full text-muted-foreground/20" fill="currentColor">
              <!-- head -->
              <ellipse cx="40" cy="14" rx="11" ry="13" />
              <!-- neck -->
              <rect x="36" y="26" width="8" height="6" rx="2" />
              <!-- torso -->
              <path d="M22 32 Q18 42 20 60 L60 60 Q62 42 58 32 Z" />
              <!-- left arm -->
              <path d="M22 34 Q12 40 10 60 Q10 66 14 66 Q18 66 18 60 L22 44 Z" />
              <!-- right arm -->
              <path d="M58 34 Q68 40 70 60 Q70 66 66 66 Q62 66 62 60 L58 44 Z" />
              <!-- left hand -->
              <ellipse cx="12" cy="68" rx="5" ry="6" />
              <!-- right hand -->
              <ellipse cx="68" cy="68" rx="5" ry="6" />
              <!-- legs -->
              <path d="M20 60 L25 100 L35 100 L40 72 L45 100 L55 100 L60 60 Z" />
              <!-- left boot -->
              <path d="M24 100 L22 120 Q20 126 28 126 Q34 126 34 120 L35 100 Z" />
              <!-- right boot -->
              <path d="M46 100 L45 120 Q45 126 52 126 Q58 126 56 120 L56 100 Z" />
            </svg>

            <!-- Slot buttons overlaid on silhouette -->
            <!-- HEAD -->
            <SlotButton
              style="top: -4px; left: 50%; transform: translateX(-50%)"
              :item="slotItem('head')"
              label="Head"
              @click="openSlot('head')"
            />
            <!-- NECK -->
            <SlotButton
              style="top: 20px; left: 50%; transform: translateX(-50%)"
              :item="slotItem('neck')"
              label="Neck"
              @click="openSlot('neck')"
            />
            <!-- SHOULDERS -->
            <SlotButton
              style="top: 28px; left: -10px"
              :item="slotItem('shoulders')"
              label="Shldr"
              @click="openSlot('shoulders')"
            />
            <!-- BODY -->
            <SlotButton
              style="top: 44px; left: 50%; transform: translateX(-50%)"
              :item="slotItem('body')"
              label="Body"
              @click="openSlot('body')"
            />
            <!-- HANDS -->
            <SlotButton
              style="top: 56px; right: -10px"
              :item="slotItem('hands')"
              label="Gloves"
              @click="openSlot('hands')"
            />
            <!-- RING (left) -->
            <SlotButton
              style="top: 72px; left: -12px"
              :item="slotItem('ring')"
              label="Ring"
              @click="openSlot('ring')"
            />
            <!-- WAIST -->
            <SlotButton
              style="top: 68px; left: 50%; transform: translateX(-50%)"
              :item="slotItem('waist')"
              label="Waist"
              @click="openSlot('waist')"
            />
            <!-- FEET -->
            <SlotButton
              style="bottom: -4px; left: 50%; transform: translateX(-50%)"
              :item="slotItem('feet')"
              label="Boots"
              @click="openSlot('feet')"
            />
          </div>

          <!-- Weapon slots + other -->
          <div class="flex-1 flex flex-col justify-between">
            <div class="space-y-1.5">
              <p class="font-cinzel text-[9px] text-muted-foreground/60 tracking-widest uppercase">Weapons</p>
              <EquipSlotRow :item="slotItem('main_hand')" label="Main hand" @click="openSlot('main_hand')" />
              <EquipSlotRow :item="slotItem('off_hand')"  label="Off hand"  @click="openSlot('off_hand')" />
            </div>
            <div class="space-y-1.5 mt-3">
              <p class="font-cinzel text-[9px] text-muted-foreground/60 tracking-widest uppercase">Other</p>
              <EquipSlotRow
                v-for="item in otherEquipped"
                :key="item.id"
                :item="item"
                :label="item.name"
                @click="openEquipMenu(item)"
              />
              <EquipSlotRow v-if="!otherEquipped.length" :item="null" label="Other" @click="openSlot('other')" />
            </div>
          </div>
        </div>
      </div>

      <!-- Coin purse -->
      <div class="rounded-lg border border-border bg-card p-4">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-3">Coin Purse</p>
        <div v-if="!member" class="text-center py-4">
          <p class="font-fell text-sm text-muted-foreground italic">No character selected.</p>
        </div>
        <div v-else class="space-y-2">
          <CoinRow v-for="coin in COINS" :key="coin.key"
            :label="coin.label" :symbol="coin.symbol" :color="coin.color"
            :value="member[coin.key]"
            @adjust="(d) => adjustCurrency(coin.key, d)"
          />
        </div>
      </div>
    </div>

    <!-- ═══ CONTAINERS ═══ -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Containers</p>
        <button
          class="flex items-center gap-1 font-cinzel text-[10px] tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          @click="addContainer"
        >
          <Plus class="h-3 w-3" />Add container
        </button>
      </div>

      <!-- Default backpack always shown -->
      <ContainerSection
        label="Backpack"
        :is-default="true"
        :items="backpackItems"
        :all-containers="allContainers"
        :all-items="allItems ?? []"
        :resolved-member-id="resolvedMemberId"
        @add="(name, itemId) => addToLocation('backpack', null, name, itemId)"
        @move="moveItem"
        @remove="removeItem"
        @adjust-qty="adjustQty"
        @drop-to-chat="dropItemToChat"
      />

      <!-- Belt -->
      <ContainerSection
        label="Belt"
        :items="beltItems"
        :all-containers="allContainers"
        :all-items="allItems ?? []"
        :resolved-member-id="resolvedMemberId"
        class="mt-2"
        @add="(name, itemId) => addToLocation('belt', null, name, itemId)"
        @move="moveItem"
        @remove="removeItem"
        @adjust-qty="adjustQty"
        @drop-to-chat="dropItemToChat"
      />

      <!-- Custom containers (items with is_container=true) -->
      <ContainerSection
        v-for="c in customContainers"
        :key="c.id"
        :label="c.name"
        :container-id="c.id"
        :items="itemsInContainer(c.id)"
        :all-containers="allContainers"
        :all-items="allItems ?? []"
        :resolved-member-id="resolvedMemberId"
        :removable="true"
        class="mt-2"
        @add="(name, itemId) => addToLocation('container', c.id, name, itemId)"
        @move="moveItem"
        @remove="removeItem"
        @remove-container="removeItem(c.id)"
        @adjust-qty="adjustQty"
        @drop-to-chat="dropItemToChat"
      />
    </div>

    <!-- ═══ STORED (owned but not on person) ═══ -->
    <div>
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">Stored Elsewhere</p>
      <div v-if="storedItems.length" class="rounded-lg border border-border bg-card overflow-hidden">
        <ItemRow
          v-for="item in storedItems"
          :key="item.id"
          :item="item"
          :all-containers="allContainers"
          @move="moveItem"
          @remove="removeItem"
          @adjust-qty="adjustQty"
          @drop-to-chat="dropItemToChat"
        />
      </div>
      <div v-else class="rounded-lg border border-dashed border-border p-4 text-center">
        <p class="font-fell text-sm text-muted-foreground italic">Nothing stored away.</p>
      </div>
    </div>

    <!-- ═══ PARTY STASH ═══ -->
    <div>
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">Party Stash</p>
      <div v-if="partyStash.length" class="rounded-lg border border-border bg-card overflow-hidden">
        <ItemRow
          v-for="item in partyStash"
          :key="item.id"
          :item="item"
          :show-carrier="true"
          :party-members="partyMembers ?? []"
          :all-containers="allContainers"
          @move="moveItem"
          @remove="removeItem"
          @adjust-qty="adjustQty"
          @drop-to-chat="dropItemToChat"
        />
      </div>
      <div v-else class="rounded-lg border border-dashed border-border p-4 text-center">
        <p class="font-fell text-sm text-muted-foreground italic">The party stash is empty.</p>
      </div>
    </div>

    <!-- ═══ ADD ITEM (floating form) ═══ -->
    <form class="rounded-lg border border-border bg-card p-4" @submit.prevent="addItem">
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-3">Add Item to Backpack</p>
      <div class="flex items-center gap-2">
        <div class="relative flex-1 min-w-0">
          <input
            v-model="newItemName"
            type="text"
            placeholder="Search vault or type a name…"
            autocomplete="off"
            class="w-full bg-muted/30 border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @input="onAddInput"
            @focus="onAddInput"
            @keydown.escape="showDropdown = false"
            @keydown.down.prevent="focusDropdownItem(0)"
          />
          <div
            v-if="showDropdown && filteredItems.length"
            class="absolute left-0 bottom-full mb-0.5 z-20 w-full rounded-md border border-border bg-card shadow-lg overflow-hidden max-h-48 overflow-y-auto"
          >
            <button
              v-for="(it, idx) in filteredItems"
              :key="it.id"
              :ref="(el) => { if (el) dropdownRefs[idx] = el as HTMLButtonElement }"
              type="button"
              class="w-full text-left px-3 py-1.5 font-fell text-sm text-foreground hover:bg-muted transition-colors flex items-baseline gap-2"
              @click="selectItem(it)"
              @keydown.down.prevent="focusDropdownItem(idx + 1)"
              @keydown.up.prevent="idx > 0 ? focusDropdownItem(idx - 1) : undefined"
              @keydown.escape="showDropdown = false"
            >
              <span class="truncate">{{ it.name }}</span>
              <span class="font-cinzel text-[10px] text-muted-foreground shrink-0 capitalize">{{ it.rarity }}</span>
            </button>
          </div>
          <div v-if="showDropdown" class="fixed inset-0 z-10" @click="showDropdown = false" />
        </div>
        <input
          v-model.number="newItemQty"
          type="number" min="1"
          class="w-14 bg-muted/30 border border-border rounded-md px-2 py-1.5 font-cinzel text-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="submit"
          class="px-3 py-1.5 bg-primary text-primary-foreground rounded-md font-cinzel text-xs tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
          :disabled="!newItemName.trim()"
        >Add</button>
      </div>
    </form>

    <!-- Slot assignment modal -->
    <Transition name="fade">
      <div v-if="slotModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="slotModal = null">
        <div class="bg-card border border-border rounded-xl shadow-xl p-5 w-80 max-h-[80vh] overflow-y-auto space-y-3">
          <p class="font-cinzel text-sm font-semibold text-foreground tracking-wider capitalize">{{ slotLabel(slotModal) }} Slot</p>

          <!-- Currently equipped in this slot -->
          <div v-if="slotItem(slotModal)" class="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 flex items-center justify-between gap-2">
            <span class="font-fell text-sm text-foreground">{{ slotItem(slotModal)!.name }}</span>
            <button class="font-cinzel text-[10px] text-destructive hover:opacity-70" @click="unequipSlot(slotModal!)">Remove</button>
          </div>
          <p v-else class="font-fell text-xs text-muted-foreground italic">Nothing equipped here.</p>

          <!-- Items that can go in this slot (owned, not equipped elsewhere) -->
          <div v-if="candidatesForSlot(slotModal).length">
            <p class="font-cinzel text-[9px] text-muted-foreground tracking-widest uppercase mb-1.5">Equip from inventory</p>
            <button
              v-for="item in candidatesForSlot(slotModal)"
              :key="item.id"
              class="w-full text-left px-3 py-1.5 rounded-md hover:bg-muted/40 font-fell text-sm text-foreground transition-colors"
              @click="equipToSlot(item, slotModal!)"
            >{{ item.name }}</button>
          </div>
          <p v-else class="font-fell text-xs text-muted-foreground italic">No items available to equip here.</p>

          <button class="w-full mt-1 font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors" @click="slotModal = null">Close</button>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed, reactive } from "vue";
import { Plus } from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useParty, useUpdatePartyMember } from "@/composables/useParty";
import { usePartyInventory, useAddInventoryItem, useUpdateInventoryItem, useRemoveInventoryItem } from "@/composables/usePartyInventory";
import { useItems } from "@/composables/useItems";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import type { PartyInventoryItem, InventorySlot } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import type { PartyMember } from "@/types/party.types";
import SlotButton from "@/components/inventory/SlotButton.vue";
import EquipSlotRow from "@/components/inventory/EquipSlotRow.vue";
import ContainerSection from "@/components/inventory/ContainerSection.vue";
import ItemRow from "@/components/inventory/ItemRow.vue";
import CoinRow from "@/components/inventory/CoinRow.vue";

// ── Stores / composables ───────────────────────────────────────────────────────
const auth = useAuthStore();
const ui = useUiStore();
const { data: partyMembers } = useParty();
const { data: inventory } = usePartyInventory();
const { data: allItems } = useItems();
const { mutateAsync: addInventoryItem } = useAddInventoryItem();
const { mutateAsync: updateInventoryItem } = useUpdateInventoryItem();
const { mutateAsync: removeInventoryItem } = useRemoveInventoryItem();
const { mutateAsync: updatePartyMember } = useUpdatePartyMember();
const { sendItemDrop } = useCampaignMessages();

const resolvedMemberId = computed(() =>
  ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId
);

const member = computed<PartyMember | null>(() =>
  partyMembers.value?.find(m => m.id === resolvedMemberId.value) ?? null
);

// ── Inventory slices ───────────────────────────────────────────────────────────
const myItems = computed(() =>
  (inventory.value ?? []).filter(i => i.carried_by === resolvedMemberId.value)
);
const partyStash = computed(() =>
  (inventory.value ?? []).filter(i => i.carried_by === null)
);
const equippedItems  = computed(() => myItems.value.filter(i => i.location === 'equipped'));
const beltItems      = computed(() => myItems.value.filter(i => i.location === 'belt'));
const backpackItems  = computed(() => myItems.value.filter(i => i.location === 'backpack'));
const storedItems    = computed(() => myItems.value.filter(i => i.location === 'stored'));
const customContainers = computed(() => myItems.value.filter(i => i.is_container));
const allContainers    = computed(() => customContainers.value);
const otherEquipped  = computed(() => equippedItems.value.filter(i => i.slot === 'other' || !i.slot));

function itemsInContainer(cid: string) {
  return myItems.value.filter(i => i.location === 'container' && i.container_id === cid);
}

// ── Equipment slots ────────────────────────────────────────────────────────────
function slotItem(slot: InventorySlot): PartyInventoryItem | null {
  return equippedItems.value.find(i => i.slot === slot) ?? null;
}

const SLOT_LABELS: Record<InventorySlot, string> = {
  head: "Head", neck: "Neck", shoulders: "Shoulders", body: "Body",
  hands: "Gloves", ring: "Ring", waist: "Waist", feet: "Boots",
  main_hand: "Main Hand", off_hand: "Off Hand", other: "Other",
};
function slotLabel(slot: InventorySlot) { return SLOT_LABELS[slot]; }

function candidatesForSlot(_slot: InventorySlot): PartyInventoryItem[] {
  return myItems.value.filter(i => i.location !== 'equipped');
}

const slotModal = ref<InventorySlot | null>(null);
function openSlot(slot: InventorySlot) { slotModal.value = slot; }
function openEquipMenu(item: PartyInventoryItem) {
  slotModal.value = item.slot ?? 'other';
}

async function equipToSlot(item: PartyInventoryItem, slot: InventorySlot) {
  await updateInventoryItem({ id: item.id, update: { location: 'equipped', slot, is_equipped: true } });
  slotModal.value = null;
}

async function unequipSlot(slot: InventorySlot) {
  const item = slotItem(slot);
  if (!item) return;
  await updateInventoryItem({ id: item.id, update: { location: 'backpack', slot: null, is_equipped: false } });
  slotModal.value = null;
}

// ── Currency ───────────────────────────────────────────────────────────────────
type CoinKey = 'cp' | 'sp' | 'ep' | 'gp' | 'pp';

const COINS: { key: CoinKey; label: string; symbol: string; color: string }[] = [
  { key: 'pp', label: 'Platinum', symbol: 'PP', color: 'text-slate-300' },
  { key: 'gp', label: 'Gold',     symbol: 'GP', color: 'text-gold-500'  },
  { key: 'ep', label: 'Electrum', symbol: 'EP', color: 'text-teal-400'  },
  { key: 'sp', label: 'Silver',   symbol: 'SP', color: 'text-slate-400' },
  { key: 'cp', label: 'Copper',   symbol: 'CP', color: 'text-amber-600' },
];

async function adjustCurrency(key: CoinKey, delta: number) {
  if (!member.value) return;
  const current = member.value[key] ?? 0;
  await updatePartyMember({ id: member.value.id, update: { [key]: Math.max(0, current + delta) } });
}

// ── Mutations ──────────────────────────────────────────────────────────────────
async function adjustQty(item: PartyInventoryItem, delta: number) {
  await updateInventoryItem({ id: item.id, update: { quantity: Math.max(1, item.quantity + delta) } });
}

async function moveItem(item: PartyInventoryItem, toLocation: string, containerId?: string) {
  await updateInventoryItem({
    id: item.id,
    update: {
      location: toLocation as PartyInventoryItem['location'],
      container_id: containerId ?? null,
      ...(toLocation !== 'equipped' ? { is_equipped: false, slot: null } : {}),
    },
  });
}

async function removeItem(id: string) {
  if (!await confirm("Remove this item?")) return;
  await removeInventoryItem(id);
}

async function dropItemToChat(inv: PartyInventoryItem) {
  if (!await confirm(`Drop "${inv.name}" to chat? It will be removed from your inventory.`)) return;
  const linkedItem = inv.item_id ? (allItems.value?.find(it => it.id === inv.item_id) ?? null) : null;
  await sendItemDrop(inv.name, inv.item_id, inv.quantity, linkedItem?.rarity ?? null);
  await removeInventoryItem(inv.id);
}

async function addContainer() {
  const name = prompt("Container name (e.g. 'Belt Pouch', 'Saddlebag'):");
  if (!name?.trim()) return;
  await addInventoryItem({
    name: name.trim(), quantity: 1, item_id: null,
    carried_by: resolvedMemberId.value ?? null,
    location: 'backpack', slot: null,
    is_container: true, container_id: null,
    is_attuned: false, is_equipped: false, notes: null,
  });
}

async function addToLocation(location: PartyInventoryItem['location'], containerId: string | null, name: string, itemId: string | null) {
  await addInventoryItem({
    name, quantity: 1, item_id: itemId,
    carried_by: resolvedMemberId.value ?? null,
    location, slot: null,
    is_container: false, container_id: containerId,
    is_attuned: false, is_equipped: false, notes: null,
  });
}

// ── Add item combobox ──────────────────────────────────────────────────────────
const newItemName = ref("");
const newItemQty  = ref(1);
const newItemSelectedId = ref("");
const showDropdown = ref(false);
const dropdownRefs = reactive<Record<number, HTMLButtonElement>>({});

const filteredItems = computed((): Item[] => {
  const q = newItemName.value.trim().toLowerCase();
  const all = allItems.value ?? [];
  if (!q) return all.slice(0, 8);
  return all.filter(it => it.name.toLowerCase().includes(q)).slice(0, 8);
});

function onAddInput() { newItemSelectedId.value = ""; showDropdown.value = true; }
function selectItem(it: Item) { newItemName.value = it.name; newItemSelectedId.value = it.id; showDropdown.value = false; }
function focusDropdownItem(idx: number) { dropdownRefs[idx]?.focus(); }

async function addItem() {
  if (!newItemName.value.trim()) return;
  await addInventoryItem({
    name: newItemName.value.trim(), quantity: newItemQty.value,
    item_id: newItemSelectedId.value || null,
    carried_by: resolvedMemberId.value ?? null,
    location: 'backpack', slot: null,
    is_container: false, container_id: null,
    is_attuned: false, is_equipped: false, notes: null,
  });
  newItemName.value = ""; newItemSelectedId.value = ""; newItemQty.value = 1; showDropdown.value = false;
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
