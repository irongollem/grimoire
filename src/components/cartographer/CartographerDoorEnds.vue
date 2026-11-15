<template>
  <div class="flex w-full flex-col gap-1.5">
    <span class="text-label text-muted-foreground">Connects which rooms?</span>
    <!-- EntityCombobox is `flex-1` at its root, so the pair shares the slip's width instead of taking a fixed one. -->
    <div class="flex gap-1.5">
      <EntityCombobox v-model="fromId" :options="fromOptions" placeholder="One side…" />
      <EntityCombobox v-model="toId" :options="toOptions" placeholder="Nowhere yet" />
    </div>
    <div class="flex items-center gap-1.5">
      <AppButton variant="primary" size="xs" :disabled="!fromId" @click="place">Place door</AppButton>
      <AppButton variant="ghost" fill="muted" size="xs" @click="$emit('cancel')">Cancel</AppButton>
    </div>
    <span class="text-caption-sm text-muted-foreground">
      No room bound to a place lies beside this door, so the map cannot tell. Leave the second empty for a way that
      leads nowhere yet.
    </span>
  </div>
</template>

<script setup lang="ts">
// The Door tool's question (#1195). A door's two ends are read from the rooms beside its edge; on a picture-only map
// the zones may stop well short of the doorway, and the tool used to refuse the edge. It asks here instead. Each
// list leaves out what the other holds, since a door joins two different rooms (`guard_location_door_endpoints`).
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";

const { rooms = [] } = defineProps<{ rooms?: readonly { id: string; name: string }[] }>();
const emit = defineEmits<{ place: [fromLocationId: string, toLocationId: string | null]; cancel: [] }>();

const fromId = ref("");
const toId = ref("");
const fromOptions = computed(() => rooms.filter((room) => room.id !== toId.value));
const toOptions = computed(() => rooms.filter((room) => room.id !== fromId.value));

function place(): void {
  emit("place", fromId.value, toId.value || null);
}
</script>
