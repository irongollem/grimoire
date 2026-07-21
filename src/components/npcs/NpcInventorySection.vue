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
        <span class="flex-1 font-fell text-sm text-foreground truncate">
          {{ item.quantity > 1 ? `${item.quantity}× ` : "" }}{{ item.name }}
        </span>
        <RouterLink
          v-if="item.item_id"
          :to="`/vault/${item.item_id}`"
          class="font-cinzel text-2xs text-primary hover:opacity-80 transition-opacity shrink-0"
          title="View in vault"
        >Vault</RouterLink>
        <span v-if="item.notes" class="font-fell text-xs text-muted-foreground italic truncate max-w-32">
          {{ item.notes }}
        </span>
        <button
          type="button"
          title="Drop to chat"
          class="p-1 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
          @click="dropToChat(item)"
        >
          <IconLoot class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Remove"
          class="p-1 rounded text-muted-foreground hover:text-destructive transition-colors shrink-0"
          @click="remove(item)"
        >
          <IconDelete class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <p v-else class="font-fell text-xs text-muted-foreground italic">No items on this NPC.</p>

    <!-- Add from vault -->
    <div class="flex items-center gap-2">
      <EntityCombobox
        v-model="selectedVaultId"
        :options="vaultItems ?? []"
        placeholder="Search vault items…"
        class="flex-1"
      />
      <button
        type="button"
        :disabled="!selectedVaultId || adding"
        class="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 disabled:opacity-40 transition-opacity shrink-0"
        @click="addFromVault"
      >
        <IconAdd class="h-3 w-3" />
        Add
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconDelete, IconLoot } from '@/lib/icons';
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useNpcInventory, useAddNpcInventoryItem, useRemoveNpcInventoryItem } from "@/composables/useNpcInventory";
import { useItems } from "@/composables/useItems";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import type { NpcInventoryItem } from "@/types/npc-inventory.types";

const props = defineProps<{ npcId: string; npcName?: string }>();

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
    await addItem({ npc_id: props.npcId, item_id: vaultItem.id, name: vaultItem.name, quantity: 1, notes: null });
    selectedVaultId.value = "";
  } finally {
    adding.value = false;
  }
}

async function remove(item: NpcInventoryItem) {
  await removeItem({ id: item.id, npcId: props.npcId });
}

async function dropToChat(item: NpcInventoryItem) {
  await sendItemDrop(item.name, item.item_id, item.quantity, null, props.npcName);
  await removeItem({ id: item.id, npcId: props.npcId });
}
</script>
