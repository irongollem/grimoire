<template>
  <PageHeader title="The table" description="Play a character while an AI Narrator tells the story. Every character in it speaks in their own box.">
    <div class="px-4 pb-8 pt-4 md:px-6" data-testid="table-start">
      <!-- Before play: what the story will need and the campaign lacks (#1021 row 22). -->
      <div v-if="campaign.isAiEnabled && campaign.activeCampaignId" class="mb-4 flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 border border-border bg-card px-4 py-3" data-testid="table-prep">
        <p class="min-w-0 flex-1 basis-64 text-body text-foreground">Get the campaign ready: have the AI propose the hazards, places, items, roll tables and dungeon features your quests will need and you do not have yet.</p>
        <AppButton variant="outline" size="md" label="Prep campaign" @click="prepOpen = true" />
        <CampaignPrepDialog :open="prepOpen" :campaign-id="campaign.activeCampaignId" @close="prepOpen = false" />
      </div>

      <SoloAiOff v-if="!campaign.isAiEnabled" class="mx-0" />

      <!-- An open sitting is reopened as it stands; nothing to show while the page goes there. -->
      <ListSkeleton v-else-if="resume === null || resume.kind === 'open'" variant="stack" :count="3" />

      <div v-else class="flex max-w-2xl flex-col gap-6">
        <SoloSittingSettings />
        <!-- The story goes on where it was left: the campaign already knows who is played and where the party is. -->
        <section v-if="resume.kind === 'again'" class="flex flex-col gap-3 border border-border bg-card p-4" aria-labelledby="table-again" data-testid="table-again">
          <h2 id="table-again" class="text-heading-sm text-foreground">Pick up the story</h2>
          <p class="text-body text-foreground">
            {{ againName }}<template v-if="againPlace">, at {{ againPlace }}</template>. The Narrator opens the scene where you left it.
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <AppButton variant="live" size="md" label="Sit down" @click="sitDownAgain" />
            <AppButton variant="link" size="inline" :label="choosing ? 'Never mind' : 'Play someone else, or begin somewhere else'" @click="choosing = !choosing" />
          </div>
        </section>

        <template v-if="resume.kind === 'first' || choosing">
        <section class="flex flex-col gap-2" aria-labelledby="table-who">
          <h2 id="table-who" class="text-heading-sm text-foreground">Who you play</h2>
          <ListSkeleton v-if="party.isLoading.value" variant="stack" :count="3" />
          <p v-else-if="party.isError.value" role="alert" class="text-body text-destructive">The party could not be read. Reload to try again.</p>
          <p v-else-if="!characters.length" class="text-body italic text-muted-foreground">
            The party has no one to play yet.
            <AppButton to="/party/new" variant="link" size="inline" label="Add a hero" />
          </p>
          <CardRadioGroup v-else v-model="characterId" :options="characterOptions" label="Who you play" />
        </section>

        <!-- A campaign with an opening quest begins there: the very first sitting is not asked where. -->
        <section v-if="beginsWith" class="flex flex-col gap-1" aria-labelledby="table-begins" data-testid="table-begins">
          <h2 id="table-begins" class="text-heading-sm text-foreground">Where the story begins</h2>
          <p class="text-body text-foreground">{{ beginsWith }}</p>
        </section>
        <section v-else class="flex flex-col gap-2" aria-labelledby="table-where">
          <h2 id="table-where" class="text-heading-sm text-foreground">Where you begin</h2>
          <div class="flex items-center gap-2">
            <EntityCombobox v-model="placeId" :options="places" placeholder="Anywhere the story starts" class="flex-1" />
            <AppButton v-if="placeId" variant="ghost" size="md" label="Clear" @click="placeId = ''" />
          </div>
          <p class="text-caption text-muted-foreground">Optional. Leave it empty and the Narrator starts where the campaign says the party is.</p>
        </section>

        <div>
          <AppButton :variant="resume.kind === 'first' ? 'live' : 'outline'" size="md" label="Sit down" :disabled="!characterId" @click="sitDown" />
        </div>
        </template>

        <section class="flex flex-col gap-2" aria-labelledby="table-record">
          <h2 id="table-record" class="text-heading-sm text-foreground">The story so far</h2>
          <p class="text-caption text-muted-foreground">What the table has settled, kept as plain facts you can read and correct.</p>
          <div><AppButton to="/table/story" variant="outline" size="md" label="Read the record" /></div>
        </section>

        <section class="flex flex-col gap-2" aria-labelledby="table-earlier">
          <h2 id="table-earlier" class="text-heading-sm text-foreground">Earlier sittings</h2>
          <ListSkeleton v-if="sessions.isLoading.value" variant="stack" :count="3" />
          <p v-else-if="sessions.isError.value" role="alert" class="text-body text-destructive">Earlier sittings could not be read. Reload to try again.</p>
          <p v-else-if="!sessions.sittings.value.length" class="text-body italic text-muted-foreground">Nothing yet. Your first sitting will be kept here.</p>
          <ul v-else class="flex flex-col divide-y divide-border border border-border bg-card">
            <li v-for="sitting in sessions.sittings.value" :key="sitting.id" class="flex items-center gap-3 px-3 py-2.5" data-testid="table-sitting">
              <div class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-label-lg font-semibold text-foreground">{{ sittingWho(sitting.characterName, sitting.party_member_id) }}</span>
                <span class="truncate text-caption text-muted-foreground">
                  <template v-if="sitting.placeName">{{ sitting.placeName }} · </template>{{ dayOf(sitting.updated_at) }}
                </span>
              </div>
              <AppButton :to="`/play/table/${sitting.id}`" variant="outline" size="md" :label="sitting.left_at === null ? 'Continue' : 'Read'" @click="sitting.party_member_id && appUi.enterTablePlay(sitting.party_member_id, sitting.id)" />
              <!-- Only a sitting that was left: one that goes on still holds a session open, and leaving ends that. -->
              <AppButton
                v-if="sitting.left_at !== null"
                variant="ghost"
                size="md"
                :icon="IconDelete"
                aria-label="Delete this sitting"
                tooltip="Delete this sitting"
                :loading="forget.isPending.value && forget.variables.value?.sessionId === sitting.id"
                data-testid="table-sitting-delete"
                @click="deleteSitting(sitting.id)"
              />
            </li>
          </ul>
        </section>
      </div>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import CampaignPrepDialog from "@/components/table/prep/CampaignPrepDialog.vue";
import { computed, ref, watch } from "vue";
import { resumeOf } from "@/lib/table/solo/resume";
import { sittingWho } from "@/lib/table/solo/sittingLabel";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import CardRadioGroup from "@/components/common/controls/CardRadioGroup.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import PageHeader from "@/components/common/list/PageHeader.vue";
import SoloAiOff from "@/components/table/solo/SoloAiOff.vue";
import SoloSittingSettings from "@/components/table/solo/SoloSittingSettings.vue";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useActiveParty } from "@/composables/party/useActiveParty";
import { useQuests } from "@/composables/quests/useQuests";
import { useTableSessions } from "@/composables/table/useTableSessions";
import { useForgetSitting } from "@/composables/table/useForgetSitting";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { IconDelete } from "@/lib/icons";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";

