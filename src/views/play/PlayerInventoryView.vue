<template>
  <div class="space-y-6 pb-8">
    <!-- ═══ TOP ROW: Paper doll + Coin purse ═══ -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <!-- Paper doll -->
      <div class="rounded-lg border border-border bg-card p-4">
        <p
          class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-3"
        >
          Equipped
        </p>
        <div class="flex gap-4">
          <!-- Silhouette -->
          <div class="relative shrink-0 w-32 h-60 select-none">
            <img
              :src="
                slotItem('clothes')
                  ? '/assets/dressed.webp'
                  : '/assets/naked.webp'
              "
              alt="Character"
              class="w-full h-full object-contain object-center transition-opacity duration-200"
            />

            <!-- Slot buttons overlaid on silhouette -->
            <!-- HEAD -->
            <SlotButton
              style="top: 0px; left: 50%; transform: translateX(-50%)"
              :item="slotItem('head')"
              :disabled="!slotItem('head') && !slotCanEquip('head')"
              label="Head"
              @click="openSlot('head')"
            />
            <!-- NECK -->
            <SlotButton
              style="top: 34px; left: 50%; transform: translateX(-50%)"
              :item="slotItem('neck')"
              :disabled="!slotItem('neck') && !slotCanEquip('neck')"
              label="Neck"
              @click="openSlot('neck')"
            />
            <!-- SHOULDERS -->
            <SlotButton
              style="top: 40px; left: -10px"
              :item="slotItem('shoulders')"
              :disabled="!slotItem('shoulders') && !slotCanEquip('shoulders')"
              label="Shldr"
              @click="openSlot('shoulders')"
            />
            <!-- BODY -->
            <SlotButton
              style="top: 66px; left: 50%; transform: translateX(-50%)"
              :item="slotItem('body')"
              :disabled="!slotItem('body') && !slotCanEquip('body')"
              label="Body"
              @click="openSlot('body')"
            />
            <!-- HANDS -->
            <SlotButton
              style="top: 116px; right: -10px"
              :item="slotItem('hands')"
              :disabled="!slotItem('hands') && !slotCanEquip('hands')"
              label="Gloves"
              @click="openSlot('hands')"
            />
            <!-- RING (left) -->
            <SlotButton
              style="top: 132px; left: -12px"
              :item="slotItem('ring')"
              :disabled="!slotItem('ring') && !slotCanEquip('ring')"
              label="Ring"
              @click="openSlot('ring')"
            />
            <!-- WAIST -->
            <SlotButton
              style="top: 106px; left: 50%; transform: translateX(-50%)"
              :item="slotItem('waist')"
              :disabled="!slotItem('waist') && !slotCanEquip('waist')"
              label="Waist"
              @click="openSlot('waist')"
            />
            <!-- CLOTHES (legs) -->
            <SlotButton
              style="top: 148px; right: -10px"
              :item="slotItem('clothes')"
              :warn="!slotItem('clothes') && slotCanEquip('clothes')"
              :disabled="!slotItem('clothes') && !slotCanEquip('clothes')"
              label="Clothes"
              @click="openSlot('clothes')"
            />
            <!-- FEET -->
            <SlotButton
              style="bottom: 2px; left: 50%; transform: translateX(-50%)"
              :item="slotItem('feet')"
              :disabled="!slotItem('feet') && !slotCanEquip('feet')"
              label="Boots"
              @click="openSlot('feet')"
            />
          </div>

          <!-- Weapon slots + other -->
          <div class="flex-1 min-w-0 flex flex-col justify-between">
            <div class="space-y-1.5">
              <p
                class="font-cinzel text-[9px] text-muted-foreground/60 tracking-widest uppercase"
              >
                Weapons
              </p>
              <EquipSlotRow
                :item="slotItem('main_hand')"
                label="Main hand"
                @click="openSlot('main_hand')"
              />
              <EquipSlotRow
                :item="slotItem('off_hand')"
                label="Off hand"
                @click="openSlot('off_hand')"
              />
            </div>
            <div class="space-y-1.5 mt-3">
              <p
                class="font-cinzel text-[9px] text-muted-foreground/60 tracking-widest uppercase"
              >
                Other
              </p>
              <EquipSlotRow
                v-for="item in otherEquipped"
                :key="item.id"
                :item="item"
                :label="item.name"
                @click="openDetail(item)"
              />
              <EquipSlotRow
                v-if="!otherEquipped.length"
                :item="null"
                label="Other"
                @click="openSlot('other')"
              />
            </div>
          </div>
        </div>

        <!-- Attunement slots -->
        <div v-if="member" class="mt-2 flex items-center justify-between gap-2">
          <span
            class="font-cinzel text-[9px] text-muted-foreground/50 tracking-wider"
            >ATTUNEMENT</span
          >
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
              :title="
                n <= attunedItems.length
                  ? attunedItems[n - 1]?.name
                  : 'Empty slot'
              "
            />
            <span class="font-cinzel text-[9px] text-muted-foreground/50"
              >{{ attunedItems.length }}/3</span
            >
          </div>
        </div>

        <!-- Equipped weight -->
        <p
          v-if="member && equippedWeight > 0"
          class="font-cinzel text-[9px] text-muted-foreground/50 tracking-wider text-right"
        >
          Equipped: {{ formatWeightLb(equippedWeight) }}
        </p>
      </div>

      <!-- Coin purse -->
      <div class="rounded-lg border border-border bg-card p-4">
        <p
          class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-3"
        >
          Coin Purse
        </p>
        <div v-if="!member" class="text-center py-4">
          <p class="font-fell text-sm text-muted-foreground italic">
            No character selected.
          </p>
        </div>
        <template v-else>
          <!-- Compact 5-coin grid -->
          <div class="grid grid-cols-5 gap-1.5">
            <CoinRow
              v-for="coin in COINS"
              :key="coin.key"
              :label="coin.label"
              :symbol="coin.symbol"
              :color="coin.color"
              :value="member[coin.key]"
              @commit="(v) => setCurrency(coin.key, v)"
            />
          </div>

          <!-- Drop form -->
          <div v-if="showCoinDrop" class="mt-3 border-t border-border pt-3">
            <p
              class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase mb-2"
            >
              Drop to Chat
            </p>
            <div class="grid grid-cols-5 gap-1.5 mb-3">
              <div
                v-for="coin in COINS"
                :key="coin.key"
                class="flex flex-col items-center gap-1"
              >
                <span
                  class="font-cinzel text-[10px] font-bold"
                  :class="coin.color"
                  :title="coin.label"
                  >{{ coin.symbol }}</span
                >
                <input
                  v-model.number="coinDrop[coin.key]"
                  type="number"
                  min="0"
                  :max="member[coin.key]"
                  class="w-full bg-muted/30 border border-border rounded px-1 py-0.5 font-cinzel text-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                  :class="
                    coinDrop[coin.key] > member[coin.key]
                      ? 'border-destructive'
                      : ''
                  "
                  :title="`Max: ${member[coin.key]}`"
                />
                <span class="font-cinzel text-[9px] text-muted-foreground/60"
                  >/ {{ member[coin.key] }}</span
                >
              </div>
            </div>
            <div class="flex gap-2">
              <button
                class="flex-1 py-1 bg-primary text-primary-foreground rounded font-cinzel text-xs tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
                :disabled="!coinDropHasValue || coinDropOverLimit"
                @click="submitCoinDrop"
              >
                Drop
              </button>
              <button
                class="px-3 py-1 border border-border rounded font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors"
                @click="showCoinDrop = false"
              >
                Cancel
              </button>
            </div>
          </div>
          <button
            v-else
            class="mt-2 w-full flex items-center justify-center gap-1.5 py-1 border border-dashed border-border rounded font-cinzel text-[10px] tracking-wider text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
            @click="openCoinDrop"
          >
            <MessageCircle class="h-3 w-3" />
            Drop Coins to Chat
          </button>
        </template>
      </div>
    </div>

    <!-- ═══ CARRY WEIGHT ═══ -->
    <div
      v-if="member"
      class="rounded-lg border border-border bg-card px-4 py-3 flex gap-3 items-center"
    >
      <!-- Burden portrait -->
      <div class="shrink-0 w-15 h-21 select-none">
        <img
          :src="BURDEN_META[burdenLevel].img"
          :alt="BURDEN_META[burdenLevel].label"
          class="w-full h-full object-contain object-top transition-opacity duration-300"
        />
      </div>

      <!-- Bar + labels -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between mb-1 gap-2">
          <!-- Burden label -->
          <span
            class="font-cinzel text-[10px] font-semibold tracking-wider transition-colors"
            :class="BURDEN_META[burdenLevel].color"
          >
            {{ BURDEN_META[burdenLevel].label }}
          </span>

          <!-- weight / capacity + powerful build -->
          <div class="flex items-center gap-1.5 shrink-0">
            <span
              v-if="powerfulBuild"
              class="font-cinzel text-[8px] text-amber-400/70 tracking-wider uppercase"
              >Powerful Build</span
            >
            <span class="font-cinzel text-[10px] text-foreground">{{
              formatWeightLb(totalCarriedWeight)
            }}</span>
            <span class="font-cinzel text-[9px] text-muted-foreground/40"
              >/</span
            >

            <!-- editable capacity -->
            <form
              v-if="editingCapacity"
              class="flex items-center gap-1"
              @submit.prevent="saveCapacity"
            >
              <input
                v-model="capacityDraft"
                type="text"
                placeholder="*2 / +30 / 150"
                class="w-20 bg-muted/30 border border-border rounded px-1 py-0 font-cinzel text-[10px] text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                autofocus
                @keydown.escape="editingCapacity = false"
              />
              <button
                type="submit"
                class="font-cinzel text-[9px] text-primary hover:opacity-70"
              >
                ✓
              </button>
              <button
                v-if="member.carry_capacity_override != null"
                type="button"
                class="font-cinzel text-[9px] text-muted-foreground hover:text-foreground"
                title="Reset to STR×15"
                @click="resetCapacity"
              >
                ↺
              </button>
              <button
                type="button"
                class="font-cinzel text-[9px] text-muted-foreground hover:text-foreground"
                @click="editingCapacity = false"
              >
                ✕
              </button>
            </form>
            <button
              v-else
              class="font-cinzel text-[10px] hover:text-primary transition-colors flex items-center gap-0.5"
              :class="
                member.carry_capacity_override != null
                  ? 'text-amber-400'
                  : 'text-muted-foreground/60'
              "
              @click="openCapacityEdit"
            >
              {{ formatWeightLb(effectiveCapacity) }}
              <span
                v-if="member.carry_capacity_override"
                class="text-[8px] opacity-60"
                >({{ member.carry_capacity_override }})</span
              >
            </button>
          </div>
        </div>

        <!-- bar -->
        <div class="h-1.5 rounded-full bg-muted/40 overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-300"
            :class="carryColor"
            :style="{ width: carryPercent + '%' }"
          />
        </div>
      </div>
    </div>

    <!-- ═══ CONTAINERS ═══ -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <p
          class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
        >
          Containers
        </p>
        <button
          class="flex items-center gap-1 font-cinzel text-[10px] tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          @click="
            showContainerPicker = !showContainerPicker;
            containerPickerSearch = '';
          "
        >
          <Plus class="h-3 w-3" />Add container
        </button>
      </div>

      <!-- Container picker: promote an existing inventory item to a container -->
      <div
        v-if="showContainerPicker"
        class="mb-2 rounded-lg border border-border bg-card p-3 flex flex-col gap-2"
      >
        <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">
          Pick an item from your inventory:
        </p>
        <input
          v-model="containerPickerSearch"
          type="text"
          placeholder="Filter items…"
          class="w-full bg-muted/30 border border-border rounded px-2 py-1 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div
          v-if="containerCandidates.length"
          class="rounded border border-border overflow-hidden"
        >
          <button
            v-for="item in containerCandidates"
            :key="item.id"
            type="button"
            class="w-full text-left px-3 py-1.5 font-fell text-sm text-foreground hover:bg-muted transition-colors border-b border-border last:border-0"
            @click="promoteToContainer(item)"
          >
            {{ item.name }}
          </button>
        </div>
        <p v-else class="font-fell text-xs text-muted-foreground/50 italic">
          No items in inventory.
        </p>
        <button
          type="button"
          class="font-cinzel text-[10px] text-muted-foreground hover:text-foreground self-end"
          @click="showContainerPicker = false"
        >
          Cancel
        </button>
      </div>

      <!-- Default backpack always shown -->
      <ContainerSection
        label="Backpack"
        :is-default="true"
        :sellable="true"
        :items="backpackItems"
        :weight="backpackWeight"
        :all-containers="allContainers"
        :all-items="allItems ?? []"
        :resolved-member-id="resolvedMemberId"
        @add="(name, itemId) => addToLocation('backpack', null, name, itemId)"
        @move="moveItem"
        @remove="removeItem"
        @adjust-qty="adjustQty"
        @drop-to-chat="dropItemToChat"
        @split-stack="splitStack"
        @open-detail="openDetail"
        @sell-item="openDetailWithSell"
        @reorder="handleReorder"
      />

      <!-- Belt -->
      <ContainerSection
        label="Belt"
        :sellable="true"
        :items="beltItems"
        :weight="beltWeight"
        :all-containers="allContainers"
        :all-items="allItems ?? []"
        :resolved-member-id="resolvedMemberId"
        class="mt-2"
        @add="(name, itemId) => addToLocation('belt', null, name, itemId)"
        @move="moveItem"
        @remove="removeItem"
        @adjust-qty="adjustQty"
        @drop-to-chat="dropItemToChat"
        @split-stack="splitStack"
        @open-detail="openDetail"
        @sell-item="openDetailWithSell"
        @reorder="handleReorder"
      />

      <!-- Custom containers (items with is_container=true) -->
      <ContainerSection
        v-for="c in customContainers"
        :key="c.id"
        :label="c.name"
        :container="c"
        :container-id="c.id"
        :sellable="true"
        :items="itemsInContainer(c.id)"
        :weight="containerWeight(c.id)"
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
        @split-stack="splitStack"
        @open-detail="openDetail"
        @sell-item="openDetailWithSell"
        @reorder="handleReorder"
      />
    </div>

    <!-- ═══ STORED (owned but not on person) ═══ -->
    <div>
      <p
        class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2"
      >
        Stored Elsewhere
      </p>
      <div
        v-if="storedItems.length"
        class="rounded-lg border border-border bg-card overflow-hidden"
      >
        <ItemRow
          v-for="item in storedItems"
          :key="item.id"
          :item="item"
          :all-containers="allContainers"
          :sellable="true"
          @move="moveItem"
          @remove="removeItem"
          @adjust-qty="adjustQty"
          @drop-to-chat="dropItemToChat"
          @split-stack="splitStack"
          @open-detail="openDetail"
          @sell-item="openDetailWithSell"
        />
      </div>
      <div
        v-else
        class="rounded-lg border border-dashed border-border p-4 text-center"
      >
        <p class="font-fell text-sm text-muted-foreground italic">
          Nothing stored away.
        </p>
      </div>
    </div>

    <!-- ═══ PARTY STASH ═══ -->
    <div>
      <p
        class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2"
      >
        Party Stash
      </p>
      <div
        v-if="partyStash.length"
        class="rounded-lg border border-border bg-card overflow-hidden"
      >
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
          @split-stack="splitStack"
          @open-detail="openDetail"
        />
      </div>
      <div
        v-else
        class="rounded-lg border border-dashed border-border p-4 text-center"
      >
        <p class="font-fell text-sm text-muted-foreground italic">
          The party stash is empty.
        </p>
      </div>
    </div>

    <!-- ═══ ADD ITEM (floating form) ═══ -->
    <form
      class="rounded-lg border border-border bg-card p-4"
      @submit.prevent="addItem"
    >
      <p
        class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-3"
      >
        Add Item to Backpack
      </p>
      <div class="flex items-center gap-2">
        <div class="relative flex-1 min-w-0">
          <input
            v-model="newItemName"
            type="text"
            placeholder="Search vault…"
            autocomplete="off"
            class="w-full bg-muted/30 border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            :class="
              newItemName && !newItemSelectedId ? 'border-amber-500/50' : ''
            "
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
              :ref="
                (el) => {
                  if (el) dropdownRefs[idx] = el as HTMLButtonElement;
                }
              "
              type="button"
              class="w-full text-left px-3 py-1.5 font-fell text-sm text-foreground hover:bg-muted transition-colors flex items-baseline gap-2"
              @click="selectItem(it)"
              @keydown.down.prevent="focusDropdownItem(idx + 1)"
              @keydown.up.prevent="
                idx > 0 ? focusDropdownItem(idx - 1) : undefined
              "
              @keydown.escape="showDropdown = false"
            >
              <span class="truncate">{{ it.name }}</span>
              <span
                class="font-cinzel text-[10px] text-muted-foreground shrink-0 capitalize"
                >{{ it.rarity }}</span
              >
            </button>
          </div>
          <div
            v-if="showDropdown"
            class="fixed inset-0 z-10"
            @click="showDropdown = false"
          />
        </div>
        <input
          v-model.number="newItemQty"
          type="number"
          min="1"
          class="w-14 bg-muted/30 border border-border rounded-md px-2 py-1.5 font-cinzel text-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="submit"
          class="px-3 py-1.5 bg-primary text-primary-foreground rounded-md font-cinzel text-xs tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
          :disabled="!newItemSelectedId"
        >
          Add
        </button>
      </div>
    </form>

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
    />

    <!-- Slot assignment modal -->
    <Transition name="fade">
      <div
        v-if="slotModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        @click.self="slotModal = null"
      >
        <div
          class="bg-card border border-border rounded-xl shadow-xl p-5 w-80 max-h-[80vh] overflow-y-auto space-y-3"
        >
          <p
            class="font-cinzel text-sm font-semibold text-foreground tracking-wider capitalize"
          >
            {{ slotLabel(slotModal) }} Slot
          </p>

          <!-- Currently equipped in this slot -->
          <div
            v-if="slotItem(slotModal)"
            class="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 flex items-center justify-between gap-2"
          >
            <span
              class="font-fell text-sm text-foreground flex-1 min-w-0 truncate"
              >{{ slotItem(slotModal)!.name }}</span
            >
            <button
              class="shrink-0 font-cinzel text-[10px] text-destructive hover:opacity-70"
              @click="unequipSlot(slotModal!)"
            >
              Remove
            </button>
          </div>
          <p v-else class="font-fell text-xs text-muted-foreground italic">
            Nothing equipped here.
          </p>

          <!-- Items that can go in this slot (owned, not equipped elsewhere) -->
          <div v-if="candidatesForSlot(slotModal).length">
            <p
              class="font-cinzel text-[9px] text-muted-foreground tracking-widest uppercase mb-1.5"
            >
              Equip from inventory
            </p>
            <button
              v-for="item in candidatesForSlot(slotModal)"
              :key="item.id"
              class="w-full text-left px-3 py-1.5 rounded-md hover:bg-muted/40 font-fell text-sm text-foreground transition-colors"
              @click="equipToSlot(item, slotModal!)"
            >
              {{ item.name }}
            </button>
          </div>
          <p v-else class="font-fell text-xs text-muted-foreground italic">
            No items available to equip here.
          </p>

          <button
            class="w-full mt-1 font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors"
            @click="slotModal = null"
          >
            Close
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed, reactive, nextTick } from "vue";
import { Plus, MessageCircle } from "lucide-vue-next";
import { COINS, type CoinKey } from "@/lib/currency";
import {
  parseWeightLb,
  hasPowerfulBuild,
  carryCapacity,
  formatWeightLb,
} from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useParty, useUpdatePartyMember } from "@/composables/useParty";
import { useSpeciesNameMap } from "@/composables/useSpecies";
import {
  usePartyInventory,
  useAddInventoryItem,
  useUpdateInventoryItem,
  useRemoveInventoryItem,
  useReorderInventoryItems,
  useInventoryLive,
} from "@/composables/usePartyInventory";
import { useItems } from "@/composables/useItems";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import type {
  PartyInventoryItem,
  InventoryLocation,
  InventorySlot,
} from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import type { PartyMember } from "@/types/party.types";
import SlotButton from "@/components/inventory/SlotButton.vue";
import EquipSlotRow from "@/components/inventory/EquipSlotRow.vue";
import ContainerSection from "@/components/inventory/ContainerSection.vue";
import ItemRow from "@/components/inventory/ItemRow.vue";
import CoinRow from "@/components/inventory/CoinRow.vue";
import ItemDetailPanel from "@/components/inventory/ItemDetailPanel.vue";

