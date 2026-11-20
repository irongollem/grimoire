<template>
  <!-- h-full: the player layout hands this page its whole main area (meta.fillsMain), which is not a flex column. -->
  <div class="flex h-full min-h-0 flex-col" data-testid="table-view">
    <SoloAiOff v-if="!campaign.isAiEnabled" class="m-4" />

    <template v-else>
      <SoloBar
        :campaign="campaign.activeCampaign?.name ?? ''"
        :character="characterName"
        :hit-points="member ? hitPoints : null"
        :credits="meterCredits"
        :turns="turns"
        :balance="balance"
        :leaving="leaving"
        :voices="voice.parts.value"
        :narrator-voice="narrator.voice.value"
        @voice="voice.setPart"
        @narrator-voice="chooseNarratorVoice"
        @leave="leave"
        @disclosure="disclosure.reopen"
        @credits="openOutOfCredits(1)"
      />

      <div v-if="!showAll && tabOptions.length > 1" class="shrink-0 border-b border-border bg-card px-3 py-2">
        <SegmentedControl :model-value="view" :options="tabOptions" @update:model-value="(next) => (tab = next)" size="md" block />
      </div>

      <div class="flex min-h-0 flex-1">
        <!-- Stays mounted behind its tab, so the bar's hit points keep coming from it. -->
        <aside
          v-if="member"
          v-show="showAll || view === 'sheet'"
          class="min-w-0 overflow-y-auto bg-card max-lg:flex-1 lg:w-72 lg:shrink-0 lg:border-r lg:border-border"
          aria-label="Your character"
        >
          <!-- On your turn in a fight the turn's own controls take the top of this column (frame 13). -->
          <div :id="FIGHT_SLOTS.turn" />
          <SoloSheet :member="member" :readonly="hasLeft" @hit-points="(now) => (hitPoints = now)" />
        </aside>

        <main v-show="view === 'story'" class="flex min-w-0 flex-1 flex-col" aria-label="The story">
          <ListSkeleton v-if="conversation.isLoading.value" variant="text" :count="3" class="m-4" />
          <div v-else-if="conversation.isError.value" class="m-4 flex flex-col items-start gap-2" role="alert">
            <p class="text-body text-destructive">This sitting could not be opened. It may have been removed, or belong to another campaign.</p>
            <AppButton to="/table" variant="outline" size="md" label="Back to the table" />
          </div>
          <template v-else>
            <!-- "When a map is on the table it sits above the story ... and nothing else moves." (frames 03 and 12) -->
            <!-- The strip is enough most of the time; the button lays the same live map over the whole screen
                 (the maintainer, 17 Nov 2026) and Escape or the button brings it back. -->
            <div v-show="inFight" :class="mapBoxClass">
              <div :id="FIGHT_SLOTS.map" class="size-full" />
              <AppButton variant="ghost" size="icon-sm" :icon="mapLarge ? IconMinimize : IconMaximize" :tooltip="mapLarge ? 'Back to the story' : 'Larger map'" :aria-label="mapLarge ? 'Make the map small again' : 'Make the map larger'" :class="['absolute top-2 right-2 z-10', CARD_OVERLAY_ACTION, 'text-white hover:text-white']" data-testid="solo-map-size" @click="mapLarge = !mapLarge" />
            </div>
            <!-- Outside a fight the place's own map stays there: "you are always somewhere". It is mounted even
                 while hidden, because it is what finds out whether the place has a map at all. -->
            <div v-if="member && !inFight && !hasLeft" v-show="placeHasMap" :class="mapBoxClass" data-testid="solo-place-map">
              <SoloPlaceMap :place-id="sceneId" :member="member" :busy="turn.running.value || asked !== null" @go="onGo" @has-map="(shown) => (placeHasMap = shown)" />
              <AppButton variant="ghost" size="icon-sm" :icon="mapLarge ? IconMinimize : IconMaximize" :tooltip="mapLarge ? 'Back to the story' : 'Larger map'" :aria-label="mapLarge ? 'Make the map small again' : 'Make the map larger'" :class="['absolute top-2 right-2 z-10', CARD_OVERLAY_ACTION, 'text-white hover:text-white']" data-testid="solo-map-size" @click="mapLarge = !mapLarge" />
            </div>
            <SoloStory
              :items="story"
              :colours="colours"
              :portraits="portraits"
              :character="characterName"
              :failure="turn.failure.value"
              :running="turn.running.value"
              :voices="voice.parts.value"
              @replay="onReplay"
              @resend="turn.resend()"
              @credits="openOutOfCredits(1)"
            />
            <div class="shrink-0 px-4 pt-1 pb-3">
              <div :id="FIGHT_SLOTS.roll" />
              <SoloRollAsk
                v-if="asked && !hasLeft"
                :ask="asked"
                :bonus="check?.bonus ?? null"
                :forced-disadvantage="check?.forcedDisadvantage ?? false"
                :busy="turn.running.value"
                @roll="(answer) => sendTurn(ROLL_MODE, '', answer)"
              />
              <!-- The characters are about to go on talking among themselves: said once, with the way to take the floor. -->
              <p v-if="goingOn && !hasLeft" class="flex items-center gap-2 pb-1 text-caption text-muted-foreground" role="status" data-testid="solo-going-on">
                They go on talking.
                <AppButton variant="link" size="inline" label="Step in" @click="stepIn" />
              </p>
              <SoloLongSitting v-if="offersNew" :leaving="leaving" @begin="leave" @not-now="putOff" />
              <SoloLeft v-if="hasLeft" />
              <SoloComposer
                v-else
                :character="characterName"
                :running="turn.running.value"
                :fight="composerFight"
                :can-correct="turns > 0"
                @submit="onSubmit"
                @pass="onPass"
                @stop="onStop"
                @writing="(has) => (writing = has)"
              />
            </div>
          </template>
        </main>

        <aside v-show="showAll || view === 'scene' || (wide && view === 'story')" class="min-w-0 overflow-y-auto bg-card max-md:flex-1 md:w-80 md:shrink-0 md:border-l md:border-border" aria-label="The scene">
          <!-- In a fight the fight's own list comes first: who is in it, in turn order (frame 12). The scene stays
               under it: whoever is in the room and not in the fight is still there, and vanished from the page when
               the list took the whole column. -->
          <div :id="FIGHT_SLOTS.roster" :class="inFight ? 'border-b border-border' : ''" />
          <SoloScene :place-name="scene.place.data.value?.name ?? null" :here="scene.here.data.value ?? []" :pressure="hasLeft ? null : pressure" :after="after" :place-summary="placeSummary" :recorded="recorded" />
        </aside>
      </div>

      <SoloFightStage
        v-if="inFight && fight && member"
        :encounter-id="fight.encounterId"
        :member="member"
        :slots="FIGHT_SLOTS"
        :helper-turn="onHelperTurn"
        :foe-line="onFoeLine"
        ref="stage"
        @turn="(state) => (fightTurn = state)"
        @lines="noteBoard"
        @over="onFightOver"
        @lost="onFightLost"
      />

      <SoloDisclosure :open="disclosure.open.value" @accept="disclosure.accept" @decline="declineDisclosure" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import AppButton from "@/components/common/controls/AppButton.vue";
