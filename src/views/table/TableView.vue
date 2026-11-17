<template>
  <div class="flex min-h-0 flex-1 flex-col" data-testid="table-view">
    <SoloAiOff v-if="!campaign.isAiEnabled" class="m-4" />

    <template v-else>
      <SoloBar
        :campaign="campaign.activeCampaign?.name ?? ''"
        :character="characterName"
        :credits="meterCredits"
        :turns="turns"
        :balance="balance"
        :leaving="leaveTable.leaving.value"
        @leave="leave"
        @disclosure="disclosure.reopen"
        @credits="openOutOfCredits(1)"
      />

      <div v-if="!wide" class="shrink-0 border-b border-border bg-card px-3 py-2">
        <SegmentedControl v-model="tab" :options="TABS" size="md" block />
      </div>

      <div class="flex min-h-0 flex-1">
        <main v-show="wide || tab === 'story'" class="flex min-w-0 flex-1 flex-col" aria-label="The story">
          <ListSkeleton v-if="conversation.isLoading.value" variant="text" :count="3" class="m-4" />
          <div v-else-if="conversation.isError.value" class="m-4 flex flex-col items-start gap-2" role="alert">
            <p class="text-body text-destructive">This sitting could not be opened. It may have been removed, or belong to another campaign.</p>
            <AppButton to="/table" variant="outline" size="md" label="Back to the table" />
          </div>
          <template v-else>
            <SoloStory
              :items="story"
              :colours="colours"
              :portraits="portraits"
              :character="characterName"
              :failure="turn.failure.value"
              :running="turn.running.value"
              @resend="turn.resend()"
              @credits="openOutOfCredits(1)"
            />
            <div class="shrink-0 px-4 pt-2 pb-4 md:px-6">
              <SoloLeft v-if="hasLeft" />
              <SoloComposer
                v-else
                :character="characterName"
                :running="turn.running.value"
                @submit="(mode, text) => turn.send(mode, text)"
                @stop="turn.stop()"
              />
              <p class="mx-auto mt-1 hidden w-full max-w-160 md:block">
                <AppButton to="/table/story" variant="link" size="inline" label="The story so far" />
              </p>
            </div>
          </template>
        </main>

        <aside v-show="wide || tab === 'scene'" class="min-w-0 overflow-y-auto bg-card max-md:flex-1 md:w-80 md:shrink-0 md:border-l md:border-border" aria-label="The scene">
          <SoloScene :place-name="scene.place.data.value?.name ?? null" :here="scene.here.data.value ?? []" />
        </aside>
      </div>

      <SoloDisclosure :open="disclosure.open.value" @accept="disclosure.accept" @decline="declineDisclosure" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
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
import { useTableScene } from "@/composables/table/useTableScene";
import { useTableSpeakers } from "@/composables/table/useTableSpeakers";
import { useTableTurn } from "@/composables/table/useTableTurn";
import { useAbove } from "@/composables/useBreakpoint";
import { getNpcDisplayFocalPoint, getNpcDisplayPortrait } from "@/lib/npcDisplay";
import { assignSpeakerColours } from "@/lib/table/speakerColours";
import { useCampaignStore } from "@/stores/campaign";

const TABS = [
  { value: "story", label: "Story" },
  { value: "scene", label: "Scene" },
] as const;

const route = useRoute();
const router = useRouter();
const campaign = useCampaignStore();
const queryClient = useQueryClient();
const wide = useAbove("md");
const tab = ref<"story" | "scene">("story");
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

// A new sitting is about someone: with nobody chosen there is nothing to begin, so it goes back to choosing.
if (param.value === "new" && newCharacterId.value === null) void router.replace("/table");

const scene = useTableScene(sceneId, campaignId);

const turn = useTableTurn({
  campaignId: () => campaignId.value,
  sessionId: openedId(),
  characterId: () => newCharacterId.value,
  startLocationId: () => newPlaceId.value,
  onSession: (id) => {
    if (route.params.sessionId !== id) void router.replace({ name: "table-session", params: { sessionId: id } });
  },
  onScene: (arrived) => {
    sceneId.value = arrived.id;
    scene.refresh();
  },
  onDone: () => {
    // Characters who speak are placed with the party at the end of a turn; the balance and the list of sittings moved.
    scene.refresh();
    void queryClient.invalidateQueries({ queryKey: ["ai-credit-balance"] });
    void queryClient.invalidateQueries({ queryKey: [TABLE_SESSIONS_KEY] });
  },
});

// The address changed under a mounted page (another sitting, or a new one): start over. The id this screen created
// itself is already the turn's own, so that replace changes nothing.
watch(param, () => {
  if (turn.sessionId.value === openedId()) return;
  turn.reset(openedId());
  historyId.value = openedId();
  newCharacterId.value = queryText("character");
  newPlaceId.value = queryText("place");
  sceneId.value = newPlaceId.value;
  if (param.value === "new" && newCharacterId.value === null) void router.replace("/table");
});

const conversation = useTableConversation(historyId, campaignId);
watch(
  () => conversation.data.value,
  (stored) => {
    if (stored?.sitting.scene_location_id) sceneId.value = stored.sitting.scene_location_id;
  },
);

const story = computed(() => [...(conversation.data.value?.items ?? []), ...turn.live.value]);
const turns = computed(() => story.value.filter((item) => item.kind === "player").length);
const colours = computed(() => assignSpeakerColours(story.value));
const meterCredits = computed(() => Math.floor((conversation.data.value?.sitting.credits_spent ?? 0) + turn.credits.value));

const party = useParty();
const characterId = computed(() => conversation.data.value?.sitting.party_member_id ?? newCharacterId.value);
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
  await router.push("/table");
}

function declineDisclosure(): void {
  // Not told yet and not wanting to be: nobody sits at a table they were not told about.
  if (!disclosure.hasBeenTold.value) void router.push("/table");
  else disclosure.dismiss();
}
</script>