// ── Stores / composables ───────────────────────────────────────────────────────
const auth = useAuthStore();
const ui = useUiStore();
const { data: partyMembers } = useParty();
const speciesNameMap = useSpeciesNameMap();
const { data: inventory } = usePartyInventory();
useInventoryLive();
const { data: allItems } = useItems();
const { mutateAsync: addInventoryItem } = useAddInventoryItem();
const { mutateAsync: updateInventoryItem } = useUpdateInventoryItem();
const { mutateAsync: removeInventoryItem } = useRemoveInventoryItem();
const { mutate: reorderInventoryItems } = useReorderInventoryItems();
const { mutateAsync: updatePartyMember } = useUpdatePartyMember();
const { sendItemDrop, sendCurrencyDrop, sendPlayerOffer } =
  useCampaignMessages();

const resolvedMemberId = computed(() =>
  ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId,
);

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
const attunedItems = computed(() => myItems.value.filter((i) => i.is_attuned));
const customContainers = computed(() =>
  myItems.value.filter((i) => i.is_container),
);
const allContainers = computed(() => customContainers.value);
const otherEquipped = computed(() =>
  equippedItems.value.filter((i) => i.slot === "other" || !i.slot),
);

function isContainerVaultItem(itemId: string | null): boolean {
  if (!itemId) return false;
  return (
    allItems.value
      ?.find((it) => it.id === itemId)
      ?.tags.includes("container") ?? false
  );
}

