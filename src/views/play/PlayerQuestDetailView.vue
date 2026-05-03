<template>
  <div class="space-y-4">
    <!-- Back -->
    <RouterLink
      to="/play/quests"
      class="inline-flex items-center gap-1.5 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors tracking-wider"
    >
      <ChevronLeft class="h-3.5 w-3.5" />
      Quest Log
    </RouterLink>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <div
      v-else-if="!quest || !quest.player_visible_to?.length"
      class="text-center py-16 space-y-3"
    >
      <ScrollText class="h-10 w-10 text-muted-foreground/30 mx-auto" />
      <p class="font-cinzel text-sm text-muted-foreground">Quest not found.</p>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="flex flex-wrap items-start justify-between gap-3">
        <h2 class="font-cinzel text-xl font-bold text-foreground">
          {{ quest.title }}
        </h2>
        <span
          class="font-cinzel text-[10px] px-2.5 py-1 rounded-full tracking-wider"
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
        class="flex flex-wrap gap-x-4 gap-y-1.5 text-sm font-fell text-muted-foreground"
      >
        <button
          v-if="giverName"
          type="button"
          class="flex items-center gap-1.5 hover:text-primary transition-colors"
          @click="openNpc(quest!.giver_npc_id!)"
        >
          <User class="h-3.5 w-3.5 shrink-0" />
          {{ giverName }}
        </button>
        <button
          v-if="primaryLocationName && quest?.location_id && sharedLocationIds.has(quest.location_id)"
          type="button"
          class="flex items-center gap-1.5 hover:text-primary transition-colors"
          @click="openLocation(quest!.location_id!)"
        >
          <MapPin class="h-3.5 w-3.5 shrink-0" />
          {{ primaryLocationName }}
        </button>
        <span v-else-if="primaryLocationName" class="flex items-center gap-1.5">
          <MapPin class="h-3.5 w-3.5 shrink-0" />
          {{ primaryLocationName }}
        </span>
      </div>

      <!-- Summary -->
      <p v-if="quest.summary" class="font-fell text-foreground leading-relaxed">
        {{ quest.summary }}
      </p>

      <!-- Objectives -->
      <div
        v-if="visibleObjectives.length"
        class="rounded-lg border border-border bg-card overflow-hidden"
      >
        <div
          class="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between"
        >
          <span
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
            >Objectives</span
          >
          <span class="font-fell text-xs text-muted-foreground"
            >{{ doneCount }}/{{ visibleObjectives.length }}</span
          >
        </div>
        <div class="p-2 flex flex-col gap-1">
          <div
            v-for="obj in visibleObjectives"
            :key="obj.id"
            class="flex items-start gap-2.5 px-2 py-1.5"
          >
            <span
              class="mt-0.5 shrink-0 h-4 w-4 rounded border flex items-center justify-center"
              :class="
                obj.is_done
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-border'
              "
            >
              <Check v-if="obj.is_done" class="h-2.5 w-2.5" />
            </span>
            <span
              class="font-fell text-sm leading-snug"
              :class="
                obj.is_done
                  ? 'text-muted-foreground line-through'
                  : 'text-foreground'
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
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
            >Rewards</span
          >
        </div>
        <div class="p-3 flex flex-col gap-2">
          <p v-if="quest.rewards" class="font-fell text-sm text-foreground">
            {{ quest.rewards }}
          </p>
        </div>
      </div>

      <!-- Key NPCs -->
      <div
        v-if="linkedNpcRefs.length"
        class="rounded-lg border border-border bg-card overflow-hidden"
      >
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
            >Key NPCs</span
          >
        </div>
        <div class="p-2 flex flex-col gap-1">
          <button
            v-for="ref in linkedNpcRefs"
            :key="ref.id"
            type="button"
            class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors text-left"
            @click="openNpc(ref.ref_id)"
          >
            <User class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span class="font-fell text-sm text-foreground hover:text-primary transition-colors">{{
              npcName(ref.ref_id)
            }}</span>
          </button>
        </div>
      </div>

      <!-- Key Locations -->
      <div
        v-if="linkedLocationRefs.length"
        class="rounded-lg border border-border bg-card overflow-hidden"
      >
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
            >Key Locations</span
          >
        </div>
        <div class="p-2 flex flex-col gap-1">
          <template v-for="ref in linkedLocationRefs" :key="ref.id">
            <button
              v-if="sharedLocationIds.has(ref.ref_id)"
              type="button"
              class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors text-left w-full"
              @click="openLocation(ref.ref_id)"
            >
              <MapPin class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span class="font-fell text-sm text-foreground hover:text-primary transition-colors">{{
                locationName2(ref.ref_id)
              }}</span>
            </button>
            <div
              v-else
              class="flex items-center gap-2 px-2 py-1.5"
            >
              <MapPin class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span class="font-fell text-sm text-foreground">{{
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
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
            >Creatures</span
          >
        </div>
        <div class="p-2 flex flex-col gap-1">
          <div
            v-for="ref in linkedMonsterRefs"
            :key="ref.id"
            class="flex items-center gap-2 px-2 py-1.5"
          >
            <Skull class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span class="font-fell text-sm text-foreground">{{
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
  <Teleport to="body">
    <div
      v-if="selectedNpc"
      class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      @click.self="selectedNpc = null"
    >
      <div class="bg-card rounded-xl border border-border w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div class="relative shrink-0">
          <div v-if="selectedNpc.player_visible_fields?.includes('portrait') && getNpcDisplayPortrait(selectedNpc)" class="w-full h-72 overflow-hidden">
            <FocalImage
              :src="getNpcDisplayPortrait(selectedNpc)!"
              :alt="getNpcDisplayName(selectedNpc)"
              format="portrait"
              :focal-point="getNpcDisplayFocalPoint(selectedNpc)"
              :lightbox="true"
            />
          </div>
          <button
            class="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white hover:bg-black/70 transition-colors"
            @click="selectedNpc = null"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="p-4 overflow-y-auto space-y-4">
          <div>
            <h2 class="font-cinzel text-lg font-bold text-foreground">
              {{ selectedNpc.player_visible_fields?.includes('name') ? getNpcDisplayName(selectedNpc) : '???' }}
            </h2>
            <p v-if="selectedNpc.player_visible_fields?.includes('race') && selectedNpc.race"
              class="mt-1 font-fell text-sm text-muted-foreground italic">{{ selectedNpc.race }}</p>
            <p v-if="selectedNpc.player_visible_fields?.includes('occupation') && selectedNpc.occupation"
              class="font-fell text-sm text-muted-foreground">{{ selectedNpc.occupation }}</p>
          </div>
          <PlayerNotesWidget entity-type="npc" :entity-id="selectedNpc.id" placeholder="Your observations about this character…" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  ChevronLeft,
  ScrollText,
  User,
  MapPin,
  Check,
  Skull,
  X,
} from "lucide-vue-next";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";
import {
  useQuest,
  useQuestObjectives,
  useQuestRefs,
} from "@/composables/useQuests";
import { useMarkRead } from "@/composables/useReadItems";
import { useNpcs } from "@/composables/useNpcs";
import { useSharedLocations } from "@/composables/useLocations";
import { useMonsters } from "@/composables/useMonsters";
import { getNpcDisplayName, getNpcDisplayPortrait, getNpcDisplayFocalPoint } from "@/lib/npcDisplay";
import { QUEST_STATUS_LABELS, QUEST_STATUS_COLORS } from "@/types/quest.types";
import type { Npc } from "@/types/npc.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FocalImage from "@/components/common/FocalImage.vue";

const route = useRoute();
const router = useRouter();
const questId = computed(() => route.params.id as string);

const { data: quest, isLoading } = useQuest(questId);
const { mutate: markRead } = useMarkRead();

watch(quest, (q) => {
  if (q?.id) markRead({ entityType: "quest", entityId: q.id });
}, { immediate: true });
const { data: objectives } = useQuestObjectives(questId);
const { data: questRefs } = useQuestRefs(questId);

const { data: npcs } = useNpcs();
const { data: locations } = useSharedLocations();
const { data: allMonsters } = useMonsters();

// NPC lightbox
const selectedNpc = ref<Npc | null>(null);

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
  () => visibleObjectives.value.filter((o) => o.is_done).length,
);

// Name lookups
function npcName(id: string) {
  return (npcs.value ?? []).find((n) => n.id === id)?.name ?? id;
}
function locationName2(id: string) {
  return (locations.value ?? []).find((l) => l.id === id)?.name ?? id;
}
function monsterName(id: string) {
  return (allMonsters.value ?? []).find((m) => m.id === id)?.name ?? id;
}
</script>
