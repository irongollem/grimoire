<template>
  <div class="mt-6 rounded-lg border border-border bg-card">
    <div class="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
      <span class="text-label-lg font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
        <IconInventory class="h-3.5 w-3.5" /> Party Inventory
      </span>
      <AppButton variant="link" size="inline-xs" label="+ Add Item" @click="openAddItem" />
    </div>

    <form v-if="addItemOpen" class="flex flex-wrap gap-2 px-4 py-3 border-b border-border bg-muted/10" @submit.prevent="submitAddItem">
      <div class="relative flex-1 min-w-32">
        <input
          ref="searchInputRef"
          v-model="newItem.name"
          placeholder="Search vault or enter custom name…"
          required
          autocomplete="off"
          class="w-full bg-background border border-border rounded px-2 py-1.5 text-body text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
          @input="onItemSearchInput"
          @focus="onItemSearchInput"
          @keydown.escape="showItemDropdown = false"
          @keydown.down.prevent="focusDropdownItem(0)"
        />
        <div
          v-if="showItemDropdown && (catalogItems?.length ?? 0) > 0"
          class="absolute left-0 top-full mt-0.5 z-20 w-full rounded-md border border-border bg-card shadow-lg overflow-hidden max-h-48 overflow-y-auto"
        >
          <button
            v-for="(item, idx) in filteredCatalogItems"
            :key="item.id"
            :ref="(el) => { if (el) dropdownItemRefs[idx] = el as HTMLButtonElement }"
            type="button"
            class="w-full text-left px-3 py-1.5 text-body text-foreground hover:bg-muted transition-colors flex items-baseline gap-2"
            @click="selectCatalogItem(item)"
            @keydown.down.prevent="focusDropdownItem(idx + 1)"
            @keydown.up.prevent="idx === 0 ? undefined : focusDropdownItem(idx - 1)"
            @keydown.escape="showItemDropdown = false"
          >
            <span class="truncate">{{ item.name }}</span>
            <span class="font-cinzel text-2xs text-muted-foreground shrink-0 capitalize">{{ item.rarity }}</span>
          </button>
          <div v-if="newItem.name.trim()" class="border-t border-border">
            <button
              type="button"
              class="w-full text-left px-3 py-1.5 text-body text-primary hover:bg-muted transition-colors flex items-center gap-2"
              @click="router.push({ path: '/vault/new', query: { name: newItem.name.trim(), redirect: '/party' } })"
            >
              <IconExternalLink class="h-3.5 w-3.5 shrink-0" />
              Create "{{ newItem.name.trim() }}" in Vault
            </button>
          </div>
        </div>
        <div v-if="showItemDropdown" class="fixed inset-0 z-10" @click="showItemDropdown = false" />
      </div>
      <input
        v-model.number="newItem.quantity"
        type="number"
        min="1"
        placeholder="Qty"
        class="w-14 bg-background border border-border rounded px-2 py-1.5 text-body text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <select
        v-model="newItem.carried_by"
        class="bg-background border border-border rounded px-2 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">— party</option>
        <option v-for="m in party" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
      <input
        v-model="newItem.notes"
        placeholder="Notes (optional)"
        class="flex-1 min-w-32 bg-background border border-border rounded px-2 py-1.5 text-body text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div class="flex gap-1.5 ml-auto">
        <AppButton variant="subtle" size="sm" label="Cancel" @click="addItemOpen = false" />
        <AppButton
          variant="tinted"
          size="sm"
          label="Drop in Chat"
          :disabled="!newItem.selectedItemId && !newItem.name.trim()"
          class="border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
          @click="dropNewItemToChat"
        />
        <AppButton type="submit" variant="primary" size="sm" label="Add" :disabled="addingItem" />
      </div>
    </form>

    <div v-if="inventory?.length" class="divide-y divide-border">
      <div
        v-for="item in inventory"
        :key="item.id"
        class="flex items-center gap-3 px-4 py-2.5 group"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 min-w-0">
            <span
              v-if="item.item_id && catalogItemMap.get(item.item_id)"
              class="shrink-0 w-2 h-2 rounded-full"
              :style="{ backgroundColor: RARITY_COLORS[catalogItemMap.get(item.item_id)!.rarity] }"
              :title="catalogItemMap.get(item.item_id)!.rarity"
            />
            <RouterLink
              v-if="item.item_id"
              :to="`/vault/${item.item_id}`"
              class="text-body text-foreground leading-tight truncate hover:text-primary transition-colors"
            >{{ item.name }}</RouterLink>
            <p v-else class="text-body text-foreground leading-tight truncate">{{ item.name }}</p>
            <span
              v-if="item.item_id && catalogItemMap.get(item.item_id)"
              class="hidden sm:inline font-cinzel text-2xs text-muted-foreground/60 shrink-0"
            >{{ ITEM_TYPE_LABELS[catalogItemMap.get(item.item_id)!.item_type] }}</span>
          </div>
          <p v-if="item.notes" class="text-caption text-muted-foreground italic truncate">{{ item.notes }}</p>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button type="button" class="count-btn-sm" @click="changeQty(item, -1)">−</button>
          <span class="font-cinzel text-xs font-bold text-foreground w-5 text-center">{{ item.quantity }}</span>
          <button type="button" class="count-btn-sm" @click="changeQty(item, 1)">+</button>
        </div>
        <select
          :value="item.carried_by ?? ''"
          class="hidden sm:block bg-muted/40 border border-border rounded px-2 py-0.5 text-caption text-foreground focus:outline-none focus:ring-1 focus:ring-ring shrink-0 max-w-28"
          @change="updateCarrier(item, ($event.target as HTMLSelectElement).value)"
        >
          <option value="">— party</option>
          <option v-for="m in party" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
        <AppButton
          variant="tinted"
          size="xs"
          label="ATT"
          tooltip="Toggle attunement"
          :class="item.is_attuned
            ? 'border-amber-400/50 bg-amber-400/10 text-amber-400 hover:text-amber-400 hover:border-amber-400/50'
            : 'border-border text-muted-foreground/40 hover:text-muted-foreground hover:border-border'"
          @click="toggleAttuned(item)"
        />
        <button
          type="button"
          class="shrink-0 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 rounded flex items-center justify-center text-muted-foreground/40 hover:text-amber-400 hover:bg-amber-400/10"
          title="Drop to chat"
          @click="dropInventoryItemToChat(item)"
        >
          <IconArrowUp class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          class="shrink-0 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive"
          @click="removeItem(item.id)"
        >
          <IconDelete class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
    <div v-else-if="!addItemOpen" class="px-4 py-6 text-center">
      <p class="text-caption text-muted-foreground italic">No items yet. Add loot, equipment, or quest items.</p>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, nextTick } from "vue";