function itemsInContainer(cid: string) {
  return myItems.value.filter(
    (i) => i.location === "container" && i.container_id === cid,
  );
}

// ── Weight helpers ─────────────────────────────────────────────────────────────
// Pre-build a Map<item_id, weight_per_unit> so every invWeight lookup is O(1).
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

function sumWeight(items: PartyInventoryItem[]): number {
  return Math.round(items.reduce((acc, i) => acc + invWeight(i), 0) * 10) / 10;
}

const equippedWeight = computed(() => sumWeight(equippedItems.value));
const beltWeight = computed(() => sumWeight(beltItems.value));
const backpackWeight = computed(() => sumWeight(backpackItems.value));

// Memoize per-container weights to avoid recomputing in both template and totalCarriedWeight.
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

const totalCarriedWeight = computed(
  () =>
    Math.round(
      (equippedWeight.value +
        beltWeight.value +
        backpackWeight.value +
        customContainers.value.reduce(
          (acc, c) => acc + containerWeight(c.id),
          0,
        )) *
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
  if (carryPercent.value >= 100) return "bg-destructive";
  if (carryPercent.value >= 67) return "bg-amber-500";
  if (carryPercent.value >= 33) return "bg-amber-400/70";
  return "bg-primary";
});

type BurdenLevel =
  | "unencumbered"
  | "encumbered"
  | "heavily_encumbered"
  | "over_encumbered";