import { CARD_OVERLAY_ACTION } from "@/components/common/controls/appButtonVariants";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import SoloAiOff from "@/components/table/solo/SoloAiOff.vue";
import SoloBar from "@/components/table/solo/SoloBar.vue";
import SoloComposer from "@/components/table/solo/SoloComposer.vue";
import SoloLeft from "@/components/table/solo/SoloLeft.vue";
import SoloLongSitting from "@/components/table/solo/SoloLongSitting.vue";
import SoloDisclosure from "@/components/table/solo/SoloDisclosure.vue";
import SoloFightStage from "@/components/table/solo/SoloFightStage.vue";
import SoloPlaceMap from "@/components/table/solo/SoloPlaceMap.vue";
import SoloRollAsk from "@/components/table/solo/SoloRollAsk.vue";
import SoloSheet from "@/components/table/solo/SoloSheet.vue";
import SoloScene from "@/components/table/solo/SoloScene.vue";
import SoloStory from "@/components/table/solo/SoloStory.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { FIGHT_SLOTS, useTableFightState } from "@/composables/table/useTableFightState";
import { useSittingLifecycle } from "@/composables/table/useSittingLifecycle";
import { keepBoardLines, useTableConversation } from "@/composables/table/useTableConversation";
import { usePlayedCharacter } from "@/composables/table/usePlayedCharacter";
import { useTableAddress } from "@/composables/table/useTableAddress";
import { useTableDisclosure } from "@/composables/table/useTableDisclosure";
import { useTableGoingOn } from "@/composables/table/useTableGoingOn";
import { useTableCheck } from "@/composables/table/useTableCheck";
import { useTableNarratorVoice, type NarratorVoice } from "@/composables/table/useTableNarratorVoice";
import { useToast } from "@/composables/useToast";
import { useTodayWeather, useWeatherHazards } from "@/composables/calendar/useTodayWeather";
import { tableSky } from "@/lib/table/solo/tableSky";
import { useTablePlays } from "@/composables/table/useTablePlays";
import { useTableScene } from "@/composables/table/useTableScene";
import { TABLE_SESSIONS_KEY } from "@/composables/table/useTableSessions";
import { useTableSpeech } from "@/composables/table/useTableSpeech";
import { useTableStory } from "@/composables/table/useTableStory";
import { useTableTabs } from "@/composables/table/useTableTabs";
import { useTableTurn } from "@/composables/table/useTableTurn";
import { useAbove } from "@/composables/useBreakpoint";
import { useHotkeys } from "@/composables/useHotkeys";
import { IconMaximize, IconMinimize } from "@/lib/icons";
import type { BoardLine } from "@/lib/table/solo/fight/boardLines";
import { placeSummaryFor } from "@/lib/table/solo/placeKnown";
import type { PlayMode, RollAsk, TablePressure } from "@/lib/table/solo/soloTypes";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";

