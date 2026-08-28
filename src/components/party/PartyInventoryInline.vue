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
        <AppInput
          ref="searchInputRef"
          v-model="newItem.name"
          size="body"
          placeholder="Search vault or enter custom name…"
          required
          autocomplete="off"
          @input="onItemSearchInput"
          @focus="onItemSearchInput"
          @keydown.escape="showItemDropdown = false"
          @keydown.down.prevent="focusDropdownItem(0)"
        />
        <div
          v-if="showItemDropdown && (catalogItems?.length ?? 0) > 0"
          class="absolute left-0 top-full mt-0.5 z-20 w-full rounded-md border border-border bg-card shadow-lg overflow-hidden max-h-48 overflow-y-auto"
        >
          <AppButton
            v-for="(item, idx) in filteredCatalogItems"
            :key="item.id"
            :ref="(el) => setDropdownItemRef(idx, el)"
            variant="menu"
            size="body"
            block
            class="items-baseline"
            @click="selectCatalogItem(item)"
            @keydown.down.prevent="focusDropdownItem(idx + 1)"
            @keydown.up.prevent="idx === 0 ? undefined : focusDropdownItem(idx - 1)"
            @keydown.escape="showItemDropdown = false"
          >
            <span class="truncate">{{ item.name }}</span>
            <span class="font-cinzel text-2xs text-muted-foreground shrink-0 capitalize">{{ item.rarity }}</span>
          </AppButton>
          <div v-if="newItem.name.trim()" class="border-t border-border">
            <AppButton
              variant="menu"
              size="body"
              block
              class="text-primary"
              :icon="IconExternalLink"
              :label='`Create "${newItem.name.trim()}" in Vault`'
              @click="router.push({ path: '/vault/new', query: { name: newItem.name.trim(), redirect: '/party' } })"
            />
          </div>
        </div>
        <div v-if="showItemDropdown" class="fixed inset-0 z-10" @click="showItemDropdown = false" />
      </div>
      <AppInput
        v-model.number="newItem.quantity"
        type="number"
        min="1"
        size="body"
        align="center"
        placeholder="Qty"
        :block="false"
        class="w-14"
      />
      <AppSelect
        v-model="newItem.carried_by"
        size="body"
        weight="normal"
      >
        <option value="">— party</option>
        <option v-for="m in party" :key="m.id" :value="m.id">{{ m.name }}</option>
      </AppSelect>
      <AppInput
        v-model="newItem.notes"
        size="body"
        placeholder="Notes (optional)"
        :block="false"
        class="flex-1 min-w-32"
      />
      <div class="flex gap-1.5 ml-auto">
        <AppButton variant="subtle" size="sm" label="Cancel" @click="addItemOpen = false" />
        <AppButton
          variant="tinted"
          size="sm"
          label="Drop in Chat"
          :disabled="!newItem.selectedItemId && !newItem.name.trim()"
          tone="caution"
          emphasis="soft"
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
              :class="RARITY_SURFACE_BG[catalogItemMap.get(item.item_id)!.rarity]"
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
        <AppSelect
          :model-value="item.carried_by ?? ''"
          tone="muted"
          size="caption"
          weight="normal"
          class="hidden sm:block max-w-28"
          @update:model-value="(value) => updateCarrier(item, value)"
        >
          <option value="">— party</option>
          <option v-for="m in party" :key="m.id" :value="m.id">{{ m.name }}</option>
        </AppSelect>
        <AppButton
          :variant="item.is_attuned ? 'tinted' : 'subtle'"
          :class="item.is_attuned ? '' : 'text-muted-foreground/40 hover:text-muted-foreground'"
          size="xs"
          label="ATT"
          tooltip="Toggle attunement"
          tone="caution"
          emphasis="soft"
          @click="toggleAttuned(item)"
        />
        <AppButton
          variant="ghost"
          tone="caution"
          fill="tone"
          size="icon-xs"
          :icon="IconArrowUp"
          tooltip="Drop to chat"
          class="shrink-0 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/40"
          @click="dropInventoryItemToChat(item)"
        />
        <AppButton
          variant="ghost"
          tone="danger"
          fill="tone"
          size="icon-xs"
          class="shrink-0 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 text-muted-foreground/40"
          :icon="IconDelete"
          @click="removeItem(item.id)"
        />
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
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import type { AppInputHandle } from "@/components/common/fieldVariants";
import { usePartyInventory, useAddInventoryItem, useUpdateInventoryItem, useRemoveInventoryItem } from "@/composables/items/usePartyInventory";
import { useItems, useEnsureOwnedItem } from "@/composables/items/useItems";
import type { Item } from "@/types/item.types";
import { ITEM_TYPE_LABELS, RARITY_SURFACE_BG } from "@/types/item.types";
import { useCampaignStore } from "@/stores/campaign";
import { sendCampaignAnnouncement } from "@/composables/campaign/useCampaignBroadcast";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
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
const searchInputRef = ref<AppInputHandle | null>(null);
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

// AppButton exposes `$el` (the real <button>), not the raw DOM node, when bound
// via `ref` — see reka-ui's useForwardExpose. Unwrap it here so
// `focusDropdownItem` above keeps calling `.focus()` on an actual HTMLButtonElement,
// exactly as it did against the native `<button ref="...">` this replaced.
function setDropdownItemRef(idx: number, el: unknown) {
  if (el && typeof el === "object" && "$el" in el) {
    dropdownItemRefs[idx] = (el as { $el: HTMLButtonElement }).$el;
  }
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
