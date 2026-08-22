<template>
  <div class="space-y-4">
    <!-- Back -->
    <AppButton
      to="/play/quests"
      variant="ghost"
      size="inline"
      :icon="IconChevronLeft"
      label="Quest Log"
    />

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <div
      v-else-if="!quest || !quest.player_visible_to?.length"
      class="text-center py-16 space-y-3"
    >
      <IconScrollText class="h-10 w-10 text-muted-foreground/30 mx-auto" />
      <p class="font-cinzel text-sm text-muted-foreground">Quest not found.</p>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="flex flex-wrap items-start justify-between gap-3">
        <h2 class="text-heading-lg font-bold text-foreground">
          {{ quest.title }}
        </h2>
        <span
          class="text-label px-2.5 py-1 rounded-full"
          :style="{
            color: QUEST_STATUS_COLORS[quest.status],
            borderColor: QUEST_STATUS_COLORS[quest.status] + '50',
          }"
          style="border-width: 1px"
        >
          {{ QUEST_STATUS_LABELS[quest.status] }}
        </span>
      </div>

      <!-- Meta row -->
      <div
        class="flex flex-wrap gap-x-4 gap-y-1.5 text-body text-muted-foreground"
      >
        <AppButton
          v-if="giverName"
          variant="ghost"
          tone="primary"
          size="inline"
          class="text-body"
          :icon="IconUser"
          :label="giverName"
          @click="openNpc(quest!.giver_npc_id!)"
        />
        <AppButton
          v-if="primaryLocationName && quest?.location_id && sharedLocationIds.has(quest.location_id)"
          variant="ghost"
          tone="primary"
          size="inline"
          class="text-body"
          :icon="IconLocation"
          :label="primaryLocationName"
          @click="openLocation(quest!.location_id!)"
        />
        <span v-else-if="primaryLocationName" class="flex items-center gap-1.5">
          <IconLocation class="h-3.5 w-3.5 shrink-0" />
          {{ primaryLocationName }}
        </span>
      </div>

      <!-- Summary -->
      <p v-if="quest.summary" class="font-fell text-foreground leading-relaxed">
        {{ quest.summary }}
      </p>

      <!-- Full narrative description (rich text) -->
      <RichTextViewer
        v-if="quest.description"
        :content="quest.description"
        class="font-fell text-foreground leading-relaxed"
      />

      <!-- Existing quests stay unchanged until the DM authors at least one
           player-visible beat. The thread is a projection, never the graph. -->
      <PlayerQuestStoryThread v-if="playerBeats?.length" :beats="playerBeats" />

      <!-- Objectives -->
      <div
        v-if="visibleObjectives.length"
        class="rounded-lg border border-border bg-card overflow-hidden"
      >
        <div
          class="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between"
        >
          <span
            class="text-label-lg font-semibold text-muted-foreground"
            >Objectives</span
          >
          <span class="text-caption text-muted-foreground"
            >{{ doneCount }}/{{ visibleObjectives.length }}</span
          >
        </div>
        <div class="p-2 flex flex-col gap-1">
          <div
            v-for="obj in visibleObjectives"
            :key="obj.id"
            class="flex items-start gap-2.5 px-2 py-1.5"
          >
            <QuestObjectiveStatusMark :status="obj.status" class="mt-0.5" />
            <span
              class="text-body leading-snug"
              :class="
                obj.status === 'complete'
                  ? 'text-muted-foreground line-through'
                  : obj.status === 'failed' ? 'text-muted-foreground' : 'text-foreground'
              "
            >
              {{ obj.description }}
            </span>
          </div>
        </div>
      </div>

      <!-- Rewards -->
      <div
        v-if="
          quest.rewards || quest.reward_item_ids?.length || hasCurrencyReward
        "
        class="rounded-lg border border-border bg-card overflow-hidden"
      >
        <div
          class="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between"
        >
          <span
            class="text-label-lg font-semibold text-muted-foreground"
            >Rewards</span
          >
        </div>
        <div class="p-3 flex flex-col gap-2">
          <p v-if="quest.rewards" class="text-body text-foreground">
            {{ quest.rewards }}
          </p>
          <p v-if="hasCurrencyReward" class="text-body text-foreground">
            {{ currencyParts.join(", ") }}
          </p>
          <div v-if="quest.reward_item_ids?.length" class="flex flex-wrap gap-1.5">
            <span
              v-for="itemId in quest.reward_item_ids"
              :key="itemId"
              class="text-body text-foreground bg-muted/40 rounded px-2 py-0.5"
              >{{ itemName(itemId) }}</span
            >
          </div>
        </div>
      </div>

      <!-- Key NPCs -->
      <div
        v-if="linkedNpcRefs.length"
        class="rounded-lg border border-border bg-card overflow-hidden"
      >
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span
            class="text-label-lg font-semibold text-muted-foreground"
            >Key NPCs</span
          >
        </div>
        <div class="p-2 flex flex-col gap-1">
          <AppButton
            v-for="ref in linkedNpcRefs"
            :key="ref.id"
            variant="menu"
            size="body"
            block
            @click="openNpc(ref.ref_id)"
          >
            <IconUser class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span class="text-body text-foreground hover:text-primary transition-colors">{{
              npcName(ref.ref_id)
            }}</span>
          </AppButton>
        </div>
      </div>

      <!-- Key Locations -->
      <div
        v-if="linkedLocationRefs.length"
        class="rounded-lg border border-border bg-card overflow-hidden"
      >
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span
            class="text-label-lg font-semibold text-muted-foreground"
            >Key Locations</span
          >
        </div>
        <div class="p-2 flex flex-col gap-1">
          <template v-for="ref in linkedLocationRefs" :key="ref.id">
            <AppButton
              v-if="sharedLocationIds.has(ref.ref_id)"
              variant="menu"
              size="body"
              block
              @click="openLocation(ref.ref_id)"
            >
              <IconLocation class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span class="text-body text-foreground hover:text-primary transition-colors">{{
                locationName2(ref.ref_id)
              }}</span>
            </AppButton>
            <div
              v-else
              class="flex items-center gap-2 px-2 py-1.5"
            >
              <IconLocation class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span class="text-body text-foreground">{{
                locationName2(ref.ref_id)
              }}</span>
            </div>
          </template>
        </div>
      </div>

      <!-- Creatures -->
      <div
        v-if="linkedMonsterRefs.length"
        class="rounded-lg border border-border bg-card overflow-hidden"
      >
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span
            class="text-label-lg font-semibold text-muted-foreground"
            >Creatures</span
          >
        </div>
        <div class="p-2 flex flex-col gap-1">
          <div
            v-for="ref in linkedMonsterRefs"
            :key="ref.id"
            class="flex items-center gap-2 px-2 py-1.5"
          >
            <IconMonster class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span class="text-body text-foreground">{{
              monsterName(ref.ref_id)
            }}</span>
          </div>
        </div>
      </div>

      <!-- Notes -->
      <PlayerNotesWidget
        v-if="quest"
        entity-type="quest"
        :entity-id="quest.id"
        placeholder="Jot down your thoughts, clues, suspicions…"
      />
    </template>
  </div>

  <!-- NPC lightbox -->
  <AppModal :open="!!selectedNpc" size="md" :labelled-by="npcHeadingId" @close="selectedNpc = null">
    <div class="relative shrink-0">
      <div v-if="selectedNpc?.player_visible_fields?.includes('portrait') && getNpcDisplayPortrait(selectedNpc)" class="w-full h-72 overflow-hidden">
        <FocalImage
          :src="getNpcDisplayPortrait(selectedNpc)!"
          :alt="getNpcDisplayName(selectedNpc) ?? '???'"
          format="portrait"
          :focal-point="getNpcDisplayFocalPoint(selectedNpc)"
          :lightbox="true"
        />
      </div>
      <AppButton
        variant="ghost"
        size="icon-sm"
        :class="[CARD_OVERLAY_SCRIM, 'absolute top-2 right-2 rounded-full text-white']"
        :icon="IconClose"
        icon-size="md"
        aria-label="Close"
        @click="selectedNpc = null"
      />
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
      <div>
        <h2 :id="npcHeadingId" class="text-heading font-bold text-foreground">
          {{ selectedNpc?.player_visible_fields?.includes('name') ? getNpcDisplayName(selectedNpc) : '???' }}
        </h2>
        <p v-if="selectedNpc?.player_visible_fields?.includes('race') && selectedNpc.race"
          class="mt-1 text-body text-muted-foreground italic">{{ selectedNpc.race }}</p>
        <p v-if="selectedNpc?.player_visible_fields?.includes('occupation') && selectedNpc.occupation"
          class="text-body text-muted-foreground">{{ selectedNpc.occupation }}</p>
      </div>
      <PlayerNotesWidget v-if="selectedNpc" entity-type="npc" :entity-id="selectedNpc.id" placeholder="Your observations about this character…" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconChevronLeft, IconClose, IconLocation, IconMonster, IconScrollText, IconUser } from '@/lib/icons';