const BURDEN_META: Record<
  BurdenLevel,
  { label: string; img: string; color: string }
> = {
  unencumbered: {
    label: "Unencumbered",
    img: "/assets/unencumbered.webp",
    color: "text-muted-foreground/60",
  },
  encumbered: {
    label: "Encumbered",
    img: "/assets/encumbered.webp",
    color: "text-amber-400",
  },
  heavily_encumbered: {
    label: "Heavily Encumbered",
    img: "/assets/heavily_encumbered.webp",
    color: "text-orange-500",
  },
  over_encumbered: {
    label: "Over Encumbered",
    img: "/assets/over_encumbered.webp",
    color: "text-destructive",
  },
};

const burdenLevel = computed((): BurdenLevel => {
  if (!member.value) return "unencumbered";
  const mult = powerfulBuild.value ? 2 : 1;
  const w = totalCarriedWeight.value;
  const str = member.value.str;
  if (w > str * 15 * mult) return "over_encumbered";
  if (w > str * 10 * mult) return "heavily_encumbered";
  if (w > str * 5 * mult) return "encumbered";
  return "unencumbered";
});

// capacity override edit
const editingCapacity = ref(false);
const capacityDraft = ref("");

function openCapacityEdit() {
  capacityDraft.value = member.value?.carry_capacity_override ?? "";
  editingCapacity.value = true;
}

