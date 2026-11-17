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
        :leaving="leaveTable.leaving.value"
        :voice-on="voice.enabled.value"
        @voice="voice.setEnabled"
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
            <div v-show="inFight" :id="FIGHT_SLOTS.map" class="h-[40%] min-h-56 shrink-0 border-b border-border" />
            <!-- Outside a fight the place's own map stays there: "you are always somewhere". It is mounted even
                 while hidden, because it is what finds out whether the place has a map at all. -->
            <div v-if="member && !inFight && !hasLeft" v-show="placeHasMap" class="h-[40%] min-h-56 shrink-0 border-b border-border" data-testid="solo-place-map">
              <SoloPlaceMap :place-id="sceneId" :member="member" :busy="turn.running.value || asked !== null" @go="onGo" @has-map="(shown) => (placeHasMap = shown)" />
            </div>
            <SoloStory
              :items="story"
              :colours="colours"
              :portraits="portraits"
              :character="characterName"
              :failure="turn.failure.value"
              :running="turn.running.value"
              :voice-on="voice.enabled.value"
              @replay="(item) => voice.replay(spokenLines([item]))"
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
              <SoloLeft v-if="hasLeft" />
              <SoloComposer
                v-else
                :character="characterName"
                :running="turn.running.value"
                :fight="composerFight"
                @submit="onSubmit"
                @stop="turn.stop()"
              />
            </div>
          </template>
        </main>

        <aside v-show="showAll || view === 'scene' || (wide && view === 'story')" class="min-w-0 overflow-y-auto bg-card max-md:flex-1 md:w-80 md:shrink-0 md:border-l md:border-border" aria-label="The scene">
          <!-- In a fight the fight's own list comes first: who is in it, in turn order (frame 12). The scene stays
               under it: whoever is in the room and not in the fight is still there, and vanished from the page when
               the list took the whole column. -->
          <div :id="FIGHT_SLOTS.roster" :class="inFight ? 'border-b border-border' : ''" />
          <SoloScene :place-name="scene.place.data.value?.name ?? null" :here="scene.here.data.value ?? []" :pressure="hasLeft ? null : pressure" :after="after" :place-summary="placeSummary" />
        </aside>
      </div>

      <SoloFightStage
        v-if="inFight && fight && member"
        :encounter-id="fight.encounterId"
        :member="member"
        :slots="FIGHT_SLOTS"
        ref="stage"
        @turn="(state) => (fightTurn = state)"
        @lines="(lines, byServer) => turn.note(lines, byServer)"
        @over="onFightOver"
        @lost="onFightLost"
      />

      <SoloDisclosure :open="disclosure.open.value" @accept="disclosure.accept" @decline="declineDisclosure" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import SoloAiOff from "@/components/table/solo/SoloAiOff.vue";
import SoloBar from "@/components/table/solo/SoloBar.vue";
import SoloComposer from "@/components/table/solo/SoloComposer.vue";
import SoloLeft from "@/components/table/solo/SoloLeft.vue";
import SoloDisclosure from "@/components/table/solo/SoloDisclosure.vue";
import SoloFightStage from "@/components/table/solo/SoloFightStage.vue";
import SoloPlaceMap from "@/components/table/solo/SoloPlaceMap.vue";
import type { SoloFightEnd } from "@/composables/table/useSoloFightHost";
import { endLine, type FightTurn } from "@/lib/table/fight/fightChange";
import SoloRollAsk from "@/components/table/solo/SoloRollAsk.vue";
import SoloSheet from "@/components/table/solo/SoloSheet.vue";
import SoloScene from "@/components/table/solo/SoloScene.vue";
import SoloStory from "@/components/table/solo/SoloStory.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useParty } from "@/composables/party/useParty";
import { TABLE_SESSIONS_KEY } from "@/composables/table/useTableSessions";
import { useLeaveTable } from "@/composables/table/useLeaveTable";
import { useToast } from "@/composables/useToast";
import { useTableConversation } from "@/composables/table/useTableConversation";
import { useTableDisclosure } from "@/composables/table/useTableDisclosure";
import { usePlayerQuestBeats } from "@/composables/quests/useQuestFlow";
import { usePlayerVisibleQuests } from "@/composables/quests/useQuests";
import { currentBeatsByQuest } from "@/lib/hearth/currentBeats";
import { useTableScene } from "@/composables/table/useTableScene";
import { placeSummaryFor } from "@/lib/table/placeKnown";
import { pressureAfterSend } from "@/lib/table/pressureLabel";
import type { PlayMode, RollAsk, TableFight, TablePressure } from "@/lib/table/soloTypes";
import { useTableSpeakers } from "@/composables/table/useTableSpeakers";
import { useTableCheck } from "@/composables/table/useTableCheck";
import { useTableTurn } from "@/composables/table/useTableTurn";
import { useTableVoice } from "@/composables/table/useTableVoice";
import { spokenLines } from "@/lib/table/voiceLines";
import { useAbove } from "@/composables/useBreakpoint";
import { getNpcDisplayFocalPoint, getNpcDisplayPortrait } from "@/lib/npcDisplay";
import { assignSpeakerColours } from "@/lib/table/speakerColours";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";

