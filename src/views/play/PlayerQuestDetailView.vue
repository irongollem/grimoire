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

    <div v-else-if="!quest || !quest.is_player_visible" class="text-center py-16 space-y-3">
      <ScrollText class="h-10 w-10 text-muted-foreground/30 mx-auto" />
      <p class="font-cinzel text-sm text-muted-foreground">Quest not found.</p>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="flex flex-wrap items-start justify-between gap-3">
        <h2 class="font-cinzel text-xl font-bold text-foreground">{{ quest.title }}</h2>
        <span
          class="font-cinzel text-[10px] px-2.5 py-1 rounded-full tracking-wider"
          :style="{ color: QUEST_STATUS_COLORS[quest.status], borderColor: QUEST_STATUS_COLORS[quest.status] + '50' }"
          style="border-width: 1px;"
        >
          {{ QUEST_STATUS_LABELS[quest.status] }}
        </span>
      </div>

      <!-- Meta row -->
      <div class="flex flex-wrap gap-x-4 gap-y-1.5 text-sm font-fell text-muted-foreground">
        <span v-if="giverName" class="flex items-center gap-1.5">
          <User class="h-3.5 w-3.5 shrink-0" />
          {{ giverName }}
        </span>
        <span v-if="primaryLocationName" class="flex items-center gap-1.5">
          <MapPin class="h-3.5 w-3.5 shrink-0" />
          {{ primaryLocationName }}
        </span>
        <span v-if="quest.started_at" class="flex items-center gap-1.5">
          <Calendar class="h-3.5 w-3.5 shrink-0" />
          Started {{ quest.started_at.slice(0, 10) }}
        </span>
        <span v-if="quest.resolved_at" class="flex items-center gap-1.5">
          <CheckCircle class="h-3.5 w-3.5 shrink-0" />
          Resolved {{ quest.resolved_at.slice(0, 10) }}
        </span>
      </div>

      <!-- Summary -->
      <p v-if="quest.summary" class="font-fell text-foreground leading-relaxed">{{ quest.summary }}</p>

      <!-- Objectives -->
      <div v-if="objectives?.length" class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Objectives</span>
          <span class="font-fell text-xs text-muted-foreground">{{ doneCount }}/{{ objectives.length }}</span>
        </div>
        <div class="p-2 flex flex-col gap-1">
          <div
            v-for="obj in objectives"
            :key="obj.id"
            class="flex items-start gap-2.5 px-2 py-1.5"
          >
            <span
              class="mt-0.5 shrink-0 h-4 w-4 rounded border flex items-center justify-center"
              :class="obj.is_done ? 'bg-primary border-primary text-primary-foreground' : 'border-border'"
            >
              <Check v-if="obj.is_done" class="h-2.5 w-2.5" />
            </span>
            <span
              class="font-fell text-sm leading-snug"
              :class="obj.is_done ? 'text-muted-foreground line-through' : 'text-foreground'"
            >
              {{ obj.description }}
            </span>
          </div>
        </div>
      </div>

      <!-- Rewards -->
      <div v-if="quest.rewards || rewardItems.length" class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Rewards</span>
        </div>
        <div class="p-3 flex flex-col gap-2">
          <p v-if="quest.rewards" class="font-fell text-sm text-foreground">{{ quest.rewards }}</p>
          <div
            v-for="ref in rewardItems"
            :key="ref.id"
            class="flex items-center gap-2"
          >
            <Package class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span class="font-fell text-sm text-foreground">{{ itemName(ref.ref_id) }}</span>
          </div>
        </div>
      </div>

      <!-- Key NPCs -->
      <div v-if="linkedNpcRefs.length" class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Key NPCs</span>
        </div>
        <div class="p-2 flex flex-col gap-1">
          <div v-for="ref in linkedNpcRefs" :key="ref.id" class="flex items-center gap-2 px-2 py-1.5">
            <User class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span class="font-fell text-sm text-foreground">{{ npcName(ref.ref_id) }}</span>
          </div>
        </div>
      </div>

      <!-- Key Locations -->
      <div v-if="linkedLocationRefs.length" class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Key Locations</span>
        </div>
        <div class="p-2 flex flex-col gap-1">
          <div v-for="ref in linkedLocationRefs" :key="ref.id" class="flex items-center gap-2 px-2 py-1.5">
            <MapPin class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span class="font-fell text-sm text-foreground">{{ locationName2(ref.ref_id) }}</span>
          </div>
        </div>
      </div>

      <!-- Creatures -->
      <div v-if="linkedMonsterRefs.length" class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Creatures</span>
        </div>
        <div class="p-2 flex flex-col gap-1">
          <div v-for="ref in linkedMonsterRefs" :key="ref.id" class="flex items-center gap-2 px-2 py-1.5">
            <Skull class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span class="font-fell text-sm text-foreground">{{ monsterName(ref.ref_id) }}</span>
          </div>
        </div>
      </div>

      <!-- Linked Encounters -->
      <div v-if="linkedEncounterRefs.length" class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Encounters</span>
        </div>
        <div class="p-2 flex flex-col gap-1">
          <div v-for="ref in linkedEncounterRefs" :key="ref.id" class="flex items-center gap-2 px-2 py-1.5">
            <Swords class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span class="font-fell text-sm text-foreground">{{ encounterName(ref.ref_id) }}</span>
          </div>
        </div>
      </div>

      <!-- My Note -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">My Note</span>
          <button
            type="button"
            :title="noteIsPrivate ? 'Private — only you can see this' : 'Shared — visible to everyone in the campaign'"
            class="inline-flex items-center gap-1.5 font-cinzel text-[10px] font-semibold tracking-wider transition-colors px-2 py-0.5 rounded border"
            :class="noteIsPrivate
              ? 'text-muted-foreground border-border hover:border-foreground/30'
              : 'text-elven-green border-elven-green/30 bg-elven-green/10'"
            @click="togglePrivacy"
          >
            <Lock v-if="noteIsPrivate" class="h-3 w-3" />
            <Eye v-else class="h-3 w-3" />
            {{ noteIsPrivate ? 'Private' : 'Shared' }}
          </button>
        </div>
        <div class="p-3">
          <textarea
            v-model="noteContent"
            placeholder="Jot down your thoughts, clues, suspicions…"
            rows="4"
            class="w-full bg-transparent border-none outline-none resize-none font-fell text-sm text-foreground placeholder:text-muted-foreground/60 leading-relaxed"
            @blur="saveNote"
          />
          <div class="flex items-center justify-between mt-1">
            <span v-if="noteSaved" class="font-cinzel text-[10px] text-muted-foreground/60 tracking-wider">Saved</span>
            <span v-else class="font-cinzel text-[10px] text-muted-foreground/40 tracking-wider">Unsaved</span>
            <button
              v-if="myNote"
              type="button"
              class="font-cinzel text-[10px] text-muted-foreground/50 hover:text-destructive tracking-wider transition-colors"
              @click="clearNote"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <!-- Party Notes (shared by others) -->
      <div v-if="partyNotes.length" class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
            Party Notes
            <span class="font-fell font-normal">({{ partyNotes.length }})</span>
          </span>
        </div>
        <div class="divide-y divide-border">
          <div v-for="note in partyNotes" :key="note.id" class="px-3 py-2.5">
            <p class="font-fell text-sm text-foreground whitespace-pre-wrap leading-relaxed">{{ note.content }}</p>
            <p class="font-cinzel text-[10px] text-muted-foreground/50 tracking-wider mt-1">
              {{ note.updated_at.slice(0, 10) }}
            </p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import {
  ChevronLeft, ScrollText, User, MapPin, Calendar, CheckCircle,
  Check, Package, Swords, Skull, Lock, Eye,
} from "lucide-vue-next";
import {
  useQuest, useQuestObjectives, useQuestRefs,
  useMyQuestNote, useSharedQuestNotes, useUpsertQuestPlayerNote, useDeleteQuestPlayerNote,
} from "@/composables/useQuests";
import { useCampaignStore } from "@/stores/campaign";
import { useNpcs } from "@/composables/useNpcs";
import { useAllLocations } from "@/composables/useLocations";
import { useMonsters } from "@/composables/useMonsters";
import { useItems } from "@/composables/useItems";
import { useEncounters } from "@/composables/useEncounters";
import { QUEST_STATUS_LABELS, QUEST_STATUS_COLORS } from "@/types/quest.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";

