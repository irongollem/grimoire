<template>
  <div class="flex flex-col gap-5">
    <!-- Action bar: Edit + Delete. Matches the NPC / Location / Monster
         sheet convention (#168). -->
    <div class="flex flex-wrap items-center justify-end gap-2">
      <span
        class="text-label rounded px-2 py-0.5 font-semibold text-white"
        :style="{ backgroundColor: QUEST_STATUS_COLORS[quest.status] }"
      >{{ QUEST_STATUS_LABELS[quest.status] }}</span>
      <AppButton
        :icon="IconNetwork"
        label="Back to quest"
        variant="subtle"
        @click="openPrimary"
      />
      <AppButton
        :icon="IconDelete"
        label="Delete"
        variant="destructive"
        :disabled="isDeleting"
        @click="onDelete"
      />
      <AppButton
        :icon="IconEdit"
        label="Edit"
        variant="primary"
        @click="router.push({ query: { ...route.query, edit: 'true' } })"
      />
    </div>

    <!-- Summary -->
    <p
      v-if="quest.summary"
      class="font-fell text-base text-foreground leading-snug"
    >{{ quest.summary }}</p>

    <!-- Meta row: giver / location / parent -->
    <div
      v-if="quest.giver_npc_id || quest.location_id || quest.parent_quest_id || quest.tags?.length"
      class="flex flex-wrap items-center gap-2"
    >
      <RouterLink
        v-if="giverNpc"
        :to="`/npcs/${giverNpc.id}`"
        class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 hover:border-primary/50 transition-colors"
      >
        <IconUserRound class="h-3.5 w-3.5 text-muted-foreground" />
        <span class="text-caption text-foreground">{{ giverNpc.name }}</span>
      </RouterLink>
      <RouterLink
        v-if="questLocation"
        :to="`/locations/${questLocation.id}`"
        class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 hover:border-primary/50 transition-colors"
      >
        <IconLocation class="h-3.5 w-3.5 text-muted-foreground" />
        <span class="text-caption text-foreground">{{ questLocation.name }}</span>
      </RouterLink>
      <RouterLink
        v-if="parentQuest"
        :to="`/quests/${parentQuest.id}`"
        class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 hover:border-primary/50 transition-colors"
      >
        <IconScrollText class="h-3.5 w-3.5 text-muted-foreground" />
        <span class="text-caption text-foreground">Part of: {{ parentQuest.title }}</span>
      </RouterLink>
      <span
        v-for="tag in quest.tags"
        :key="tag"
        class="text-label bg-muted/60 text-muted-foreground rounded px-2 py-0.5"
      >{{ tag }}</span>
    </div>

    <!-- Description -->
    <section v-if="hasDescription" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Description</h2>
      <RichTextViewer :content="quest.description" />
    </section>

    <!-- DM Notes -->
    <section v-if="hasNotes" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-muted-foreground">DM Notes</h2>
      <RichTextViewer :content="quest.notes" />
    </section>

    <!-- Objectives — interactive. IconCheck/uncheck + per-objective visibility
         are running-state toggles; the DM uses them in-session without
         flipping to edit mode. Creating / renaming objectives stays in
         the editor. -->
    <section v-if="objectives?.length" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Objectives
        <span class="font-fell font-normal text-muted-foreground">({{ doneCount }}/{{ objectives.length }})</span>
      </h2>
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="p-2 flex flex-col gap-1">
          <div
            v-for="obj in objectives"
            :key="obj.id"
            class="flex items-start gap-2 group rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
          >
            <button
              type="button"
              class="mt-0.5 shrink-0 h-4 w-4 rounded border flex items-center justify-center transition-colors"
              :class="obj.is_done
                ? 'bg-primary border-primary text-primary-foreground'
                : 'border-border hover:border-primary'"
              @click="toggleObjective(obj)"
            >
              <IconCheck v-if="obj.is_done" class="h-2.5 w-2.5" />
            </button>
            <span
              class="text-body flex-1 leading-snug transition-colors"
              :class="obj.is_done ? 'text-muted-foreground line-through' : 'text-foreground'"
            >{{ obj.description }}</span>
            <button
              type="button"
              :title="obj.is_player_visible ? 'Visible to players — click to hide' : 'Hidden — click to reveal'"
              class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              :class="obj.is_player_visible ? 'text-elven-green' : 'text-muted-foreground hover:text-foreground'"
              @click="toggleObjectiveVisibility(obj)"
            >
              <IconReveal v-if="obj.is_player_visible" class="h-3.5 w-3.5" />
              <IconHide v-else class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Rewards: currency + item cards (read-only). Full loot management
         stays in the editor (EncounterLoot-style editor). -->
    <section v-if="hasRewards" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Rewards</h2>

      <p
        v-if="rewardCoinsText"
        class="text-body text-foreground"
      >{{ rewardCoinsText }}</p>

      <div v-if="rewardItems.length" class="flex flex-wrap gap-2">
        <RouterLink
          v-for="it in rewardItems"
          :key="it.id"
          :to="`/vault/${it.id}`"
          class="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 hover:border-primary/50 transition-colors"
        >
          <IconPackage class="h-3.5 w-3.5 text-muted-foreground" />
          <span class="text-caption text-foreground">{{ it.name }}</span>
        </RouterLink>
      </div>

      <p
        v-if="quest.rewards"
        class="text-body text-muted-foreground italic"
      >{{ quest.rewards }}</p>
    </section>

    <!-- Linked entities (via quest_refs), grouped by type. -->
    <section v-if="linkedEncounters.length" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Encounters
        <span class="font-fell font-normal text-muted-foreground">({{ linkedEncounters.length }})</span>
      </h2>
      <div class="flex flex-col gap-2">
        <RouterLink
          v-for="enc in linkedEncounters"
          :key="enc.id"
          :to="`/encounters/${enc.id}`"
          class="group flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors px-4 py-3"
        >
          <IconEncounter class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span class="flex-1 font-cinzel text-sm font-semibold text-foreground truncate">{{ enc.name }}</span>
          <span v-if="enc.is_finished" class="text-label text-muted-foreground">Done</span>
          <IconChevronRight class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
        </RouterLink>
      </div>
    </section>

    <section v-if="linkedNpcs.length" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Key NPCs
        <span class="font-fell font-normal text-muted-foreground">({{ linkedNpcs.length }})</span>
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <RouterLink
          v-for="npc in linkedNpcs"
          :key="npc.id"
          :to="`/npcs/${npc.id}`"
          class="group flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors p-3"
        >
          <IconUserRound class="h-4 w-4 text-muted-foreground shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ npc.name }}</p>
            <p
              v-if="npc.occupation || npc.race"
              class="text-caption text-muted-foreground italic truncate"
            >{{ [npc.race, npc.occupation].filter(Boolean).join(" · ") }}</p>
          </div>
        </RouterLink>
      </div>
    </section>

    <section v-if="linkedLocations.length" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Key Locations
        <span class="font-fell font-normal text-muted-foreground">({{ linkedLocations.length }})</span>
      </h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          v-for="loc in linkedLocations"
          :key="loc.id"
          :to="`/locations/${loc.id}`"
          class="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 hover:border-primary/50 transition-colors"
        >
          <IconLocation class="h-3.5 w-3.5 text-muted-foreground" />
          <span class="text-caption text-foreground truncate max-w-48">{{ loc.name }}</span>
        </RouterLink>
      </div>
    </section>

    <section v-if="linkedMonsters.length" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Creatures
        <span class="font-fell font-normal text-muted-foreground">({{ linkedMonsters.length }})</span>
      </h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          v-for="m in linkedMonsters"
          :key="m.id"
          :to="`/monsters/${m.id}`"
          class="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 hover:border-primary/50 transition-colors"
        >
          <IconMonster class="h-3.5 w-3.5 text-muted-foreground" />
          <span class="text-caption text-foreground truncate max-w-48">{{ m.name }}</span>
        </RouterLink>
      </div>
    </section>

    <section v-if="triggers?.length" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-muted-foreground flex items-center gap-1.5">
        <IconLightning class="h-3.5 w-3.5" />
        Consequences
        <span class="font-fell font-normal">({{ triggers.length }})</span>
      </h2>
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="p-2 flex flex-col gap-1">
          <div
            v-for="trig in triggers"
            :key="trig.id"
            class="flex items-start gap-2 px-2 py-1.5"
          >
            <IconLightning class="h-3 w-3 text-primary shrink-0 mt-0.5" />
            <p class="text-caption text-muted-foreground leading-snug">
              <span class="font-semibold text-foreground">{{ trig.trigger_type === 'quest_complete' ? 'Quest complete' : 'Objective done' }}</span>
              {{ trig.offset_days > 0 ? ` + ${trig.offset_days} days` : '' }} →
              {{ triggerActionSummary(trig) }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <section v-if="subQuests?.length" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Sub-quests
        <span class="font-fell font-normal text-muted-foreground">({{ subQuests.length }})</span>
      </h2>
      <div class="flex flex-col gap-2">
        <RouterLink
          v-for="sub in subQuests"
          :key="sub.id"
          :to="`/quests/${sub.id}`"
          class="group flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors px-4 py-3"
        >
          <IconScrollText class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span class="flex-1 font-cinzel text-sm font-semibold text-foreground truncate">{{ sub.title }}</span>
          <span
            class="text-label rounded px-1.5 py-0.5 text-white"
            :style="{ backgroundColor: QUEST_STATUS_COLORS[sub.status] }"
          >{{ QUEST_STATUS_LABELS[sub.status] }}</span>
          <IconChevronRight class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter, RouterLink } from "vue-router";
import { IconCheck, IconChevronRight, IconDelete, IconEdit, IconEncounter, IconHide, IconLightning, IconLocation, IconMonster, IconNetwork, IconPackage, IconReveal, IconScrollText, IconUserRound } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import {
  useQuestObjectives,
  useUpdateObjective,
  useQuestRefs,
  useSubQuests,
  useQuests,
  useDeleteQuest,
  useQuestTriggers,
  scheduleQuestTriggers,
} from "@/composables/useQuests";
import { useCampaignStore } from "@/stores/campaign";
import { useNpcs } from "@/composables/useNpcs";
import { useAllLocations } from "@/composables/useLocations";
import { useMonsters } from "@/composables/useMonsters";
import { useItems } from "@/composables/useItems";
import { useEncounters } from "@/composables/useEncounters";
import {
  QUEST_STATUS_LABELS,
  QUEST_STATUS_COLORS,
  type Quest,
  type QuestObjective,
} from "@/types/quest.types";
import { formatCoinParts } from "@/rules/currency";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import AppButton from "@/components/common/AppButton.vue";

const props = defineProps<{ quest: Quest }>();
const route  = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const campaign = useCampaignStore();

function openPrimary() {
  const { mode: _mode, ...query } = route.query;
  void router.push({ query });
}

const questId = computed(() => props.quest.id);
const { data: triggers } = useQuestTriggers(questId);

// ── Linked data ─────────────────────────────────────────────────────────────
const { data: npcs }       = useNpcs();
const { data: allLocs }    = useAllLocations();
// linkedMonsters resolves the quest's stored monster reference ids, so a
// monster scoped elsewhere later must still surface here.
const { data: allMonsters } = useMonsters(() => ({ includeAllScopes: true }));
const { data: allItems }   = useItems();
const { data: allEncs }    = useEncounters();
const { data: allQuests }  = useQuests();

const giverNpc      = computed(() => (npcs.value ?? []).find((n) => n.id === props.quest.giver_npc_id) ?? null);
const questLocation = computed(() => (allLocs.value ?? []).find((l) => l.id === props.quest.location_id) ?? null);
const parentQuest   = computed(() => (allQuests.value ?? []).find((q) => q.id === props.quest.parent_quest_id) ?? null);

// ── Rewards ─────────────────────────────────────────────────────────────────
const rewardItems = computed(() =>
  (props.quest.reward_item_ids ?? [])
    .map((id) => (allItems.value ?? []).find((it) => it.id === id))
    .filter((it): it is NonNullable<typeof it> => !!it),
);

const rewardCoinsText = computed(() => {
  const { reward_pp, reward_gp, reward_ep, reward_sp, reward_cp } = props.quest;
  const parts = formatCoinParts(reward_pp, reward_gp, reward_ep, reward_sp, reward_cp);
  return parts.length ? parts.join(" ") : "";
});

const hasRewards = computed(() =>
  !!rewardCoinsText.value || rewardItems.value.length > 0 || !!props.quest.rewards?.trim(),
);

// ── Objectives (interactive in view mode) ───────────────────────────────────
const { data: objectives } = useQuestObjectives(questId);
const { mutateAsync: updateObjective } = useUpdateObjective();

const doneCount = computed(
  () => (objectives.value ?? []).filter((o) => o.is_done).length,
);

async function toggleObjective(obj: QuestObjective) {
  const becomingDone = !obj.is_done;
  await updateObjective({ id: obj.id, questId: obj.quest_id, update: { is_done: becomingDone } });
  if (becomingDone && campaign.activeCampaignId) {
    void scheduleQuestTriggers(
      obj.quest_id, "objective_done", obj.id,
      { year: campaign.todayYear, month: campaign.todayMonth, day: campaign.todayDay },
      campaign.activeCampaignId,
    );
  }
}

async function toggleObjectiveVisibility(obj: QuestObjective) {
  await updateObjective({ id: obj.id, questId: obj.quest_id, update: { is_player_visible: !obj.is_player_visible } });
}

// ── Refs grouped by type ────────────────────────────────────────────────────
const { data: refs } = useQuestRefs(questId);
const { data: subQuests } = useSubQuests(questId);

function refIds(type: "npc" | "location" | "monster" | "encounter"): string[] {
  return (refs.value ?? []).filter((r) => r.ref_type === type).map((r) => r.ref_id);
}

const linkedNpcs = computed(() => {
  const ids = new Set(refIds("npc"));
  return (npcs.value ?? []).filter((n) => ids.has(n.id));
});
const linkedLocations = computed(() => {
  const ids = new Set(refIds("location"));
  return (allLocs.value ?? []).filter((l) => ids.has(l.id));
});
const linkedMonsters = computed(() => {
  const ids = new Set(refIds("monster"));
  return (allMonsters.value ?? []).filter((m) => ids.has(m.id));
});
const linkedEncounters = computed(() => {
  const ids = new Set(refIds("encounter"));
  return (allEncs.value ?? []).filter((e) => ids.has(e.id));
});

// ── Tiptap emptiness guard (shared with LocationSheet — same pattern) ──────
function tiptapHasContent(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const doc = JSON.parse(raw);
    const texts: string[] = [];
    function walk(n: { text?: string; content?: unknown[] }) {
      if (n.text) texts.push(n.text);
      (n.content as typeof n[] | undefined)?.forEach(walk);
    }
    walk(doc);
    return texts.join("").trim().length > 0;
  } catch {
    return String(raw).trim().length > 0;
  }
}
const hasDescription = computed(() => tiptapHasContent(props.quest.description));
const hasNotes       = computed(() => tiptapHasContent(props.quest.notes));

function triggerActionSummary(trig: { action_type: string; action_payload: unknown }): string {
  if (trig.action_type === "create_calendar_event") {
    const p = trig.action_payload as { title?: string };
    return `Calendar event: "${p.title ?? ""}"`;
  }
  const p = trig.action_payload as { message?: string };
  return `Broadcast: "${p.message ?? ""}"`;
}

// ── Delete ──────────────────────────────────────────────────────────────────
const { mutateAsync: deleteQuest } = useDeleteQuest();
const isDeleting = ref(false);

async function onDelete() {
  if (!(await confirm(`Delete "${props.quest.title}"? This cannot be undone.`))) return;
  isDeleting.value = true;
  try {
    router.push("/quests");
    await deleteQuest(props.quest.id);
  } finally {
    isDeleting.value = false;
  }
}
</script>