async function saveCapacity() {
  if (!member.value) return;
  const val = capacityDraft.value.trim() || null;
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

// ── Equipment slots ────────────────────────────────────────────────────────────
function slotItem(slot: InventorySlot): PartyInventoryItem | null {
  return equippedItems.value.find((i) => i.slot === slot) ?? null;
}

const SLOT_LABELS: Record<InventorySlot, string> = {
  head: "Head",
  neck: "Neck",
  shoulders: "Shoulders",
  body: "Body",
  clothes: "Clothes",
  hands: "Gloves",
  ring: "Ring",
  waist: "Waist",
  feet: "Boots",
  main_hand: "Main Hand",
  off_hand: "Off Hand",
  other: "Other",
};
function slotLabel(slot: InventorySlot) {
  return SLOT_LABELS[slot];
}

function candidatesForSlot(slot: InventorySlot): PartyInventoryItem[] {
  const unequipped = myItems.value.filter((i) => i.location !== "equipped");

  function vaultItem(inv: PartyInventoryItem) {
    return inv.item_id
      ? (allItems.value?.find((it) => it.id === inv.item_id) ?? null)
      : null;
  }

  // Slots that use tag-based filtering — multiple accepted tags/keywords per slot
  const TAG_SLOTS: Partial<Record<InventorySlot, string[]>> = {
    clothes: ["clothes", "clothing"],
    neck: ["amulet", "necklace", "pendant"],
    hands: ["gloves", "gauntlets", "bracers"],
    feet: ["boots", "shoes", "sandals", "footwear"],
    head: ["helmet", "hat", "hood", "circlet", "crown"],
    shoulders: ["cloak", "cape", "mantle", "pauldrons"],
    waist: ["belt", "girdle", "sash"],
  };

  function matches(inv: PartyInventoryItem): boolean {
    const vi = vaultItem(inv);
    // Type-restricted slots: must have a vault item of the right type
    if (slot === "body") return !!vi && vi.item_type === "armor";
    if (slot === "ring") return !!vi && vi.item_type === "ring";
    // Tag-restricted slots: match on any accepted tag OR subtype keyword; custom items excluded
    const tags = TAG_SLOTS[slot];
    if (tags) {
      if (!vi) return false;
      const sub = vi.subtype?.toLowerCase() ?? "";
      return tags.some((t) => vi.tags.includes(t) || sub.includes(t));
    }
    // All other slots: show everything
    return true;
  }

  return unequipped.filter(matches);
}

const slotModal = ref<InventorySlot | null>(null);
function slotCanEquip(slot: InventorySlot): boolean {
  return candidatesForSlot(slot).length > 0;
}

function openSlot(slot: InventorySlot) {
  const equipped = slotItem(slot);
  if (equipped) openDetail(equipped);
  else if (slotCanEquip(slot)) slotModal.value = slot;
}

async function unequipSelected() {
  if (!selectedInv.value) return;
  await updateInventoryItem({
    id: selectedInv.value.id,
    update: { location: "backpack", slot: null, is_equipped: false },
  });
  selectedInv.value = null;
}

async function equipToSlot(item: PartyInventoryItem, slot: InventorySlot) {
  if (item.quantity > 1) {
    // Split: decrement original, create a new equipped entry with qty 1
    await Promise.all([
      updateInventoryItem({
        id: item.id,
        update: { quantity: item.quantity - 1 },
      }),
      addInventoryItem({
        item_id: item.item_id,
        name: item.name,
        quantity: 1,
        carried_by: item.carried_by,
        location: "equipped",
        slot,
        is_container: false,
        container_id: null,
        is_attuned: false,
        is_equipped: true,
        notes: item.notes,
        is_ruined: item.is_ruined,
        is_identified: item.is_identified,
      }),
    ]);
  } else {
    await updateInventoryItem({
      id: item.id,
      update: { location: "equipped", slot, is_equipped: true },
    });
  }
  slotModal.value = null;
}

async function unequipSlot(slot: InventorySlot) {
  const item = slotItem(slot);
  if (!item) return;
  await updateInventoryItem({
    id: item.id,
    update: { location: "backpack", slot: null, is_equipped: false },
  });
  slotModal.value = null;
}

// ── Currency ───────────────────────────────────────────────────────────────────

function setCurrency(key: CoinKey, value: number) {
  if (!member.value) return;
  void updatePartyMember({ id: member.value.id, update: { [key]: value } });
}

// ── Coin drop form ─────────────────────────────────────────────────────────────
const showCoinDrop = ref(false);
const coinDrop = reactive<Record<CoinKey, number>>({
  pp: 0,
  gp: 0,
  ep: 0,
  sp: 0,
  cp: 0,
});

const coinDropHasValue = computed(() => COINS.some((c) => coinDrop[c.key] > 0));
const coinDropOverLimit = computed(() =>
  member.value
    ? COINS.some((c) => coinDrop[c.key] > (member.value![c.key] ?? 0))
    : false,
);

function openCoinDrop() {
  COINS.forEach((c) => {
    coinDrop[c.key] = 0;
  });
  showCoinDrop.value = true;
}

async function submitCoinDrop() {
  if (!member.value || !coinDropHasValue.value || coinDropOverLimit.value)
    return;
  await sendCurrencyDrop(
    coinDrop.pp,
    coinDrop.gp,
    coinDrop.ep,
    coinDrop.sp,
    coinDrop.cp,
    member.value.name ?? undefined,
  );
  // Deduct dropped amounts from wallet
  for (const c of COINS) {
    if (coinDrop[c.key] > 0) {
      setCurrency(
        c.key,
        Math.max(0, (member.value[c.key] ?? 0) - coinDrop[c.key]),
      );
    }
  }
  showCoinDrop.value = false;
}

// ── Mutations ──────────────────────────────────────────────────────────────────
async function adjustQty(item: PartyInventoryItem, delta: number) {
  await updateInventoryItem({
    id: item.id,
    update: { quantity: Math.max(1, item.quantity + delta) },
  });
}

async function moveItem(
  item: PartyInventoryItem,
  toLocation: InventoryLocation | "stash",
  containerId: string | null,
) {
  // 'stash' is a UI-only virtual location meaning carried_by=null, defaulting to backpack
  const location: InventoryLocation =
    toLocation === "stash" ? "backpack" : toLocation;
  const carriedBy =
    toLocation === "stash" ? null : (resolvedMemberId.value ?? null);
  await updateInventoryItem({
    id: item.id,
    update: {
      location,
      container_id: containerId,
      carried_by: carriedBy,
      ...(location !== "equipped" ? { is_equipped: false, slot: null } : {}),
    },
  });
}

function handleReorder(items: PartyInventoryItem[]) {
  reorderInventoryItems(
    items.map((item, i) => ({ id: item.id, sort_order: i * 100 })),
  );
}

async function removeItem(id: string) {
  if (!(await confirm("Remove this item?"))) return;
  await removeInventoryItem(id);
}

async function dropItemToChat(inv: PartyInventoryItem) {
  if (
    !(await confirm(
      `Drop "${inv.name}" to chat? It will be removed from your inventory.`,
    ))
  )
    return;
  const linkedItem = inv.item_id
    ? (allItems.value?.find((it) => it.id === inv.item_id) ?? null)
    : null;
  await sendItemDrop(
    inv.name,
    inv.item_id,
    inv.quantity,
    linkedItem?.rarity ?? null,
  );
  await removeInventoryItem(inv.id);
}

async function splitStack(inv: PartyInventoryItem) {
  const raw = window.prompt(
    `Split "${inv.name}" — how many to split off? (1–${inv.quantity - 1})`,
    "1",
  );
  if (raw === null) return;
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1 || n >= inv.quantity) {
    window.alert(`Enter a number between 1 and ${inv.quantity - 1}.`);
    return;
  }
  await updateInventoryItem({
    id: inv.id,
    update: { quantity: inv.quantity - n },
  });
  await addInventoryItem({
    name: inv.name,
    quantity: n,
    item_id: inv.item_id,
    carried_by: inv.carried_by,
    location: inv.location,
    slot: inv.slot,
    is_container: inv.is_container,
    container_id: inv.container_id,
    is_ruined: inv.is_ruined,
    is_attuned: false,
    is_equipped: inv.is_equipped,
    notes: inv.notes,
    is_identified: inv.is_identified,
  });
}

