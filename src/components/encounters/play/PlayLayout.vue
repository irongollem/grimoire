<template>
  <div class="relative flex h-full min-h-0 flex-col" data-testid="play-layout">
    <PlayBar
      v-model:view="view"
      :is-live="isLive"
      :going-live="goingLive"
      :can-go-live="canGoLive"
      :can-generate="canGenerate"
      :turn-timer-seconds="turnTimerSeconds"
      :turn-reset-key="turnResetKey"
      @roll-initiative="emit('roll-initiative')"
      @start-combat="emit('start-combat')"
      @go-live="emit('go-live')"
      @table-screen="emit('table-screen')"
      @reset-view="map?.resetView()"
      @tools="toolsOpen = true"
      @generate="emit('generate', $event)"
      @abandon="emit('abandon')"
      @end-fight="emit('end-fight')"
    />

    <RunnerDueConditions />

    <div class="relative flex min-h-0 flex-1">
      <!-- Initiative, and whoever the map has no square for. -->
      <aside class="flex w-64 shrink-0 flex-col border-r border-border bg-card" aria-label="Initiative">
        <h2 class="px-3 pt-3 text-eyebrow uppercase tracking-wide text-muted-foreground">Initiative</h2>
        <PlayInitiativeList :selected-id="shownId" @select="onSelect" />
        <PlayUnplacedTray :combatants="unplaced" :factions="store.factions" :armed-id="placingId" @arm="placingId = $event" />
      </aside>

      <main class="min-w-0 flex-1">
        <PlayMap
          ref="map"
          :encounter-id="encounterId"
          :view="view"
          :placing-id="placingId"
          @unplaced="unplaced = $event"
          @placed="placingId = null"
          @cancel-placing="placingId = null"
        />
      </main>

      <!-- The selected combatant's detail; whose turn it is when nobody was picked. -->
      <ResizeHandle @mousedown="startMouse" @touchstart="startTouch" />
      <aside class="flex min-h-0 shrink-0 flex-col overflow-hidden bg-card" :style="{ width: detailWidth + 'px' }" aria-label="Detail">
        <RunnerEntityDetail
          v-if="shownId !== null || selectedTrapId !== null"
          :selected-id="shownId"
          :selected-trap-id="selectedTrapId"
          :monsters="store.availableMonsters"
          :party-members="partyMembers"
          @close="onCloseDetail"
        />
        <p v-else class="p-4 text-body text-muted-foreground">Pick someone in the initiative column to see their sheet.</p>
      </aside>

      <PlayToolsSheet
        v-model:open="toolsOpen"
        :encounter-id="encounterId"
        :selected-trap-id="selectedTrapId"
        @update:selected-trap-id="onPickTrap"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import ResizeHandle from "@/components/common/layout/ResizeHandle.vue";
import { useDetailResize } from "@/composables/encounters/useDetailResize";
import type { ComplicationMode } from "@/ai/useComplicationGeneration";
import type { RunCombatant } from "@/types/encounter.types";
import type { PartyMember } from "@/types/party.types";
import RunnerDueConditions from "../RunnerDueConditions.vue";
import RunnerEntityDetail from "../RunnerEntityDetail.vue";
import PlayBar from "./PlayBar.vue";
import PlayInitiativeList from "./PlayInitiativeList.vue";
import PlayMap from "./PlayMap.vue";
import PlayToolsSheet from "./PlayToolsSheet.vue";
import PlayUnplacedTray from "./PlayUnplacedTray.vue";
import { DEFAULT_PLAY_VIEW, type PlayViewState } from "./playTypes";

/**
 * The Play screen from tablet width up (#1125 decision 9, frame 10): initiative on the left, the
 * map in the middle, the selected combatant's sheet on the right, and the DM's tools one button
 * away. EncounterRunner owns the fight's logic and hands this the pieces; this owns the layout.
 */
defineProps<{
  encounterId: string;
  isLive: boolean;
  goingLive: boolean;
  canGoLive: boolean;
  canGenerate: boolean;
  turnTimerSeconds: number | null;
  turnResetKey: string | number;
  partyMembers: PartyMember[];
}>();

const selectedId = defineModel<string | null>("selectedId", { required: true });
const selectedTrapId = defineModel<string | null>("selectedTrapId", { required: true });
const toolsOpen = defineModel<boolean>("toolsOpen", { required: true });

const emit = defineEmits<{
  "roll-initiative": [];
  "start-combat": [];
  "go-live": [];
  "table-screen": [];
  generate: [mode: ComplicationMode];
  abandon: [];
  "end-fight": [];
}>();

const store = useEncounterRunStore();
const view = ref<PlayViewState>({ ...DEFAULT_PLAY_VIEW });
const unplaced = ref<RunCombatant[]>([]);
const placingId = ref<string | null>(null);
const map = ref<InstanceType<typeof PlayMap> | null>(null);
const { detailWidth, startMouse, startTouch } = useDetailResize(320);

// Nobody picked: the sheet is whose turn it is, and follows the turn. A trap in view replaces it.
const shownId = computed(() => {
  if (selectedTrapId.value !== null) return null;
  return selectedId.value ?? store.activeCombatant?.instance_id ?? null;
});

// A pick lasts until the turn moves on; then the sheet follows the turn again.
watch(
  () => store.activeCombatant?.instance_id,
  () => {
    selectedId.value = null;
  },
);

function onSelect(id: string) {
  selectedTrapId.value = null;
  selectedId.value = id;
}

function onPickTrap(id: string | null) {
  selectedTrapId.value = id;
  if (id) selectedId.value = null;
}

function onCloseDetail() {
  selectedId.value = null;
  selectedTrapId.value = null;
}
</script>