type Tab = "story" | "sheet" | "scene";

const route = useRoute();
const router = useRouter();
const campaign = useCampaignStore();
const queryClient = useQueryClient();
const wide = useAbove("md");
// Three columns need room for a story that is never narrower than about 28rem: below `lg` the sheet is a tab.
const showAll = useAbove("lg");
const tab = ref<Tab>("story");
const hitPoints = ref<{ current: number; max: number } | null>(null);
const appUi = useAppUiStore();
const disclosure = useTableDisclosure();
const { openOutOfCredits } = useOutOfCredits();
const { balance: rawBalance } = useAiCredits();
const balance = computed(() => rawBalance.value ?? null);

const campaignId = computed(() => campaign.activeCampaignId);
const param = computed(() => String(route.params.sessionId));

// `new` is a conversation that does not exist yet: its first turn creates it, and the address then becomes the real
// id without remounting, because a remount would drop the story that is streaming in.
function openedId(): string | null {
  return param.value === "new" ? null : param.value;
}
function queryText(key: string): string | null {
  const value = route.query[key];
  return typeof value === "string" && value !== "" ? value : null;
}

// What a NEW conversation begins with, read once: the address loses its query when it becomes the real id.
const newCharacterId = ref<string | null>(queryText("character"));
const newPlaceId = ref<string | null>(queryText("place"));
// The stored conversation to draw. Never the id this screen created itself: that story is already on the page.
const historyId = ref<string | null>(openedId());
const sceneId = ref<string | null>(newPlaceId.value);
// The fight the story has turned into, while the sitting waits on it: from the stored sitting, then from the stream.
const fight = ref<TableFight | null>(null);
// The clock the scene runs against: from the stored sitting when one is opened, then from each kept turn.
const pressure = ref<TablePressure | null>(null);
// The roll the table is waiting for: from the stored sitting, then from the turn that asks. The card shows it.
const asked = ref<RollAsk | null>(null);
// A roll carries no words, so the say/do mode of its turn changes nothing the server reads.
const ROLL_MODE: PlayMode = "do";

// A new sitting is about someone: with nobody chosen there is nothing to begin, so it goes back to choosing.
if (param.value === "new" && newCharacterId.value === null) void router.replace("/table");

const scene = useTableScene(sceneId, campaignId);

// What the player's turn in a fight still holds, as the board last said; null outside a fight. Declared before the
// turn that reads them: a sitting's opening is played while this page is still being set up.
const fightTurn = ref<FightTurn | null>(null);
const stage = ref<InstanceType<typeof SoloFightStage> | null>(null);

const turn = useTableTurn({
  campaignId: () => campaignId.value,
  sessionId: openedId(),
  characterId: () => newCharacterId.value,
  startLocationId: () => newPlaceId.value,
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
  onPressure: (now) => {
    pressure.value = now;
  },
  onFight: (now) => {
    fight.value = now;
  },
  onAskRoll: (ask) => {
    asked.value = ask;
  },
  onDone: () => {
    // Characters who speak are placed with the party at the end of a turn; the balance and the list of sittings moved.
    scene.refresh();
    void queryClient.invalidateQueries({ queryKey: ["ai-credit-balance"] });
    void queryClient.invalidateQueries({ queryKey: [TABLE_SESSIONS_KEY] });
  },
});