// ── Add container picker ───────────────────────────────────────────────────────
const showContainerPicker = ref(false);
const containerPickerSearch = ref("");

const containerCandidates = computed(() => {
  const q = containerPickerSearch.value.trim().toLowerCase();
  return myItems.value
    .filter(
      (i) =>
        !i.is_container &&
        i.location !== "equipped" &&
        (!q || i.name.toLowerCase().includes(q)),
    )
    .slice(0, 8);
});

async function promoteToContainer(item: PartyInventoryItem) {
  await updateInventoryItem({ id: item.id, update: { is_container: true } });
  showContainerPicker.value = false;
  containerPickerSearch.value = "";
}

function isMagicVaultItem(itemId: string | null): boolean {
  if (!itemId) return false;
  const item = (allItems.value ?? []).find((i) => i.id === itemId);
  return !!item && item.rarity !== "mundane";
}

async function addToLocation(
  location: PartyInventoryItem["location"],
  containerId: string | null,
  name: string,
  itemId: string | null,
) {
  await addInventoryItem({
    name,
    quantity: 1,
    item_id: itemId,
    carried_by: resolvedMemberId.value ?? null,
    location,
    slot: null,
    is_container: isContainerVaultItem(itemId),
    container_id: containerId,
    is_attuned: false,
    is_equipped: false,
    notes: null,
    is_ruined: false,
    is_identified: !isMagicVaultItem(itemId),
  });
}

