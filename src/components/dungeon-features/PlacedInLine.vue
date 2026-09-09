<template>
  <p v-if="!rooms.length" class="text-caption-sm text-muted-foreground italic">Not placed — catalogue only</p>
  <div v-else class="flex flex-wrap items-center gap-1">
    <span
      v-for="room in shown"
      :key="room.key"
      class="inline-flex items-center rounded bg-muted/40 px-1.5 py-0.5 text-caption-sm text-muted-foreground"
    >
      <template v-if="room.siteName">{{ room.siteName }} · </template>{{ room.roomName }}<template v-if="room.cell"> [cell {{ room.cell }}]</template>
    </span>
    <span v-if="rooms.length > shown.length" class="text-caption-sm text-muted-foreground italic">
      +{{ rooms.length - shown.length }} more
    </span>
  </div>
</template>

<script setup lang="ts">
/**
 * "Placed in" — the reverse of `location_placements` on a Dungeon Craft grid
 * card (#868, S8, frame 11): "the column just reads `location_placements`
 * backwards". Shared across the Traps/Features/Puzzles tabs rather than
 * three copies, because it's the same markup for all three — what differs
 * per tab is how `rooms` gets resolved (`resolvePlacedInRooms` for the two
 * that go through `location_placements`; a puzzle's own `location_id` /
 * `dungeon_feature_id` for the third), not how it's displayed.
 */
import { computed } from "vue";
import type { PlacedInRoom } from "@/lib/dungeon-features/placedIn";

const { rooms } = defineProps<{ rooms: PlacedInRoom[] }>();

const shown = computed(() => rooms.slice(0, 2));
</script>