const route = useRoute();
const router = useRouter();
const campaign = useCampaignStore();
const queryClient = useQueryClient();
const wide = useAbove("md");
// Three columns need room for a story that is never narrower than about 28rem: below `lg` the sheet is a tab.
const showAll = useAbove("lg");
const hitPoints = ref<{ current: number; max: number } | null>(null);
const appUi = useAppUiStore();
const disclosure = useTableDisclosure();
const { openOutOfCredits } = useOutOfCredits();
const { balance: rawBalance } = useAiCredits();
const balance = computed(() => rawBalance.value ?? null);

const campaignId = computed(() => campaign.activeCampaignId);
const { param, openedId, newCharacterId, newPlaceId, historyId, sceneId, reread } = useTableAddress();
// The clock the scene runs against: from the stored sitting when one is opened, then from each kept turn.
const pressure = ref<TablePressure | null>(null);
// The roll the table is waiting for: from the stored sitting, then from the turn that asks. The card shows it.
const asked = ref<RollAsk | null>(null);
// A roll carries no words, so the say/do mode of its turn changes nothing the server reads.
const ROLL_MODE: PlayMode = "do";

const scene = useTableScene(sceneId, campaignId);
const conversation = useTableConversation(historyId, campaignId);
// A sitting that was left is read only: the server refuses its turns, and the page does not offer to send one.
const hasLeft = computed(() => {
  const sitting = conversation.data.value?.sitting;
  return sitting !== undefined && sitting.left_at !== null;
});