// ── Item detail panel ──────────────────────────────────────────────────────────
const selectedInv = ref<PartyInventoryItem | null>(null);
const detailPanel = ref<InstanceType<typeof ItemDetailPanel> | null>(null);

async function openDetailWithSell(inv: PartyInventoryItem) {
  selectedInv.value = inv;
  await nextTick();
  detailPanel.value?.openSell();
}

async function handleSell(
  pp: number,
  gp: number,
  ep: number,
  sp: number,
  cp: number,
) {
  const inv = selectedInv.value;
  if (!inv || !member.value) return;
  await sendPlayerOffer(
    inv.name,
    inv.item_id,
    inv.id,
    inv.quantity,
    member.value.id,
    pp,
    gp,
    ep,
    sp,
    cp,
  );
  selectedInv.value = null;
}

const selectedVaultItem = computed<Item | null>(() => {
  if (!selectedInv.value?.item_id) return null;
  return (
    allItems.value?.find((it) => it.id === selectedInv.value!.item_id) ?? null
  );
});

function openDetail(inv: PartyInventoryItem) {
  selectedInv.value = inv;
}

// ── Add item combobox ──────────────────────────────────────────────────────────
const newItemName = ref("");
const newItemQty = ref(1);
const newItemSelectedId = ref("");
const showDropdown = ref(false);
const dropdownRefs = reactive<Record<number, HTMLButtonElement>>({});

