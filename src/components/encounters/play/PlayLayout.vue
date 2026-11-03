<template>
  <PlayShell left-label="Initiative" right-label="Detail">
    <template #bar>
      <PlayBar
        v-model:view="view"
        :encounter-id="encounterId"
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
    </template>

    <!-- Initiative, and whoever the map has no square for. -->
    <template #left>
      <h2 class="px-3 pt-3 text-eyebrow uppercase text-muted-foreground">Initiative</h2>
      <PlayInitiativeList :selected-id="shownId" @select="onSelect" />
      <PlayUnplacedTray
        :combatants="unplaced"
        :factions="store.factions"
        :armed-id="placingId"
        :rooms="rooms"
        @arm="placingId = $event"
        @scatter="map?.scatterInRoom($event)"
      />
    </template>

    <template #map>
      <PlayMap
        ref="map"
        :encounter-id="encounterId"
        :view="view"
        :placing-id="placingId"
        :selected-id="shownId"
        :group-ids="groupIds"
        :party-members="partyMembers"
        @select="onMapSelect"
        @update:group-ids="groupIds = $event"
        @update:view="view = $event"
        @unplaced="unplaced = $event"
        @rooms="rooms = $event"
        @placed="placingId = null"
        @cancel-placing="placingId = null"
      />
    </template>

    <!-- The selected combatant's detail; whose turn it is when nobody was picked. -->
    <template #right>
      <PlayTurnCard
        v-if="showTurnCard"
        :party-members="partyMembers"
        @back-to-start="map?.backToStart()"
        @open-sheet="fullSheet = true"
      />
      <template v-else-if="shownId !== null || selectedTrapId !== null">
        <!-- Looking at someone else's sheet, or the turn card's full sheet: one tap back to the turn. -->
        <AppButton
          v-if="canReturnToTurn"
          class="m-2 self-start"
          variant="link"
          size="inline"
          :icon="IconChevronLeft"
          :label="`Back to ${store.activeCombatant?.name}'s turn`"
          data-testid="back-to-turn"
          @click="backToTurn"
        />
        <RunnerEntityDetail
          :selected-id="shownId"
          :selected-trap-id="selectedTrapId"
          :monsters="store.availableMonsters"
          :party-members="partyMembers"
          @close="onCloseDetail"
        />
      </template>
      <p v-else class="p-4 text-body text-muted-foreground">Pick someone in the initiative column to see their sheet.</p>
    </template>

    <template #overlay>
      <PlayToolsSheet
        v-model:open="toolsOpen"
        :encounter-id="encounterId"
        :selected-trap-id="selectedTrapId"
        @update:selected-trap-id="onPickTrap"
      />
    </template>
  </PlayShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconChevronLeft } from "@/lib/icons";
import type { ComplicationMode } from "@/ai/useComplicationGeneration";
import type { RunCombatant } from "@/types/encounter.types";
import type { PartyMember } from "@/types/party.types";
import RunnerDueConditions from "../RunnerDueConditions.vue";
import RunnerEntityDetail from "../RunnerEntityDetail.vue";
import PlayBar from "./PlayBar.vue";
import PlayInitiativeList from "./PlayInitiativeList.vue";
import PlayMap from "./PlayMap.vue";
import PlayShell from "./PlayShell.vue";
import PlayToolsSheet from "./PlayToolsSheet.vue";
import PlayTurnCard from "./PlayTurnCard.vue";
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
const rooms = ref<{ id: string; name: string }[]>([]);
const placingId = ref<string | null>(null);
const map = ref<InstanceType<typeof PlayMap> | null>(null);

// Nobody picked: the sheet is whose turn it is, and follows the turn. A trap in view replaces it.
const shownId = computed(() => {
  if (selectedTrapId.value !== null) return null;
  return selectedId.value ?? store.activeCombatant?.instance_id ?? null;
});

// Tokens picked together on the map (Shift); the primary one is `selectedId`.
const groupIds = ref<string[]>([]);
// Looking at the turn-taker's full sheet instead of their card.
const fullSheet = ref(false);

// A pick lasts until the turn moves on; then the selection follows the turn again.
watch(
  () => store.activeCombatant?.instance_id,
  () => {
    selectedId.value = null;
    groupIds.value = [];
    fullSheet.value = false;
  },
);

// Whose turn it is gets the turn card, whatever the sheet would otherwise show; anyone else gets their sheet.
const showTurnCard = computed(
  () => store.started && !fullSheet.value && selectedTrapId.value === null && shownId.value !== null && shownId.value === store.activeCombatant?.instance_id,
);
const canReturnToTurn = computed(
  () => store.started && store.activeCombatant !== null && selectedTrapId.value === null && (fullSheet.value || shownId.value !== store.activeCombatant.instance_id),
);

function backToTurn() {
  fullSheet.value = false;
  selectedId.value = null;
  groupIds.value = [];
}

function onSelect(id: string) {
  selectedTrapId.value = null;
  fullSheet.value = false;
  selectedId.value = id;
  groupIds.value = [];
}

function onMapSelect(id: string | null) {
  selectedTrapId.value = null;
  fullSheet.value = false;
  selectedId.value = id;
}

function onPickTrap(id: string | null) {
  selectedTrapId.value = id;
  if (id) selectedId.value = null;
}

function onCloseDetail() {
  selectedId.value = null;
  selectedTrapId.value = null;
  fullSheet.value = false;
}
</script>
