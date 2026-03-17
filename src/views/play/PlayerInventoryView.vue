<template>
  <div class="space-y-4">
    <h2 class="font-cinzel text-xl font-bold text-foreground">Inventory</h2>

    <div v-if="isLoading" class="flex justify-center py-12">
      <LoadingSpinner />
    </div>

    <template v-else>
      <!-- ── My Items ── -->
      <div>
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2 px-0.5">My Items</p>
        <div v-if="myInventory.length" class="rounded-lg border border-border bg-card overflow-hidden">
          <table class="w-full">
            <thead>
              <tr class="border-b border-border bg-muted/20">
                <th class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider text-left px-4 py-2">Item</th>
                <th class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider text-center px-3 py-2">Qty</th>
                <th class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider text-center px-3 py-2 hidden sm:table-cell">Equip</th>
                <th class="px-1 py-2 w-8" />
                <th class="px-1 py-2 w-8" />
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="inv in myInventory" :key="inv.id" class="hover:bg-muted/10 transition-colors">
                <td class="px-4 py-3">
                  <p class="font-fell text-sm text-foreground">{{ inv.name }}</p>
                  <p v-if="inv.notes" class="font-fell text-xs text-muted-foreground italic mt-0.5">{{ inv.notes }}</p>
                </td>
                <td class="px-3 py-3">
                  <div class="flex items-center justify-center gap-1.5">
                    <button
                      class="h-5 w-5 rounded flex items-center justify-center bg-muted/50 hover:bg-muted border border-border transition-colors"
                      @click="adjustQty(inv, -1)"
                    ><Minus class="h-2.5 w-2.5" /></button>
                    <span class="font-cinzel text-sm font-semibold text-foreground min-w-6 text-center">{{ inv.quantity }}</span>
                    <button
                      class="h-5 w-5 rounded flex items-center justify-center bg-muted/50 hover:bg-muted border border-border transition-colors"
                      @click="adjustQty(inv, 1)"
                    ><Plus class="h-2.5 w-2.5" /></button>
                  </div>
                </td>
                <td class="px-3 py-3 text-center hidden sm:table-cell">
                  <button
                    class="px-2 py-0.5 rounded border font-cinzel text-[10px] tracking-wider transition-colors"
                    :class="inv.is_equipped
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'"
                    @click="toggleEquipped(inv)"
                  >{{ inv.is_equipped ? 'Equipped' : 'Equip' }}</button>
                </td>
                <td class="px-1 py-3">
                  <button
                    class="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/50 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
                    title="Drop to chat"
                    @click="dropItemToChat(inv)"
                  ><ArrowUpFromLine class="h-3.5 w-3.5" /></button>
                </td>
                <td class="px-1 py-3">
                  <button
                    class="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    @click="removeItem(inv.id)"
                  ><Trash2 class="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="rounded-lg border border-dashed border-border p-6 text-center">
          <p class="font-fell text-sm text-muted-foreground italic">You carry nothing.</p>
        </div>
      </div>

      <!-- ── Party Stash ── -->
      <div>
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2 px-0.5">Party Stash</p>
        <div v-if="partyStash.length" class="rounded-lg border border-border bg-card overflow-hidden">
          <table class="w-full">
            <thead>
              <tr class="border-b border-border bg-muted/20">
                <th class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider text-left px-4 py-2">Item</th>
                <th class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider text-center px-3 py-2">Qty</th>
                <th class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider text-center px-3 py-2 hidden sm:table-cell">Carried By</th>
                <th class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider text-center px-3 py-2 hidden sm:table-cell">Take</th>
                <th class="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="inv in partyStash" :key="inv.id" class="hover:bg-muted/10 transition-colors">
                <td class="px-4 py-3">
                  <p class="font-fell text-sm text-foreground">{{ inv.name }}</p>
                  <p v-if="inv.notes" class="font-fell text-xs text-muted-foreground italic mt-0.5">{{ inv.notes }}</p>
                </td>
                <td class="px-3 py-3">
                  <div class="flex items-center justify-center gap-1.5">
                    <button
                      class="h-5 w-5 rounded flex items-center justify-center bg-muted/50 hover:bg-muted border border-border transition-colors"
                      @click="adjustQty(inv, -1)"
                    ><Minus class="h-2.5 w-2.5" /></button>
                    <span class="font-cinzel text-sm font-semibold text-foreground min-w-6 text-center">{{ inv.quantity }}</span>
                    <button
                      class="h-5 w-5 rounded flex items-center justify-center bg-muted/50 hover:bg-muted border border-border transition-colors"
                      @click="adjustQty(inv, 1)"
                    ><Plus class="h-2.5 w-2.5" /></button>
                  </div>
                </td>
                <td class="px-3 py-3 text-center hidden sm:table-cell">
                  <span class="font-fell text-sm text-muted-foreground">{{ carrierName(inv.carried_by) ?? '—' }}</span>
                </td>
                <td class="px-3 py-3 text-center hidden sm:table-cell">
                  <button
                    class="px-2 py-0.5 rounded border border-border font-cinzel text-[10px] tracking-wider text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                    @click="takeItem(inv)"
                  >Take</button>
                </td>
                <td class="px-3 py-3">
                  <button
                    class="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    @click="removeItem(inv.id)"
                  ><Trash2 class="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="rounded-lg border border-dashed border-border p-6 text-center">
          <p class="font-fell text-sm text-muted-foreground italic">The party stash is empty.</p>
        </div>
      </div>

      <!-- ── Add Item ── -->
      <form class="rounded-lg border border-border bg-card p-4" @submit.prevent="addItem">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-3">Add Item</p>
        <div class="flex items-center gap-2">
          <div class="relative flex-1 min-w-0">
            <input
              v-model="newItemName"
              type="text"
              placeholder="Search vault…"
              autocomplete="off"
              class="w-full bg-muted/30 border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              @input="onAddItemInput"
              @focus="onAddItemInput"
              @keydown.escape="showAddDropdown = false"
              @keydown.down.prevent="focusDropdownItem(0)"
            />
            <div
              v-if="showAddDropdown && filteredItems.length"
              class="absolute left-0 bottom-full mb-0.5 z-20 w-full rounded-md border border-border bg-card shadow-lg overflow-hidden max-h-52 overflow-y-auto"
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
                @keydown.escape="showAddDropdown = false"
              >
                <span class="truncate">{{ it.name }}</span>
                <span class="font-cinzel text-[10px] text-muted-foreground shrink-0 capitalize">{{ it.rarity }}</span>
              </button>
            </div>
            <div v-if="showAddDropdown" class="fixed inset-0 z-10" @click="showAddDropdown = false" />
          </div>
          <input
            v-model.number="newItemQty"
            type="number"
            min="1"
            class="w-16 bg-muted/30 border border-border rounded-md px-2 py-1.5 font-cinzel text-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="submit"
            class="px-3 py-1.5 bg-primary text-primary-foreground rounded-md font-cinzel text-xs tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
            :disabled="!newItemName.trim()"
          >Add</button>
        </div>
      </form>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from "vue";