import { countObjectivesComplete } from "@/lib/quests/objectives";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import { CARD_OVERLAY_SCRIM } from "@/components/common/appButtonVariants";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";
import QuestObjectiveStatusMark from "@/components/quests/QuestObjectiveStatusMark.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import {
  usePlayerVisibleQuest,
  useQuestObjectives,
  useQuestRefs,
} from "@/composables/useQuests";
import { useMarkRead } from "@/composables/useReadItems";
import { useSharedNpcs } from "@/composables/useNpcs";
import { useSharedLocations } from "@/composables/useLocations";
import { usePlayerVisibleMonsters } from "@/composables/useMonsters";
import { usePlayerVisibleItems } from "@/composables/useItems";
import { usePlayerQuestBeats } from "@/composables/useQuestFlow";
import { getNpcDisplayName, getNpcDisplayPortrait, getNpcDisplayFocalPoint } from "@/lib/npcDisplay";
import { QUEST_STATUS_LABELS, QUEST_STATUS_COLORS } from "@/types/quest.types";
import type { PlayerNpc } from "@/types/npc.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import PlayerQuestStoryThread from "@/components/player/PlayerQuestStoryThread.vue";

const route = useRoute();
const router = useRouter();
const questId = computed(() => route.params.id as string);

const { data: quest, isLoading } = usePlayerVisibleQuest(questId);
const { data: playerBeats } = usePlayerQuestBeats(questId);
const { mutate: markRead } = useMarkRead();