import { useRouter } from "vue-router";
import { IconArrowUp, IconDelete, IconExternalLink, IconInventory } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import { usePartyInventory, useAddInventoryItem, useUpdateInventoryItem, useRemoveInventoryItem } from "@/composables/usePartyInventory";
import { useItems, useEnsureOwnedItem } from "@/composables/useItems";
import type { Item } from "@/types/item.types";
import { ITEM_TYPE_LABELS, RARITY_COLORS } from "@/types/item.types";
import { useCampaignStore } from "@/stores/campaign";
import { sendCampaignAnnouncement } from "@/composables/useCampaignBroadcast";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import type { PartyMember } from "@/types/party.types";

const { party } = defineProps<{ party: PartyMember[] }>();

const router = useRouter();
const campaign = useCampaignStore();
const { sendItemDrop } = useCampaignMessages();
const { data: inventoryAll } = usePartyInventory();
const inventory = computed(() => (inventoryAll.value ?? []).filter((i) => i.carried_by === null));
const { mutateAsync: addInventoryItem, isPending: addingItem } = useAddInventoryItem();
const { mutateAsync: updateInventoryItem } = useUpdateInventoryItem();
const { mutateAsync: removeInventoryItem } = useRemoveInventoryItem();

const { data: catalogItems } = useItems();
const { ensureOwnedItem } = useEnsureOwnedItem();
const catalogItemMap = computed(() => {
  const map = new Map<string, Item>();
  for (const item of catalogItems.value ?? []) map.set(item.id, item);
  return map;
});

const addItemOpen = ref(false);
const searchInputRef = ref<HTMLInputElement | null>(null);
const newItem = reactive({ name: "", quantity: 1, carried_by: "", notes: "", selectedItemId: "", isAttuned: false });
const showItemDropdown = ref(false);
const dropdownItemRefs = reactive<Record<number, HTMLButtonElement>>({});