import { Plus, Minus, Trash2, ArrowUpFromLine } from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useParty } from "@/composables/useParty";
import { usePartyInventory, useAddInventoryItem, useUpdateInventoryItem, useRemoveInventoryItem } from "@/composables/usePartyInventory";
import { useItems } from "@/composables/useItems";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";

const auth = useAuthStore();
const ui = useUiStore();
const { data: partyMembers } = useParty();
const { data: inventory, isLoading } = usePartyInventory();
const { data: allItems } = useItems();
const { mutateAsync: addInventoryItem } = useAddInventoryItem();
const { mutateAsync: updateInventoryItem } = useUpdateInventoryItem();
const { mutateAsync: removeInventoryItem } = useRemoveInventoryItem();
const { sendItemDrop } = useCampaignMessages();

const resolvedMemberId = computed(() =>
  ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId
);

const myInventory = computed(() =>
  (inventory.value ?? []).filter((i) => i.carried_by === resolvedMemberId.value)
);
const partyStash = computed(() =>
  (inventory.value ?? []).filter((i) => i.carried_by === null)
);

function carrierName(id: string | null): string | null {
  if (!id || !partyMembers.value) return null;
  return partyMembers.value.find((m) => m.id === id)?.name ?? null;
}

async function adjustQty(item: PartyInventoryItem, delta: number) {
  await updateInventoryItem({ id: item.id, update: { quantity: Math.max(1, item.quantity + delta) } });
}

async function toggleEquipped(item: PartyInventoryItem) {
  await updateInventoryItem({ id: item.id, update: { is_equipped: !item.is_equipped } });
}

async function takeItem(item: PartyInventoryItem) {
  await updateInventoryItem({ id: item.id, update: { carried_by: resolvedMemberId.value ?? null } });
}

async function removeItem(id: string) {
  if (!confirm("Remove this item from the party inventory?")) return;
  await removeInventoryItem(id);
}

async function dropItemToChat(inv: PartyInventoryItem) {
  if (!confirm(`Drop "${inv.name}" to chat? It will be removed from your inventory.`)) return;
  const linkedItem = inv.item_id ? (allItems.value?.find(it => it.id === inv.item_id) ?? null) : null;
  await sendItemDrop(inv.name, inv.item_id, inv.quantity, linkedItem?.rarity ?? null);
  await removeInventoryItem(inv.id);
}

// ── Add item combobox ──────────────────────────────────────────────────────────
const newItemName = ref("");
const newItemQty = ref(1);
const newItemSelectedId = ref("");
const showAddDropdown = ref(false);
const dropdownRefs = reactive<Record<number, HTMLButtonElement>>({});

const filteredItems = computed((): Item[] => {
  const q = newItemName.value.trim().toLowerCase();
  const all = allItems.value ?? [];
  if (!q) return all.slice(0, 8);
  return all.filter((it) => it.name.toLowerCase().includes(q)).slice(0, 8);
});

function onAddItemInput() {
  newItemSelectedId.value = "";
  showAddDropdown.value = true;
}

function selectItem(it: Item) {
  newItemName.value = it.name;
  newItemSelectedId.value = it.id;
  showAddDropdown.value = false;
}

function focusDropdownItem(idx: number) {
  dropdownRefs[idx]?.focus();
}

async function addItem() {
  if (!newItemName.value.trim()) return;
  await addInventoryItem({
    name: newItemName.value.trim(),
    quantity: newItemQty.value,
    item_id: newItemSelectedId.value || null,
    carried_by: resolvedMemberId.value ?? null,
    is_attuned: false,
    is_equipped: false,
    notes: null,
  });
  newItemName.value = "";
  newItemSelectedId.value = "";
  newItemQty.value = 1;
  showAddDropdown.value = false;
}
</script>
