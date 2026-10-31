<template>
  <section v-if="combatants.length > 0" class="border-t border-border p-2" aria-labelledby="play-unplaced-title">
    <h3 id="play-unplaced-title" class="px-1 pb-1 text-eyebrow uppercase tracking-wide text-muted-foreground">
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
  </section>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import type { FactionColor, RunCombatant } from "@/types/encounter.types";
import PlayPortrait from "./PlayPortrait.vue";
import { PLAY_DRAG_TYPE } from "./playTypes";

/**
 * Combatants with no square on the map. Drag a portrait onto the map, or click one and then a
 * square: a touch screen has no drag, and a click is also the quiet way on a trackpad.
 */
defineProps<{
  combatants: readonly RunCombatant[];
  factions: readonly FactionColor[];
  /** The portrait armed to land on the next click on the map. */
  armedId: string | null;
}>();
const emit = defineEmits<{ arm: [instanceId: string | null] }>();

function onDragStart(e: DragEvent, instanceId: string) {
  e.dataTransfer?.setData(PLAY_DRAG_TYPE, instanceId);
}
</script>