const filteredItems = computed((): Item[] => {
  const q = newItemName.value.trim().toLowerCase();
  const all = allItems.value ?? [];
  if (!q) return all.slice(0, 8);
  return all.filter((it) => it.name.toLowerCase().includes(q));
});

function onAddInput() {
  newItemSelectedId.value = "";
  showDropdown.value = true;
}
function selectItem(it: Item) {
  newItemName.value = it.name;
  newItemSelectedId.value = it.id;
  showDropdown.value = false;
}
function focusDropdownItem(idx: number) {
  dropdownRefs[idx]?.focus();
}

async function addItem() {
  if (!newItemSelectedId.value) return;
  const vaultItem = (allItems.value ?? []).find((i) => i.id === newItemSelectedId.value) ?? null;
  const bundleItems = vaultItem?.bundle_items;

  if (bundleItems && bundleItems.length > 0) {
    // Pack: add the pack itself as a container, then expand contents inside it
    const packRow = await addInventoryItem({
      name: newItemName.value.trim(),
      quantity: newItemQty.value,
      item_id: vaultItem!.id,
      carried_by: resolvedMemberId.value ?? null,
      location: "backpack",
      slot: null,
      is_container: true,
      container_id: null,
      is_attuned: false,
      is_equipped: false,
      notes: null,
      is_ruined: false,
      is_identified: true,
    });
    for (const sub of bundleItems) {
      const subVault = (allItems.value ?? []).find(
        (i) => i.name.toLowerCase() === sub.name.toLowerCase(),
      ) ?? null;
      await addInventoryItem({
        name: sub.name,
        quantity: sub.quantity ?? 1,
        item_id: subVault?.id ?? null,
        carried_by: resolvedMemberId.value ?? null,
        location: "container",
        slot: null,
        is_container: subVault?.tags.includes("container") ?? false,
        container_id: packRow.id,
        is_attuned: false,
        is_equipped: false,
        notes: null,
        is_ruined: false,
        is_identified: !subVault || subVault.rarity === "mundane",
      });
    }
  } else {
    await addInventoryItem({
      name: newItemName.value.trim(),
      quantity: newItemQty.value,
      item_id: newItemSelectedId.value || null,
      carried_by: resolvedMemberId.value ?? null,
      location: "backpack",
      slot: null,
      is_container: isContainerVaultItem(newItemSelectedId.value || null),
      container_id: null,
      is_attuned: false,
      is_equipped: false,
      notes: null,
      is_ruined: false,
      is_identified: !isMagicVaultItem(newItemSelectedId.value || null),
    });
  }
  newItemName.value = "";
  newItemSelectedId.value = "";
  newItemQty.value = 1;
  showDropdown.value = false;
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