const route  = useRoute();
const questId = computed(() => route.params.id as string);

const { data: quest, isLoading } = useQuest(questId);
const { data: objectives }       = useQuestObjectives(questId);
const { data: questRefs }        = useQuestRefs(questId);

const { data: npcs }        = useNpcs();
const { data: locations }   = useAllLocations();
const { data: allMonsters } = useMonsters();
const { data: allItems }    = useItems();
const { data: allEncounters } = useEncounters();

// Giver / primary location names
const giverName           = computed(() => (npcs.value ?? []).find((n) => n.id === quest.value?.giver_npc_id)?.name ?? null);
const primaryLocationName = computed(() => (locations.value ?? []).find((l) => l.id === quest.value?.location_id)?.name ?? null);

// Refs grouped by type
const rewardItems        = computed(() => (questRefs.value ?? []).filter((r) => r.ref_type === "item"));
const linkedNpcRefs      = computed(() => (questRefs.value ?? []).filter((r) => r.ref_type === "npc"));
const linkedLocationRefs = computed(() => (questRefs.value ?? []).filter((r) => r.ref_type === "location"));
const linkedMonsterRefs  = computed(() => (questRefs.value ?? []).filter((r) => r.ref_type === "monster"));
const linkedEncounterRefs = computed(() => (questRefs.value ?? []).filter((r) => r.ref_type === "encounter"));

