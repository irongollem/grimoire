<template>
  <div class="flex items-center gap-2 px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/10 transition-colors group">
    <div class="flex-1 min-w-0">
      <button
        type="button"
        class="font-fell text-sm text-foreground truncate text-left hover:text-primary transition-colors w-full"
        @click="$emit('open-detail', item)"
      >{{ item.name }}</button>
      <p v-if="item.notes" class="font-fell text-xs text-muted-foreground italic truncate">{{ item.notes }}</p>
      <p v-if="showCarrier && item.carried_by" class="font-cinzel text-[9px] text-muted-foreground/60 tracking-wider">
        {{ carrierName(item.carried_by) }}
      </p>
    </div>

    <!-- Qty -->
    <div class="flex items-center gap-1 shrink-0">
      <button class="h-4 w-4 rounded flex items-center justify-center hover:bg-muted border border-border transition-colors opacity-0 group-hover:opacity-100" @click="$emit('adjust-qty', item, -1)">
        <Minus class="h-2 w-2" />
      </button>
      <span class="font-cinzel text-xs font-semibold text-foreground min-w-4 text-center">{{ item.quantity }}</span>
      <button class="h-4 w-4 rounded flex items-center justify-center hover:bg-muted border border-border transition-colors opacity-0 group-hover:opacity-100" @click="$emit('adjust-qty', item, 1)">
        <Plus class="h-2 w-2" />
      </button>
    </div>

    <!-- Move to container dropdown -->
    <select
      class="text-[10px] font-cinzel bg-transparent border border-border rounded px-1 py-0.5 text-muted-foreground focus:outline-none opacity-0 group-hover:opacity-100 transition-opacity max-w-24"
      :value="currentLocationLabel"
      @change="onMove($event)"
    >
      <option value="backpack">Backpack</option>
      <option value="belt">Belt</option>
      <option v-for="c in allContainers" :key="c.id" :value="`container:${c.id}`">{{ c.name }}</option>
      <option value="stored">Stored</option>
    </select>

    <!-- Drop to chat -->
    <button
      class="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-amber-400 hover:bg-amber-400/10 transition-colors opacity-0 group-hover:opacity-100"
      title="Drop to chat"
      @click="$emit('drop-to-chat', item)"
    ><ArrowUpFromLine class="h-3 w-3" /></button>

    <!-- Remove -->
    <button
      class="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
      @click="$emit('remove', item.id)"
    ><Trash2 class="h-3 w-3" /></button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Plus, Minus, Trash2, ArrowUpFromLine } from "lucide-vue-next";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { PartyMember } from "@/types/party.types";

const props = defineProps<{
  item: PartyInventoryItem;
  allContainers: PartyInventoryItem[];
  showCarrier?: boolean;
  partyMembers?: PartyMember[];
}>();

const emit = defineEmits<{
  'adjust-qty': [item: PartyInventoryItem, delta: number];
  'move': [item: PartyInventoryItem, location: string, containerId?: string];
  'remove': [id: string];
  'drop-to-chat': [item: PartyInventoryItem];
  'open-detail': [item: PartyInventoryItem];
}>();

const currentLocationLabel = computed(() => {
  if (props.item.location === 'container' && props.item.container_id)
    return `container:${props.item.container_id}`;
  return props.item.location;
});

function carrierName(id: string) {
  return props.partyMembers?.find(m => m.id === id)?.name ?? null;
}

function onMove(e: Event) {
  const val = (e.target as HTMLSelectElement).value;
  if (val.startsWith('container:')) {
    emit('move', props.item, 'container', val.slice(10));
  } else {
    emit('move', props.item, val);
  }
}
</script>
