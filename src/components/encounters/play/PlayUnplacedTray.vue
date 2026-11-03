<template>
  <section v-if="combatants.length > 0" class="border-t border-border p-2" aria-labelledby="play-unplaced-title">
    <h3 id="play-unplaced-title" class="px-1 pb-1 text-eyebrow uppercase text-muted-foreground">
      Not on the map yet
    </h3>
    <ul class="flex flex-col gap-0.5">
      <li v-for="c in combatants" :key="c.instance_id">
        <AppButton
          variant="ghost"
          size="well"
          block
          :active="armedId === c.instance_id"
          :aria-pressed="armedId === c.instance_id"
          :tooltip="`Drag ${c.name} onto the map, or click and then click a square`"
          draggable="true"
          @dragstart="onDragStart($event, c.instance_id)"
          @click="emit('arm', armedId === c.instance_id ? null : c.instance_id)"
        >
          <span class="flex w-full items-center gap-2">
            <PlayPortrait :combatant="c" :factions="factions" size="sm" />
            <span class="min-w-0 flex-1 truncate text-left text-label-lg">{{ c.name }}</span>
          </span>
        </AppButton>
      </li>
    </ul>
    <div v-if="canScatter" class="px-1 pt-2">
      <AppButton
        v-if="rooms.length === 1"
        variant="outline"
        size="sm"
        block
        :label="`Scatter in ${rooms[0].name}`"
        @click="emit('scatter', rooms[0].id)"
      />
      <MenuPopover v-else label="Scatter in a room">
        <template #trigger="{ toggle, open }">
          <AppButton
            variant="outline"
            size="sm"
            block
            :icon-right="IconChevronDown"
            label="Scatter in a room"
            aria-haspopup="menu"
            :aria-expanded="open"
            @click="toggle"
          />
        </template>
        <template #default="{ close }">
          <AppButton
            v-for="r in rooms"
            :key="r.id"
            variant="menu"
            size="md"
            block
            class="rounded-none"
            role="menuitem"
            :label="r.name"
            @click="onScatter(r.id, close)"
          />
        </template>
      </MenuPopover>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import MenuPopover from "@/components/common/overlays/MenuPopover.vue";
import { IconChevronDown } from "@/lib/icons";
import type { FactionColor, RunCombatant } from "@/types/encounter.types";
import PlayPortrait from "./PlayPortrait.vue";
import { PLAY_DRAG_TYPE } from "./playTypes";

/**
 * Combatants with no square on the map. Drag a portrait onto the map, or click one and then a
 * square: a touch screen has no drag, and a click is also the quiet way on a trackpad. "Scatter in a room" seats every
 * foe at once (#1125 decision 11).
 */
const props = defineProps<{
  combatants: readonly RunCombatant[];
  factions: readonly FactionColor[];
  /** The portrait armed to land on the next click on the map. */
  armedId: string | null;
  /** The rooms the map has, the fight's own first. Scatter is offered only when there is one. */
  rooms: readonly { id: string; name: string }[];
}>();
const emit = defineEmits<{ arm: [instanceId: string | null]; scatter: [roomId: string] }>();

// The party is seated by its own flow, so a tray of only players has nothing to scatter.
const canScatter = computed(() => props.rooms.length > 0 && props.combatants.some((c) => c.type !== "player"));

function onScatter(roomId: string, close: (refocus: boolean) => void) {
  close(true);
  emit("scatter", roomId);
}

function onDragStart(e: DragEvent, instanceId: string) {
  e.dataTransfer?.setData(PLAY_DRAG_TYPE, instanceId);
}
</script>