const doneCount = computed(() => (objectives.value ?? []).filter((o) => o.is_done).length);

// ── Player notes ───────────────────────────────────────────────────────────────
const campaign = useCampaignStore();
const { data: myNote }     = useMyQuestNote(questId);
const { data: sharedNotes } = useSharedQuestNotes(questId);
const { mutateAsync: upsertNote } = useUpsertQuestPlayerNote();
const { mutateAsync: deleteNote } = useDeleteQuestPlayerNote();

// Party notes = shared notes that aren't mine (avoid duplicate)
const partyNotes = computed(() =>
  (sharedNotes.value ?? []).filter((n) => n.id !== myNote.value?.id),
);

const noteContent  = ref("");
const noteIsPrivate = ref(true);
const noteSaved    = ref(true);

// Sync from DB when loaded
watch(myNote, (note) => {
  if (note) {
    noteContent.value  = note.content;
    noteIsPrivate.value = note.is_private;
  }
}, { immediate: true });

// Mark unsaved on content change
watch(noteContent, () => { noteSaved.value = false; });

async function saveNote() {
  if (!quest.value || !campaign.activeCampaignId) return;
  if (!noteContent.value.trim() && !myNote.value) return; // nothing to save
  await upsertNote({
    quest_id:    questId.value,
    campaign_id: campaign.activeCampaignId,
    content:     noteContent.value,
    is_private:  noteIsPrivate.value,
  });
  noteSaved.value = true;
}

async function togglePrivacy() {
  noteIsPrivate.value = !noteIsPrivate.value;
  await saveNote();
}

async function clearNote() {
  if (!myNote.value) return;
  if (!confirm("Delete your note for this quest?")) return;
  await deleteNote({ id: myNote.value.id, questId: questId.value });
  noteContent.value = "";
  noteSaved.value   = true;
}

// Name lookups
function itemName(id: string)      { return (allItems.value ?? []).find((i) => i.id === id)?.name ?? id; }
function npcName(id: string)       { return (npcs.value ?? []).find((n) => n.id === id)?.name ?? id; }
function locationName2(id: string) { return (locations.value ?? []).find((l) => l.id === id)?.name ?? id; }
function monsterName(id: string)   { return (allMonsters.value ?? []).find((m) => m.id === id)?.name ?? id; }
function encounterName(id: string) { return (allEncounters.value ?? []).find((e) => e.id === id)?.name ?? id; }
</script>
