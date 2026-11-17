<template>
  <!-- A map and nothing else: the parent gives it a box and it fills it. -->
  <div class="relative size-full overflow-hidden bg-[#0b0b10] text-[#e7e7ea]">
    <div
      ref="canvasHost"
      class="host"
      :class="{ 'host-measure': tool === 'measure', 'host-armed': arming }"
      data-testid="solo-fight-map"
      @wheel.prevent="onWheel"
      @pointerdown="onHostDown"
      @pointermove="onHostMove"
      @pointerup="onHostUp"
      @pointercancel="onHostCancel"
      @pointerleave="onHostCancel"
    >
      <p v-if="loadingState" class="absolute inset-0 flex items-center justify-center p-8 text-center text-body text-white/55">
        {{ loadingState }}
      </p>

      <BattleMapStack
        v-else-if="surface && imageReady"
        :host-w="hostW"
        :host-h="hostH"
        :layers="surface"
        :pan-x="panX"
        :pan-y="panY"
        :image-w="imageNaturalW * scale"
        :image-h="imageNaturalH * scale"
        :show-grid="true"
        :grid-verticals="gridVerticals"
        :grid-horizontals="gridHorizontals"
        :grid-stroke-opacity="gridStrokeOpacity"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :viewers="viewers"
        :zones="zones"
        :door-states="doorStates"
      />

      <BattleMapTokenLayer
        v-if="surface && imageReady && cellPx > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :combatants="tokens"
        :figures="dollFigures"
        :factions="factions"
        :draggable-instance-ids="draggable"
        :selected-instance-ids="foeIds ?? pickedSet"
        :hide-hidden="true"
        :silhouette-unseen="true"
        :on-position-change="onTokenMoved"
        :on-select="onTokenSelect"
      />

      <PlayTableMarks
        v-if="surface && imageReady && cellPx > 0 && measures.length > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :pings="[]"
        :measures="measures"
        :drawings="[]"
      />

      <!-- Opaque: what the character has not seen is not on the map. -->
      <BattleMapFogLayer
        v-if="surface && imageReady && cellPx > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :mask="shown"
        :seen="sight"
        :opaque="true"
      />

      <img v-if="surface?.imageUrl && !imageReady" :src="surface.imageUrl" alt="" class="hidden-loader" @load="onImageLoad" />
    </div>

    <div class="pointer-events-none absolute inset-x-0 bottom-2 flex flex-col items-center gap-1">
      <p v-if="arming" role="status" class="rounded-md bg-black/70 px-2 py-1 text-caption text-white">Pick a target</p>
      <p v-else-if="refusal" role="status" class="rounded-md bg-black/70 px-2 py-1 text-caption text-tone-danger">{{ refusal }}</p>
      <p v-else-if="measureText" role="status" class="rounded-md bg-black/70 px-2 py-1 text-caption text-white">{{ measureText }}</p>
      <div class="pointer-events-auto">
        <PlayToolbelt v-model:tool="tool" :tools="TOOLS" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import BattleMapFogLayer from "@/components/encounters/BattleMapFogLayer.vue";
import BattleMapStack from "@/components/encounters/BattleMapStack.vue";
import BattleMapTokenLayer from "@/components/encounters/BattleMapTokenLayer.vue";
import PlayTableMarks from "@/components/encounters/play/PlayTableMarks.vue";
import PlayToolbelt from "@/components/encounters/play/PlayToolbelt.vue";
import type { PlayTool } from "@/components/encounters/play/playTypes";
import { useCombatantDollFigures } from "@/composables/encounters/useCombatantDollFigures";
import { useSoloFightMap } from "@/composables/table/useSoloFightMap";

/**
 * The map of a fight at the AI table, as the played character sees it (#1021, Solo Table canvas, frames 12 and 13):
 * opaque fog by that character's sight, other creatures only where seen, and one token that moves, their own. The
 * tools are Move and Measure; there is nothing of a Dungeon Master's here.
 */
const { encounterId, playedInstanceId, canMove, speedFeet, movedFeet, arming } = defineProps<{
  encounterId: string;
  /** The played character's `instance_id` in the fight: its token is the only one that moves and the only source of sight. */
  playedInstanceId: string;
  /** True only on the player's own turn. */
  canMove: boolean;
  speedFeet: number;
  /** Feet already walked this turn. */
  movedFeet: number;
  /** True while the player is choosing the target of an attack: foes light up and a click on one picks it. */
  arming: boolean;
}>();
const emit = defineEmits<{
  /** A move was made and written; the feet it cost. */
  moved: [feet: number];
  /** A foe was clicked while armed. */
  target: [instanceId: string];
}>();

const TOOLS: readonly PlayTool[] = ["move", "measure"];

const {
  canvasHost, hostW, hostH, imageNaturalW, imageNaturalH, imageReady, panX, panY, scale, onImageLoad, onWheel,
  surface, tokens, shown, sight, viewers, zones, doorStates, factions, cellPx, gridOrigin, gridVerticals, gridHorizontals,
  gridStrokeOpacity, tool, refusal, draggable, pickedSet, foeIds, measures, measureText, loadingState,
  onTokenMoved, onTokenSelect, onHostDown, onHostMove, onHostUp, onHostCancel,
} = useSoloFightMap({
  encounterId: () => encounterId,
  playedInstanceId: () => playedInstanceId,
  canMove: () => canMove,
  speedFeet: () => speedFeet,
  movedFeet: () => movedFeet,
  arming: () => arming,
  onMoved: (feet) => emit("moved", feet),
  onTarget: (id) => emit("target", id),
});
const dollFigures = useCombatantDollFigures(() => tokens.value);
</script>

<style scoped>
.host {
  position: absolute;
  inset: 0;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
}
.host:active {
  cursor: grabbing;
}
.host-measure {
  cursor: crosshair;
}
.host-armed {
  cursor: pointer;
}
.hidden-loader {
  position: absolute;
  width: 0.0625rem;
  height: 0.0625rem;
  opacity: 0;
  pointer-events: none;
}
</style>