const campaign = useCampaignStore();
// Prep campaign (#1021 row 22): the dialog is opened from the card at the top of this page.
const prepOpen = ref(false);
const appUi = useAppUiStore();
const router = useRouter();

const party = useActiveParty();
const characters = computed(() => party.data.value ?? []);
const characterOptions = computed(() =>
  characters.value.map((member) => ({
    value: member.id,
    label: member.name,
    description: ["Level " + member.level, member.class].filter(Boolean).join(" "),
  })),
);

const { data: locations } = useAllLocations();
const places = computed(() => (locations.value ?? []).map((l) => ({ id: l.id, name: l.name })));

const sessions = useTableSessions(() => campaign.activeCampaignId);

// Deleting a sitting takes the conversation and its voice clips; the record of what happened stays the campaign's.
const forget = useForgetSitting();
const { confirm } = useConfirm();
const toast = useToast();
async function deleteSitting(sessionId: string): Promise<void> {
  const campaignId = campaign.activeCampaignId;
  if (campaignId === null) return;
  const ok = await confirm(
    "The conversation and the voices made for it are deleted for good. What it put on the campaign's record stays.",
    { title: "Delete this sitting?", confirmLabel: "Delete", danger: true },
  );
  if (!ok) return;
  try {
    await forget.mutateAsync({ campaignId, sessionId });
  } catch (error) {
    toast.error(toast.fromError(error, "Couldn't delete the sitting."));
  }
}

// How the story is picked up: null until the party and the sittings are both read (deciding on half would send a
// player with an open sitting to the chooser for a moment).
const resume = computed(() => {
  if (!party.data.value || !sessions.data.value) return party.isError.value || sessions.isError.value ? ({ kind: "first" } as const) : null;
  return resumeOf(sessions.sittings.value, new Set(characters.value.map((m) => m.id)), Date.now());
});
// A sitting that was never left is simply reopened. `replace`, so Back does not bounce through this page.
watch(
  resume,
  (now) => {
    if (now?.kind === "open" && campaign.isAiEnabled) {
      appUi.enterTablePlay(now.characterId, now.sessionId);
      void router.replace(`/play/table/${now.sessionId}`);
    } else if (now !== null) {
      // This is the Dungeon Master's side of the door. Whoever stands here is not playing, so the played
      // character's lens comes off (after "Back to the Dungeon Master's side", or a sitting that was left).
      appUi.exitTablePlay();
    }
  },
  { immediate: true },
);
const choosing = ref(false);
// The campaign's prologue, while nothing has been played yet: the server begins the first sitting at its opening
// beat, so the page says so instead of asking for a place. Once a sitting exists the story is picked up, not begun.
const { data: quests } = useQuests();
const beginsWith = computed(() => {
  if (resume.value?.kind !== "first" || sessions.sittings.value.length > 0) return null;
  const id = campaign.activeCampaign?.opening_quest_id ?? null;
  return id === null ? null : (quests.value?.find((q) => q.id === id)?.title ?? null);
});
const againName = computed(() => {
  const now = resume.value;
  return now?.kind === "again" ? (characters.value.find((m) => m.id === now.characterId)?.name ?? null) : null;
});
const againPlace = computed(() => {
  const now = resume.value;
  return now?.kind === "again" && now.placeId !== null ? (places.value.find((p) => p.id === now.placeId)?.name ?? null) : null;
});
function sitDownAgain(): void {
  const now = resume.value;
  if (now?.kind !== "again") return;
  appUi.enterTablePlay(now.characterId);
  void router.push({ path: "/play/table/new", query: { character: now.characterId, ...(now.placeId !== null ? { place: now.placeId } : {}) } });
}

// Required: a character is who the story is about. "" is the combobox's empty value.
const characterId = ref<string | null>(null);
const placeId = ref("");

function sitDown(): void {
  if (!characterId.value) return;
  // Sitting down is becoming a player: the shell goes to the player side as this character.
  appUi.enterTablePlay(characterId.value);
  void router.push({ path: "/play/table/new", query: { character: characterId.value, ...(placeId.value ? { place: placeId.value } : {}) } });
}

function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
</script>