const filteredCatalogItems = computed((): Item[] => {
  const q = newItem.name.trim().toLowerCase();
  const all = catalogItems.value ?? [];
  if (!q) return all.slice(0, 8);
  return all.filter((item) =>
    item.name.toLowerCase().includes(q) ||
    (item.subtype ?? "").toLowerCase().includes(q) ||
    item.tags.some((t) => t.toLowerCase().includes(q))
  ).slice(0, 8);
});

function onItemSearchInput() {
  newItem.selectedItemId = "";
  showItemDropdown.value = true;
}

async function selectCatalogItem(item: Item) {
  newItem.name = item.name;
  newItem.selectedItemId = item.id;
  newItem.isAttuned = item.requires_attunement;
  showItemDropdown.value = false;
  // Srd rows carry a slug id — clone into the user's own items on pick, before
  // anything downstream (submit, "Drop in Chat") can persist it as a FK.
  const owned = await ensureOwnedItem(item);
  if (newItem.selectedItemId === item.id) newItem.selectedItemId = owned.id;
}

function focusDropdownItem(idx: number) {
  const el = dropdownItemRefs[idx];
  if (el) el.focus();
}

function openAddItem() {
  newItem.name = ""; newItem.quantity = 1; newItem.carried_by = ""; newItem.notes = "";
  newItem.selectedItemId = ""; newItem.isAttuned = false;
  showItemDropdown.value = false;
  addItemOpen.value = true;
  void nextTick(() => searchInputRef.value?.focus());
}

async function submitAddItem() {
  const name = newItem.name.trim();
  if (!name) return;
  if (!newItem.selectedItemId) {
    router.push({ path: "/vault/new", query: { name, redirect: "/party" } });
    return;
  }
  const vaultItem = (catalogItems.value ?? []).find((i) => i.id === newItem.selectedItemId);
  await addInventoryItem({
    name,
    quantity: newItem.quantity,
    carried_by: newItem.carried_by || null,
    notes: newItem.notes.trim() || null,
    is_attuned: newItem.isAttuned,
    item_id: newItem.selectedItemId,
    is_equipped: false,
    location: 'backpack',
    slot: null,
    is_container: false,
    container_id: null,
    is_ruined: false,
    is_identified: !vaultItem || vaultItem.rarity === 'mundane',
  });
  if (campaign.activeCampaignId)
    void sendCampaignAnnouncement(campaign.activeCampaignId, `🎒 Item added to inventory: "${name}"`);
  addItemOpen.value = false;
  showItemDropdown.value = false;
}

async function changeQty(item: { id: string; quantity: number }, delta: number) {
  const q = Math.max(1, item.quantity + delta);
  await updateInventoryItem({ id: item.id, update: { quantity: q } });
}

async function updateCarrier(item: { id: string }, value: string) {
  await updateInventoryItem({ id: item.id, update: { carried_by: value || null } });
}

async function toggleAttuned(item: { id: string; is_attuned: boolean }) {
  await updateInventoryItem({ id: item.id, update: { is_attuned: !item.is_attuned } });
}

async function removeItem(id: string) {
  await removeInventoryItem(id);
}

async function dropInventoryItemToChat(item: { id: string; name: string; quantity: number; item_id: string | null }) {
  const linked = item.item_id ? catalogItemMap.value.get(item.item_id) : undefined;
  await sendItemDrop(item.name, item.item_id, item.quantity, linked?.rarity ?? null);
  await removeInventoryItem(item.id);
}

async function dropNewItemToChat() {
  const name = newItem.name.trim();
  if (!name) return;
  const linked = newItem.selectedItemId ? catalogItemMap.value.get(newItem.selectedItemId) : undefined;
  await sendItemDrop(name, newItem.selectedItemId || null, newItem.quantity, linked?.rarity ?? null);
  addItemOpen.value = false;
  showItemDropdown.value = false;
  newItem.name = ''; newItem.quantity = 1; newItem.carried_by = ''; newItem.notes = ''; newItem.selectedItemId = '';
}
</script>

<style scoped>
@reference "@/assets/main.css";
.count-btn-sm {
  @apply w-5 h-5 rounded bg-muted border border-border font-cinzel text-xs flex items-center justify-center hover:bg-card transition-colors leading-none;
}
</style>