// The characters' voices. A line is handed to the voice the moment it arrives (it comes with the server's key for
// it), so the voice is being made while the player reads; `voiced` keeps each line to once.
const voice = useTableVoice({ campaignId: () => campaignId.value, sessionId: () => turn.sessionId.value });
const voiced = new Set<string>();
watch(
  () => turn.live.value,
  (items) => {
    const fresh = items.filter((item) => item.kind === "spoken" && !voiced.has(item.id));
    for (const item of fresh) voiced.add(item.id);
    voice.say(spokenLines(fresh));
  },
);
watch(
  () => voice.unavailable.value,
  (off) => {
    if (!off) return;
    toast.error("Voices are not switched on for this server.");
    voice.setEnabled(false);
  },
);
onBeforeUnmount(() => voice.stop());

// A new sitting begins with the Dungeon Master setting the scene, not with an empty page waiting for the player.
// Only once the disclosure has been read: nothing is sent to the model before the player knows who answers.
function openScene(): void {
  if (param.value === "new" && newCharacterId.value !== null && campaignId.value !== null && disclosure.hasBeenTold.value) void turn.open();
}
// On arrival, and again the moment the first-visit disclosure is accepted or the campaign becomes known.
watch([() => disclosure.hasBeenTold.value, campaignId], openScene, { immediate: true });

// A fight is fought here, on the table screen: the map comes out above the story and the board is worked by the
// rules (`SoloFightStage`). The places its parts go to are kept on the page whether or not a fight is on.
const FIGHT_SLOTS = { map: "solo-fight-map", turn: "solo-fight-turn", roster: "solo-fight-roster", roll: "solo-fight-roll" } as const;
const inFight = computed(() => fight.value !== null && !hasLeft.value && !conversation.isLoading.value && !conversation.isError.value);

// Nobody is left to fight: the fight is closed, and the Dungeon Master is asked to tell what comes of it.
function onFightOver(how: SoloFightEnd): void {
  fight.value = null;
  fightTurn.value = null;
  // Nobody left to fight, or the played character out of it: the board ended it, and the Dungeon Master is asked
  // to tell what comes of it.
  if (how === "foes_out" || how === "you_fell") {
    turn.note([{ kind: "margin", text: "The fight is over", tone: "end" }], true);
    void turn.aftermath();
    return;
  }
  // The Dungeon Master ended it with a ruling and has told how in the same reply: nothing more is asked.
  turn.note([{ kind: "margin", text: endLine(how, characterName.value), tone: "end" }], true);
}

// The composer in a fight (frame 15): open on your turn, one short line aloud, a deed only while the turn can pay.
const composerFight = computed(() =>
  inFight.value && fightTurn.value ? { yours: fightTurn.value.yours, words: fightTurn.value.words, canAct: fightTurn.value.action || fightTurn.value.bonus } : null,
);

// The fight is gone from under the page (ended elsewhere, or refused): the story goes on without it.
function onFightLost(): void {
  fight.value = null;
  fightTurn.value = null;
  toast.error("The fight could not be continued here.");
}

// The place's own map, above the story while there is no fight. Walking into another room on it is a deed like any
// other: the story moves the party, and the map follows the story.
const placeHasMap = ref(false);
function onGo(place: { id: string; name: string }): void {
  void sendTurn("do", `I go to ${place.name}.`);
}

// A line said aloud in a fight is the turn's few words: once said, they are spent.
function onSubmit(mode: PlayMode, text: string): void {
  if (mode === "say" && composerFight.value?.yours) stage.value?.spendWords();
  void sendTurn(mode, text);
}

// Every message goes through here: a clock that ran out goes off the page when the story moves on.
function sendTurn(...args: Parameters<typeof turn.send>): ReturnType<typeof turn.send> {
  pressure.value = pressureAfterSend(pressure.value);
  return turn.send(...args);
}

// The address changed under a mounted page (another sitting, or a new one): start over. The id this screen created
// itself is already the turn's own, so that replace changes nothing.
watch(param, () => {
  if (turn.sessionId.value === openedId()) return;
  turn.reset(openedId());
  historyId.value = openedId();
  newCharacterId.value = queryText("character");
  newPlaceId.value = queryText("place");
  sceneId.value = newPlaceId.value;
  pressure.value = null;
  fight.value = null;
  asked.value = null;
  voice.stop();
  voiced.clear();
  if (param.value === "new" && newCharacterId.value === null) void router.replace("/table");
  openScene();
});

const conversation = useTableConversation(historyId, campaignId);
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

const story = computed(() => [...(conversation.data.value?.items ?? []), ...turn.live.value]);
const turns = computed(() => story.value.filter((item) => item.kind === "player").length);
const colours = computed(() => assignSpeakerColours(story.value));
const meterCredits = computed(() => Math.floor((conversation.data.value?.sitting.credits_spent ?? 0) + turn.credits.value));