const fightState = useTableFightState({
  closed: () => hasLeft.value || conversation.isLoading.value || conversation.isError.value,
  characterName: () => characterName.value,
  noteBoard: (lines, byServer) => noteBoard(lines, byServer),
  aftermath: () => turn.aftermath(),
});
const { fight, fightTurn, inFight, composerFight, onFightOver, onFightLost } = fightState;
const stage = ref<InstanceType<typeof SoloFightStage> | null>(null);

// The weather where the story stands, from the campaign's own weather system: the Narrator is told it with every turn.
const skyNow = useTodayWeather({ placeId: () => sceneId.value });
const skyDangers = useWeatherHazards({ placeId: () => sceneId.value });
const sky = () => tableSky(skyNow.value === null ? null : skyNow.value.weather, skyDangers.value);
// The Narrator's voice is the table's: what the host chose on the door page for a new one, the row's own after.
const tableId = ref<string | null>(openedId());
// The Narrator's voice for this table, and the player's way of changing it. A failed change is said, not thrown.
const toast = useToast();
const narrator = useTableNarratorVoice(tableId);
async function chooseNarratorVoice(next: NarratorVoice): Promise<void> {
  try {
    await narrator.choose(next);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "The Narrator's voice could not be changed.");
  }
}

const { goingOn, writing, stepIn, watchOn } = useTableGoingOn({
  busy: () => inFight.value || asked.value !== null || hasLeft.value,
  speaking: () => voice.speaking.value,
  running: () => turn.running.value,
  listen: () => turn.listen(),
});

const turn = useTableTurn({
  campaignId: () => campaignId.value,
  sessionId: openedId(),
  characterId: () => newCharacterId.value,
  startLocationId: () => newPlaceId.value,
  narratorVoice: () => narrator.voice.value,
  sky,
  // In a fight every message carries what the player's turn still holds, and a ruling comes back for the board.
  fightTurn: () => fightTurn.value,
  onFightChange: (change) => stage.value?.apply(change),
  onSession: (id) => {
    appUi.setTablePlaySession(id);
    if (route.params.sessionId !== id) void router.replace({ name: "table-session", params: { sessionId: id } });
  },
  onScene: (arrived) => {
    sceneId.value = arrived.id;
    scene.refresh();
  },
  onPressure: (now) => (pressure.value = now),
  onFight: (now) => (fight.value = now),
  onAskRoll: (ask) => (asked.value = ask),
  onDone: (floor) => {
    watchOn(floor);
    // Characters who speak are placed with the party at the end of a turn; the balance and the list of sittings moved.
    scene.refresh();
    void queryClient.invalidateQueries({ queryKey: ["ai-credit-balance"] });
    void queryClient.invalidateQueries({ queryKey: [TABLE_SESSIONS_KEY] });
  },
});
// A new table gets its id from its first turn, and the page may be moved to another table while mounted.
watch(
  () => turn.sessionId.value,
  (id) => (tableId.value = id),
);

// The map in its strip above the story, or laid over the whole screen.
const mapLarge = ref(false);
const mapBoxClass = computed(() => (mapLarge.value ? "fixed inset-0 z-50 bg-[#0b0b10]" : "relative h-[40%] min-h-56 shrink-0 border-b border-border"));
useHotkeys([{ combo: "escape", description: "Make the map small again", hidden: true, dismiss: true, handler: () => (mapLarge.value = false) }], { layer: "overlay", enabled: mapLarge });

const { voice, onReplay, restart: restartSpeech } = useTableSpeech({
  campaignId: () => campaignId.value,
  sessionId: () => turn.sessionId.value,
  live: () => turn.live.value,
  played: () => (member.value ? { id: member.value.id, name: member.value.name } : null),
});