watch(quest, (q) => {
  if (q?.id) markRead({ entityType: "quest", entityId: q.id });
}, { immediate: true });
const { data: objectives } = useQuestObjectives(questId);
const { data: questRefs } = useQuestRefs(questId);

// Player-visible projection only — the raw npcs table leaks disguised/hidden
// NPCs' real names (get_player_visible_npcs gates name/race/occupation).
const { data: npcs } = useSharedNpcs();
const { data: locations } = useSharedLocations();
const { data: allMonsters } = usePlayerVisibleMonsters();
const { data: allItems } = usePlayerVisibleItems();

// NPC lightbox
const selectedNpc = ref<PlayerNpc | null>(null);
const npcHeadingId = useId();

function openNpc(npcId: string) {
  const npc = (npcs.value ?? []).find((n) => n.id === npcId);
  if (npc) selectedNpc.value = npc;
}

// Shared location IDs — only locations accessible to this player render as links
const sharedLocationIds = computed(() => new Set((locations.value ?? []).map((l) => l.id)));

function openLocation(id: string) {
  void router.push({ path: "/play/atlas", query: { open: id } });
}

// Giver / primary location names
const giverName = computed(
  () =>
    (npcs.value ?? []).find((n) => n.id === quest.value?.giver_npc_id)?.name ??
    null,
);
const primaryLocationName = computed(
  () =>
    (locations.value ?? []).find((l) => l.id === quest.value?.location_id)
      ?.name ?? null,
);

// Refs grouped by type — only show player-visible ones
const visibleRefs = computed(() =>
  (questRefs.value ?? []).filter((r) => r.is_player_visible),
);
const linkedNpcRefs = computed(() =>
  visibleRefs.value.filter((r) => r.ref_type === "npc"),
);
const linkedLocationRefs = computed(() =>
  visibleRefs.value.filter((r) => r.ref_type === "location"),
);
const linkedMonsterRefs = computed(() =>
  visibleRefs.value.filter((r) => r.ref_type === "monster"),
);

// Currency reward
const hasCurrencyReward = computed(
  () =>
    (quest.value?.reward_pp ?? 0) +
      (quest.value?.reward_gp ?? 0) +
      (quest.value?.reward_ep ?? 0) +
      (quest.value?.reward_sp ?? 0) +
      (quest.value?.reward_cp ?? 0) >
    0,
);

const visibleObjectives = computed(() =>
  (objectives.value ?? []).filter((o) => o.is_player_visible),
);
const doneCount = computed(
  () => countObjectivesComplete(visibleObjectives.value),
);

// Name lookups — "???" marks a visible ref whose target isn't shared with
// this player, never the raw id.
function npcName(id: string) {
  return (npcs.value ?? []).find((n) => n.id === id)?.name ?? "???";
}
function locationName2(id: string) {
  return (locations.value ?? []).find((l) => l.id === id)?.name ?? "???";
}
function monsterName(id: string) {
  return (allMonsters.value ?? []).find((m) => m.id === id)?.name ?? "???";
}
function itemName(id: string) {
  return (allItems.value ?? []).find((i) => i.id === id)?.name ?? "???";
}

// Currency reward, formatted as e.g. "12 gp, 4 sp"
const currencyParts = computed(() => {
  if (!quest.value) return [];
  const q = quest.value;
  return (
    [
      ["pp", q.reward_pp],
      ["gp", q.reward_gp],
      ["ep", q.reward_ep],
      ["sp", q.reward_sp],
      ["cp", q.reward_cp],
    ] as const
  )
    .filter(([, amount]) => amount > 0)
    .map(([label, amount]) => `${amount} ${label}`);
});
</script>