const party = useParty();
const characterId = computed(() => conversation.data.value?.sitting.party_member_id ?? newCharacterId.value);
const member = computed(() => party.data.value?.find((m) => m.id === characterId.value) ?? null);
// Playing is done as a player: the shell stands on the player side as this character (see `tablePlay` in the app
// store). The door sets it before coming here; this covers a sitting reached any other way.
watch(
  () => member.value?.id ?? null,
  (id) => {
    if (id !== null && appUi.tablePlay?.memberId !== id) appUi.enterTablePlay(id, turn.sessionId.value);
  },
  { immediate: true },
);

// "What you are after": the quests and current beats as the played character sees them, through the same
// player-visible projections the Hearth reads (never the DM's own quest rows). No character, nothing shown.
// A quest whose current beat has no player text still shows, by its title: it is known to the character.
const playedId = computed(() => (member.value ? member.value.id : null));
const placeSummary = computed(() => placeSummaryFor(scene.place.data.value, playedId.value));
const knownQuests = usePlayerVisibleQuests(playedId);
const knownBeats = usePlayerQuestBeats(undefined, playedId);
const after = computed(() =>
  playedId.value !== null && knownQuests.data.value && knownBeats.data.value
    ? currentBeatsByQuest(knownQuests.data.value, knownBeats.data.value)
    : [],
);
const check = useTableCheck(member, asked);

// What is on screen below `lg`. A tablet draws story and scene side by side, so for it "scene" is the story's tab; a
// sitting with nobody readable has no sheet to open.
const view = computed<Tab>(() => {
  if (showAll.value) return "story";
  if (tab.value === "sheet" && !member.value) return "story";
  if (tab.value === "scene" && wide.value) return "story";
  return tab.value;
});
const tabOptions = computed<Array<{ value: Tab; label: string }>>(() => [
  { value: "story" as const, label: "Story" },
  ...(member.value ? [{ value: "sheet" as const, label: "Sheet" }] : []),
  ...(wide.value ? [] : [{ value: "scene" as const, label: "Scene" }]),
]);
// A roll the story asks for brings the player back to it, from whichever tab they were reading.
watch(asked, (now) => {
  if (now !== null) tab.value = "story";
});
const characterName = computed(() => party.data.value?.find((m) => m.id === characterId.value)?.name ?? "your character");

const speakerIds = computed(() => story.value.flatMap((item) => ((item.kind === "spoken" || item.kind === "acted") && item.speaker.id ? [item.speaker.id] : [])));
const speakers = useTableSpeakers(speakerIds, campaignId);
const portraits = computed(() => {
  const map = new Map<string, { src: string; focalPoint: { x: number; y: number } | null }>();
  for (const [id, npc] of speakers.byId.value) {
    const src = getNpcDisplayPortrait(npc);
    if (src) map.set(id, { src, focalPoint: getNpcDisplayFocalPoint(npc) ?? null });
  }
  return map;
});

// A sitting that was left is read only: the server refuses its turns, and the page does not offer to send one.
const hasLeft = computed(() => {
  const sitting = conversation.data.value?.sitting;
  return sitting !== undefined && sitting.left_at !== null;
});

const toast = useToast();
const leaveTable = useLeaveTable();
async function leave(): Promise<void> {
  // A conversation that does not exist yet has nothing to end. A turn still running is stopped first: it would
  // otherwise be refused by the server the moment the sitting is marked left.
  turn.stop();
  const id = turn.sessionId.value;
  if (id !== null && campaignId.value !== null) {
    const outcome = await leaveTable.leave(campaignId.value, id);
    // Never stuck at a table: a failed call is said and the player goes anyway.
    if (outcome === null) toast.error("Leaving the table could not be recorded. The session may still be running; end it from the Sessions page.");
    else void queryClient.invalidateQueries({ queryKey: [TABLE_SESSIONS_KEY] });
  }
  voice.stop();
  // Getting up from the table is going back to being the Dungeon Master.
  appUi.exitTablePlay();
  await router.push("/table");
}

function declineDisclosure(): void {
  // Not told yet and not wanting to be: nobody sits at a table they were not told about.
  if (!disclosure.hasBeenTold.value) void router.push("/table");
  else disclosure.dismiss();
}
</script>
