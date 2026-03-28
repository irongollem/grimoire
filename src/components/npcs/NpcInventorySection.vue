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
        <span v-if="item.notes" class="font-fell text-xs text-muted-foreground italic truncate max-w-32">
          {{ item.notes }}
        </span>
        <button
          type="button"
          title="Drop to chat"
          class="p-1 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
          @click="dropToChat(item)"
        >
          <Gift class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Remove"
          class="p-1 rounded text-muted-foreground hover:text-destructive transition-colors shrink-0"
          @click="remove(item)"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <p v-else class="font-fell text-xs text-muted-foreground italic">No items on this NPC.</p>

    <!-- Add row -->
    <div class="flex items-center gap-2">
      <input
        v-model="newName"
        placeholder="Item name…"
        class="flex-1 bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @keydown.enter.prevent="add"
      />
      <input
        v-model.number="newQty"
        type="number"
        min="1"
        class="w-16 bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <button
        type="button"
        :disabled="!newName.trim() || adding"
        class="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 disabled:opacity-40 transition-opacity"
        @click="add"
      >
        <Plus class="h-3 w-3" />
        Add
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Gift, Plus, Trash2 } from "lucide-vue-next";
import { useNpcInventory, useAddNpcInventoryItem, useRemoveNpcInventoryItem } from "@/composables/useNpcInventory";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import type { NpcInventoryItem } from "@/types/npc-inventory.types";

const props = defineProps<{ npcId: string; npcName?: string }>();

const { data: rawItems } = useNpcInventory(props.npcId);
const items = computed(() => rawItems.value ?? []);
const { mutateAsync: addItem } = useAddNpcInventoryItem();
const { mutateAsync: removeItem } = useRemoveNpcInventoryItem();
const { sendItemDrop } = useCampaignMessages();

const newName = ref("");
const newQty = ref(1);
const adding = ref(false);

async function add() {
  if (!newName.value.trim()) return;
  adding.value = true;
  try {
    await addItem({ npc_id: props.npcId, item_id: null, name: newName.value.trim(), quantity: newQty.value, notes: null });
    newName.value = "";
    newQty.value = 1;
  } finally {
    adding.value = false;
  }
}

async function remove(item: NpcInventoryItem) {
  await removeItem({ id: item.id, npcId: props.npcId });
}

async function dropToChat(item: NpcInventoryItem) {
  await sendItemDrop(item.name, item.item_id, item.quantity, null, props.npcName);
}
</script>
