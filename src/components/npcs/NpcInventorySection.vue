<template>
  <section class="space-y-3">
    <h3 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">Inventory</h3>

    <!-- Item list -->
    <div v-if="items.length > 0" class="flex flex-col gap-1">
      <div
        v-for="item in items"
        :key="item.id"
        class="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
      >
        <span class="flex-1 text-body text-foreground truncate">
          {{ item.quantity > 1 ? `${item.quantity}× ` : "" }}{{ item.name }}
        </span>
        <AppButton
          v-if="inventoryItemRef(item)"
          variant="link"
          size="inline-xs"
          :to="`/vault/${inventoryItemRef(item)}`"
          tooltip="View in vault"
          label="Vault"
          class="shrink-0"
        />
        <span v-if="item.notes" class="text-caption text-muted-foreground italic truncate max-w-32">
          {{ item.notes }}
        </span>
        <AppButton
          variant="ghost"
          size="icon-xs"
          tooltip="Drop to chat"
          :icon="IconLoot"
          class="shrink-0"
          @click="dropToChat(item)"
        />
        <AppButton
          variant="ghost"
          tone="danger"
          size="icon-xs"
          tooltip="Remove"
          :icon="IconDelete"
          class="shrink-0"
          @click="remove(item)"
        />
      </div>
    </div>

    <p v-else class="text-caption text-muted-foreground italic">No items on this NPC.</p>

    <!-- Add from vault -->
    <div class="flex items-center gap-2">
      <EntityCombobox
        v-model="selectedVaultId"
        :options="vaultItems ?? []"
        placeholder="Search vault items…"
        class="flex-1"
      />
      <AppButton
        variant="primary"
        size="sm"
        :icon="IconAdd"
        icon-size="xs"
        label="Add"
        :disabled="!selectedVaultId || adding"
        class="shrink-0"
        @click="addFromVault"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconDelete, IconLoot } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useNpcInventory, useAddNpcInventoryItem, useRemoveNpcInventoryItem } from "@/composables/items/useNpcInventory";
import { useItems } from "@/composables/items/useItems";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { inventoryItemRef, itemRefColumns } from "@/lib/itemRef";
import type { NpcInventoryItem } from "@/types/npc-inventory.types";

/** `npcName` is the players' name for this NPC — an unrevealed alter ego's
 *  cover, never the true name behind it. It is the chat `sender_name` on the
 *  drop, so a parent passing `npc.name` raw spoils the disguise. Nullable:
 *  `getNpcDisplayName` is honestly null for a player projection, and the drop
 *  then falls back to the DM's own sender name rather than inventing one. */
const props = defineProps<{ npcId: string; npcName?: string | null }>();

const { data: rawItems } = useNpcInventory(props.npcId);
const items = computed(() => rawItems.value ?? []);
const { mutateAsync: addItem } = useAddNpcInventoryItem();
const { mutateAsync: removeItem } = useRemoveNpcInventoryItem();
const { sendItemDrop } = useCampaignMessages();
const { data: vaultItems } = useItems();

const selectedVaultId = ref("");
const adding = ref(false);

async function addFromVault() {
  if (!selectedVaultId.value) return;
  const vaultItem = vaultItems.value?.find((i) => i.id === selectedVaultId.value);
  if (!vaultItem) return;
  adding.value = true;
  try {
    // The picker offers vault items and shared library content in one list —
    // itemRefColumns routes to whichever column the picked id actually is
    // (#819), rather than cloning library content into the vault first.
    await addItem({ npc_id: props.npcId, ...itemRefColumns(vaultItem.id), name: vaultItem.name, quantity: 1, notes: null });
    selectedVaultId.value = "";
  } finally {
    adding.value = false;
  }
}

async function remove(item: NpcInventoryItem) {
  await removeItem({ id: item.id, npcId: props.npcId });
}

async function dropToChat(item: NpcInventoryItem) {
  // `inventoryItemRef`, not `item.item_id`: a library-sourced row keeps its
  // reference in the other column, and reading the raw one dropped it.
  await sendItemDrop(item.name, inventoryItemRef(item), item.quantity, null, props.npcName ?? undefined);
  await removeItem({ id: item.id, npcId: props.npcId });
}
</script>