// A new sitting begins with the Dungeon Master setting the scene, not with an empty page waiting for the player.
// Only once the disclosure has been read: nothing is sent to the model before the player knows who answers.
function openScene(): void {
  if (param.value === "new" && newCharacterId.value !== null && campaignId.value !== null && disclosure.hasBeenTold.value) void turn.open();
}
// On arrival, and again the moment the first-visit disclosure is accepted or the campaign becomes known.
watch([() => disclosure.hasBeenTold.value, campaignId], openScene, { immediate: true });

// The place's own map, above the story while there is no fight. It is mounted even while hidden, because it is what
// finds out whether the place has a map at all.
const placeHasMap = ref(false);
const { sendTurn, onGo, onSubmit, onHelperTurn, onFoeLine, onStop, onPass } = useTablePlays({
  turn,
  pressure,
  characterName: () => characterName.value,
  stepIn,
  yourFightTurn: () => composerFight.value?.yours === true,
  spendWords: () => stage.value?.spendWords(),
});

// The address changed under a mounted page (another sitting, or a new one): start over. The id this screen created
// itself is already the turn's own, so that replace changes nothing.
watch(param, () => {
  if (turn.sessionId.value === openedId()) return;
  turn.reset(openedId());
  reread();
  pressure.value = null;
  fight.value = null;
  asked.value = null;
  restartSpeech();
  openScene();
});

// What the board of a fight writes is the page's own and is never sent to the Dungeon Master, so it is kept beside
// the turns (`agent_board_lines`) with how many turns had been played, and put back among them when the sitting is
// reopened. A line that could not be kept is still on the page now; it is reported, and missing after a reload.
function noteBoard(lines: readonly BoardLine[], byServer: boolean): void {
  turn.note(lines, byServer);
  const id = turn.sessionId.value;
  if (id === null || lines.length === 0) return;
  const stored = conversation.data.value;
  const after = (stored ? stored.turns : 0) + turn.turnsKept.value;
  keepBoardLines(id, after, lines, byServer);
}
watch(
  () => conversation.data.value,
  (stored) => {
    if (stored?.sitting.scene_location_id) sceneId.value = stored.sitting.scene_location_id;
    if (stored) pressure.value = stored.sitting.pressure;
    if (stored) fight.value = stored.sitting.fight;
    // A turn already sent on this screen decided what is asked: the snapshot may be older than it.
    if (stored && turn.live.value.length === 0) turn.setAsked(stored.sitting.pending_roll);
  },
);

const { story, recorded, turns, colours, portraits } = useTableStory(() => conversation.data.value?.items, () => turn.live.value, campaignId);
const meterCredits = computed(() => Math.floor((conversation.data.value?.sitting.credits_spent ?? 0) + turn.credits.value));

const { member, characterName, playedId, after } = usePlayedCharacter({
  storedId: () => conversation.data.value?.sitting.party_member_id,
  newId: () => newCharacterId.value,
  sessionId: () => turn.sessionId.value,
});
const placeSummary = computed(() => placeSummaryFor(scene.place.data.value, playedId.value));
const check = useTableCheck(member, asked);

const { tab, view, tabOptions } = useTableTabs({ showAll, wide, hasSheet: () => member.value !== null, asking: () => asked.value !== null });

const { leaving, offersNew, putOff, leave } = useSittingLifecycle({
  campaignId: () => campaignId.value,
  sessionId: () => turn.sessionId.value,
  sitting: () => conversation.data.value?.sitting,
  hasLeft: () => hasLeft.value,
  inFight: () => inFight.value,
  running: () => turn.running.value,
  asking: () => asked.value !== null,
  turns: () => turns.value,
  failure: () => turn.failure.value,
  stopTurn: () => turn.stop(),
  stopVoice: () => voice.stop(),
});

function declineDisclosure(): void {
  // Not told yet and not wanting to be: nobody sits at a table they were not told about.
  if (!disclosure.hasBeenTold.value) void router.push("/table");
  else disclosure.dismiss();
}
</script>
