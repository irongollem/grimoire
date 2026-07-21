<template>
  <PageHeader title="Campaign Dashboard" description="Your realm at a glance">
    <div class="flex flex-col gap-4">

      <!-- Live encounter banner -->
      <RouterLink
        v-if="anyRunning && firstRunning"
        :to="`/encounters/${firstRunning.encounter_id}/run`"
        class="flex items-center gap-3 rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-3 hover:bg-green-500/15 transition-colors"
      >
        <IconLive class="h-4 w-4 text-green-400 animate-pulse shrink-0" />
        <span class="font-cinzel text-sm font-semibold text-green-400 tracking-wide">Encounter in progress</span>
        <span class="font-fell text-xs text-green-300/70 italic flex-1">Round {{ firstRunning.current_round }}</span>
        <span class="text-label text-green-400">Resume →</span>
      </RouterLink>

      <!-- ── Party — full width, 1/2/3 col responsive ──────────────────── -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
          <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">Party</h2>
          <div class="flex items-center gap-3">
            <RouterLink to="/downtime" class="text-label font-semibold text-primary hover:opacity-80 transition-opacity">
              Grant downtime →
            </RouterLink>
            <RouterLink to="/party" class="text-label font-semibold text-primary hover:opacity-80 transition-opacity">
              Full tracker →
            </RouterLink>
          </div>
        </div>
        <div v-if="partyLoading" class="flex justify-center py-6">
          <LoadingSpinner />
        </div>
        <div v-else-if="!party?.length" class="px-4 py-6 text-center">
          <IconNavParty class="h-6 w-6 mx-auto mb-2 text-muted-foreground/30" />
          <p class="font-fell text-sm text-muted-foreground italic">No party members yet.</p>
          <RouterLink to="/party" class="mt-2 inline-block font-cinzel text-xs text-primary tracking-wider hover:opacity-80">+ Add Members</RouterLink>
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-border">
          <div v-for="member in party" :key="member.id" class="bg-card px-3 py-2.5 flex flex-col gap-1.5">
            <!-- Name row -->
            <div class="flex items-center gap-2">
              <div class="relative h-8 w-8 shrink-0">
                <div class="h-8 w-8 rounded-full overflow-hidden bg-secondary">
                  <FocalImage :src="member.portrait_url" :focal-point="member.portrait_focal_point ?? null" format="token" :alt="member.name" placeholder="/assets/placeholders/character.webp" />
                </div>
                <span
                  class="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card"
                  :class="partyMemberOnline(member.id) ? 'bg-green-500' : 'bg-muted-foreground/30'"
                />
              </div>
              <div class="min-w-0 flex-1">
                <p class="font-cinzel text-sm font-semibold text-foreground truncate leading-tight">{{ member.name }}</p>
                <p class="font-fell text-[0.6875rem] text-muted-foreground italic truncate leading-tight">{{ memberSubtitle(member) }}</p>
              </div>
              <div class="text-right shrink-0">
                <span class="font-cinzel text-sm font-bold" :class="hpColor(member.current_hp, member.max_hp)">{{ member.current_hp }}</span>
                <span class="font-fell text-[0.6875rem] text-muted-foreground">/{{ member.max_hp }}</span>
              </div>
            </div>
            <!-- HP bar -->
            <div class="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                class="h-full rounded-full transition-all"
                :class="hpBarColor(member.current_hp, member.max_hp)"
                :style="{ width: `${Math.max(0, Math.min(100, (member.current_hp / member.max_hp) * 100))}%` }"
              />
            </div>
            <!-- Quick stats -->
            <div class="flex items-center gap-1 flex-wrap">
              <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-label text-muted-foreground" title="Armour Class">AC {{ member.ac }}</span>
              <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-label text-muted-foreground" title="Passive Perception">
                <IconReveal class="h-2.5 w-2.5" />{{ passivePerception(member) }}
              </span>
              <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-label text-muted-foreground" title="Passive Insight">
                <IconMind class="h-2.5 w-2.5" />{{ passiveInsight(member) }}
              </span>
              <span v-if="member.inspiration" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gold-500/20 border border-gold-500/40 text-label text-gold-500">★ Insp.</span>
            </div>
            <!-- Conditions + Curses -->
            <div v-if="member.conditions?.length || member.curses?.length" class="flex flex-wrap gap-1">
              <span v-for="cond in member.conditions" :key="cond" class="px-1.5 py-0.5 rounded bg-destructive/10 border border-destructive/20 text-label text-destructive">{{ cond }}</span>
              <span v-for="curse in member.curses" :key="curse" class="px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/30 text-label text-violet-400">Cursed: {{ curse }}</span>
            </div>
            <!-- DM tracker buttons -->
            <DmTrackerButtons
              v-if="authStore.isDM && campaignStore.activeCampaignId"
              :party-member-id="member.id"
              :campaign-id="campaignStore.activeCampaignId"
            />
          </div>
        </div>
      </div>

      <!-- ── Main 3-col row ─────────────────────────────────────────────── -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <!-- Active Quests (compact) -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
            <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">Active Quests</h2>
            <RouterLink to="/quests" class="text-label font-semibold text-primary hover:opacity-80">View all →</RouterLink>
          </div>
          <div v-if="questsLoading" class="flex justify-center py-6"><LoadingSpinner /></div>
          <div v-else-if="!activeQuests.length" class="px-4 py-6 text-center">
            <p class="font-fell text-sm text-muted-foreground italic">No active quests.</p>
            <RouterLink to="/quests/new" class="mt-1 inline-block font-cinzel text-xs text-primary tracking-wider">+ New Quest</RouterLink>
          </div>
          <div v-else class="divide-y divide-border">
            <RouterLink
              v-for="quest in activeQuests.slice(0, 6)"
              :key="quest.id"
              :to="`/quests/${quest.id}`"
              class="flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/30 transition-colors group"
            >
              <div class="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="font-cinzel text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">{{ quest.title || "Untitled Quest" }}</p>
                <p v-if="giverName(quest)" class="font-fell text-[0.6875rem] text-muted-foreground italic">Given by {{ giverName(quest) }}</p>
              </div>
            </RouterLink>
            <div v-if="activeQuests.length > 6" class="px-4 py-2 text-center">
              <RouterLink to="/quests" class="text-label text-muted-foreground hover:text-primary transition-colors">
                + {{ activeQuests.length - 6 }} more →
              </RouterLink>
            </div>
          </div>
        </div>

        <!-- Session Status: Game Day + Location -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-4 py-2.5 border-b border-border bg-muted/20">
            <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">Session</h2>
          </div>
          <div class="px-4 py-3 flex flex-col gap-4">

            <!-- Game Day -->
            <div class="flex flex-col gap-1.5">
              <p class="font-cinzel text-2xs text-muted-foreground tracking-widest uppercase">Game Day</p>
              <template v-if="!editingDate">
                <p class="font-cinzel text-base font-semibold text-foreground">{{ todayFormatted }}</p>
                <div class="flex items-center gap-1.5">
                  <button
                    class="px-2.5 py-1 rounded border border-border font-cinzel text-2xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors disabled:opacity-40"
                    :disabled="setToday.isPending.value"
                    @click="advanceDay(-1)"
                  >− Day</button>
                  <button
                    class="px-2.5 py-1 rounded border border-border font-cinzel text-2xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors disabled:opacity-40"
                    :disabled="setToday.isPending.value"
                    @click="advanceDay(1)"
                  >+ Day</button>
                  <button
                    class="ml-auto font-cinzel text-2xs text-primary hover:opacity-70 transition-opacity"
                    @click="openDateEdit"
                  >Edit…</button>
                </div>
              </template>
              <template v-else>
                <div class="flex items-center gap-1">
                  <input
                    v-model.number="dateForm.day"
                    type="number" min="1" :max="maxDayInSelectedMonth"
                    class="w-14 rounded border border-border bg-background px-2 py-1 font-cinzel text-sm text-center text-foreground focus:outline-none focus:border-primary/70"
                  />
                  <select
                    v-model.number="dateForm.month"
                    class="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1 font-cinzel text-sm text-foreground focus:outline-none focus:border-primary/70"
                  >
                    <option v-for="(m, i) in calendarMonths" :key="i" :value="i + 1">{{ m.name }}</option>
                  </select>
                  <input
                    v-model.number="dateForm.year"
                    type="number"
                    class="w-20 rounded border border-border bg-background px-2 py-1 font-cinzel text-sm text-center text-foreground focus:outline-none focus:border-primary/70"
                  />
                </div>
                <div class="flex gap-1.5">
                  <button
                    class="flex-1 rounded border border-primary/50 bg-primary/10 px-2 py-1 text-label text-primary hover:bg-primary/20 transition-colors disabled:opacity-40"
                    :disabled="setToday.isPending.value"
                    @click="saveDate"
                  >Save</button>
                  <button
                    class="px-3 py-1 rounded border border-border font-cinzel text-2xs text-muted-foreground hover:text-foreground transition-colors"
                    @click="editingDate = false"
                  >Cancel</button>
                </div>
              </template>
            </div>

            <div class="border-t border-border" />

            <!-- Current Location -->
            <div class="flex flex-col gap-1.5">
              <p class="font-cinzel text-2xs text-muted-foreground tracking-widest uppercase">Current Location</p>
              <EntityCombobox
                v-model="currentLocationId"
                :options="locationOptions"
                placeholder="Set location…"
              />
              <button
                v-if="authStore.isDM && currentLocationId"
                class="self-start text-label text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                :disabled="syncLocation.isPending.value"
                @click="syncLocationToParty"
              >{{ syncLocation.isPending.value ? 'Syncing…' : 'Sync to party →' }}</button>
            </div>

          </div>
        </div>

        <!-- DM tools: Unidentified + On Hold -->
        <div class="flex flex-col gap-3">
          <div v-if="unidentifiedItems.length" class="rounded-lg border border-amber-500/30 bg-card overflow-hidden">
            <div class="flex items-center gap-2 px-4 py-2.5 border-b border-amber-500/20 bg-amber-500/5">
              <h2 class="font-cinzel text-sm font-bold text-amber-500/90 tracking-wide">Unidentified</h2>
              <span class="font-cinzel text-2xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30">{{ unidentifiedItems.length }}</span>
            </div>
            <div class="divide-y divide-border">
              <div v-for="entry in unidentifiedItems" :key="entry.inv.id" class="flex items-center gap-3 px-4 py-2.5">
                <div class="min-w-0 flex-1">
                  <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ entry.inv.name }}</p>
                  <p class="font-fell text-xs text-muted-foreground italic">{{ entry.carrier ?? "Party stash" }}</p>
                </div>
                <button
                  class="shrink-0 px-2.5 py-1 rounded text-label border border-amber-500/50 text-amber-500 hover:bg-amber-500/10 transition-colors cursor-pointer"
                  @click="identifyItem(entry.inv.id)"
                >Identify</button>
              </div>
            </div>
          </div>

          <div v-if="onHoldQuests.length" class="rounded-lg border border-border bg-card overflow-hidden">
            <div class="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
              <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">
                Rumors <span class="font-fell font-normal text-xs text-muted-foreground">({{ onHoldQuests.length }})</span>
              </h2>
              <RouterLink to="/quests" class="text-label font-semibold text-primary hover:opacity-80">Quest log →</RouterLink>
            </div>
            <div class="flex flex-wrap gap-2 px-4 py-3">
              <RouterLink
                v-for="quest in onHoldQuests"
                :key="quest.id"
                :to="`/quests/${quest.id}`"
                class="inline-flex items-center gap-1.5 rounded border border-border bg-muted/30 px-2 py-1 font-fell text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                {{ quest.title || "Untitled" }}
              </RouterLink>
            </div>
          </div>

          <div v-if="!unidentifiedItems.length && !onHoldQuests.length" class="rounded-lg border border-border bg-card/50 px-4 py-6 text-center">
            <p class="font-fell text-sm text-muted-foreground/50 italic">No pending items.</p>
          </div>
        </div>

      </div>

      <!-- ── Recent NPCs ──────────────────────────────────────────────────── -->
      <div v-if="recentNpcs.length" class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
          <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">Recent NPCs</h2>
          <RouterLink to="/npcs" class="text-label font-semibold text-primary hover:opacity-80">All NPCs →</RouterLink>
        </div>
        <div class="flex gap-4 overflow-x-auto px-4 py-3" style="scrollbar-width: none">
          <RouterLink
            v-for="npc in recentNpcs"
            :key="npc.id"
            :to="`/npcs/${npc.id}`"
            class="flex flex-col items-center gap-1.5 shrink-0 w-14 group"
          >
            <div class="h-12 w-12 rounded-full overflow-hidden bg-secondary ring-2 ring-transparent group-hover:ring-primary/40 transition-all">
              <FocalImage :src="npc.portrait_url" :focal-point="npc.portrait_focal_point ?? null" format="token" :alt="npc.name" placeholder="/assets/placeholders/npc.webp" />
            </div>
            <p class="font-fell text-[0.6875rem] text-center text-muted-foreground group-hover:text-foreground transition-colors line-clamp-2 leading-tight w-full">{{ npc.name }}</p>
          </RouterLink>
        </div>
      </div>

      <!-- ── Pinned Notes ─────────────────────────────────────────────────── -->
      <div v-if="pinnedNotes.length" class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
          <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">Pinned Notes</h2>
          <RouterLink to="/notes" class="text-label font-semibold text-primary hover:opacity-80">All notes →</RouterLink>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border">
          <RouterLink
            v-for="note in pinnedNotes.slice(0, 4)"
            :key="note.id"
            :to="`/notes/${note.id}`"
            class="bg-card flex flex-col gap-1.5 px-4 py-3 hover:bg-muted/30 transition-colors group"
          >
            <div class="flex items-start gap-1.5">
              <IconPin class="h-3 w-3 text-gold-500 mt-0.5 shrink-0" />
              <p class="font-cinzel text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">{{ note.title || "Untitled" }}</p>
            </div>
            <p v-if="note.category" class="font-fell text-[0.6875rem] text-muted-foreground italic capitalize">{{ note.category.replace(/_/g, " ") }}</p>
            <p v-if="notePreview(note)" class="font-fell text-xs text-muted-foreground line-clamp-2">{{ notePreview(note) }}</p>
          </RouterLink>
        </div>
      </div>

      <!-- ── Stats strip ──────────────────────────────────────────────────── -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden border border-border">
        <RouterLink
          v-for="stat in stats"
          :key="stat.label"
          :to="stat.to"
          class="bg-card flex items-center gap-2.5 px-4 py-3 hover:bg-muted/20 transition-colors"
        >
          <component :is="stat.icon" class="h-4 w-4 text-muted-foreground/50 shrink-0" />
          <span class="font-fell text-sm text-muted-foreground">{{ stat.label }}</span>
          <span class="ml-auto font-cinzel text-sm font-bold text-foreground">{{ stat.value }}</span>
        </RouterLink>
      </div>

    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed, ref, reactive } from "vue";
import {
  IconLive, IconMind, IconNavAtlas, IconNavEncounters, IconNavNpcs,
  IconNavParty, IconNavQuests, IconPin, IconReveal,
} from "@/lib/icons";
import { useRunningEncounters } from "@/composables/useEncounterLive";
import { useAllQuests } from "@/composables/useQuests";
import { useParty } from "@/composables/useParty";
import { useSpeciesNameMap } from "@/composables/useSpecies";
import { useAllCampaignCharacterClasses } from "@/composables/useCharacterClasses";
import { formatMulticlassLabel, totalLevel } from "@/types/multiclass.types";
import type { CharacterClass } from "@/types/multiclass.types";
import { useNotes } from "@/composables/useNotes";
import { useNpcs } from "@/composables/useNpcs";
import { useAllLocations } from "@/composables/useLocations";
import { useEncounters } from "@/composables/useEncounters";
import { useCampaignMembers } from "@/composables/useCampaignMembers";
import { useCampaignPresence } from "@/composables/useCampaignPresence";
import { usePartyInventory, useUpdateInventoryItem } from "@/composables/usePartyInventory";
import { useSetCampaignToday, useSetCampaignLocation } from "@/composables/useCampaigns";
import { useSyncPartyLocation } from "@/composables/useParty";
import { useRecentNpcs } from "@/composables/useRecentNpcs";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useCalendarStore } from "@/stores/calendar";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import DmTrackerButtons from "@/components/rules/DmTrackerButtons.vue";
import { extractTiptapText } from "@/lib/utils";
import type { Note } from "@/types/notes.types";
import type { Quest } from "@/types/quest.types";
import type { PartyMember } from "@/types/party.types";

const authStore     = useAuthStore();
const campaignStore = useCampaignStore();
const calendarStore = useCalendarStore();

const { data: allQuests,  isLoading: questsLoading } = useAllQuests();
const { data: party,      isLoading: partyLoading }  = useParty();
const { data: notes }      = useNotes();
const { data: npcs }       = useNpcs();
const { data: locations }  = useAllLocations();
const { data: encounters } = useEncounters();
const { data: campaignMembers } = useCampaignMembers();
const { isOnline } = useCampaignPresence();
const { data: inventory } = usePartyInventory();
const { mutateAsync: updateInventoryItem } = useUpdateInventoryItem();
const speciesNameMap = useSpeciesNameMap();
const { data: allCharacterClasses } = useAllCampaignCharacterClasses();

const setToday       = useSetCampaignToday();
const setLocation    = useSetCampaignLocation();
const syncLocation   = useSyncPartyLocation();
const { recentIds: recentNpcIds } = useRecentNpcs();

// ── Party helpers ─────────────────────────────────────────────────────────────

const classesByMember = computed(() => {
  const m = new Map<string, CharacterClass[]>();
  for (const cc of allCharacterClasses.value ?? []) {
    const list = m.get(cc.party_member_id) ?? [];
    list.push(cc);
    m.set(cc.party_member_id, list);
  }
  return m;
});

function memberClassLabel(memberId: string, legacyClass: string | null): string {
  const list = classesByMember.value.get(memberId) ?? [];
  if (list.length > 1) return formatMulticlassLabel(list);
  if (list.length === 1) return list[0].class_name;
  return legacyClass ?? "";
}

function memberLevelDisplay(memberId: string, legacyLevel: number): number {
  const list = classesByMember.value.get(memberId) ?? [];
  return list.length > 0 ? totalLevel(list) : legacyLevel;
}

function memberSubtitle(member: PartyMember): string {
  const lvl = memberLevelDisplay(member.id, member.level);
  return [
    speciesNameMap.value.get(member.species_id ?? ""),
    memberClassLabel(member.id, member.class),
    lvl ? `Lvl ${lvl}` : null,
  ].filter(Boolean).join(" · ") || "—";
}

function partyMemberOnline(partyMemberId: string): boolean {
  const m = (campaignMembers.value ?? []).find((cm) => cm.party_member_id === partyMemberId);
  return m ? isOnline(m.user_id) : false;
}

function hpColor(current: number, max: number): string {
  const pct = max > 0 ? current / max : 0;
  if (pct <= 0)    return "text-muted-foreground";
  if (pct <= 0.25) return "text-red-500";
  if (pct <= 0.5)  return "text-amber-500";
  return "text-green-500";
}

function hpBarColor(current: number, max: number): string {
  const pct = max > 0 ? current / max : 0;
  if (pct <= 0)    return "bg-muted-foreground/40";
  if (pct <= 0.25) return "bg-red-500";
  if (pct <= 0.5)  return "bg-amber-500";
  return "bg-green-500";
}

function abilityMod(score: number): number { return Math.floor((score - 10) / 2); }

function skillBonus(member: PartyMember, skill: "perception" | "insight"): number {
  const wisMod = abilityMod(member.wis);
  const level = member.skill_proficiencies[skill] ?? "none";
  if (level === "expertise")  return wisMod + member.proficiency_bonus * 2;
  if (level === "proficient") return wisMod + member.proficiency_bonus;
  return wisMod;
}

function passivePerception(member: PartyMember): number { return 10 + skillBonus(member, "perception"); }
function passiveInsight(member: PartyMember): number    { return 10 + skillBonus(member, "insight"); }

// ── Encounter ─────────────────────────────────────────────────────────────────

const { anyRunning, firstRunning } = useRunningEncounters();

// ── Quests ────────────────────────────────────────────────────────────────────

const activeQuests = computed(() => (allQuests.value ?? []).filter((q) => q.status === "active"));
const onHoldQuests = computed(() => (allQuests.value ?? []).filter((q) => q.status === "rumor"));

function giverName(quest: Quest): string {
  if (!quest.giver_npc_id) return "";
  return (npcs.value ?? []).find((n) => n.id === quest.giver_npc_id)?.name ?? "";
}

// ── Game Day ──────────────────────────────────────────────────────────────────

const calendarMonths = computed(() => calendarStore.adapter.months);

const todayFormatted = computed(() => {
  const monthName = calendarMonths.value[campaignStore.todayMonth - 1]?.name ?? "";
  return `${campaignStore.todayDay} ${monthName}, ${campaignStore.todayYear} DR`;
});

const editingDate = ref(false);
const dateForm = reactive({ year: 1495, month: 1, day: 1 });

const maxDayInSelectedMonth = computed(() => calendarMonths.value[dateForm.month - 1]?.days ?? 30);

function openDateEdit() {
  dateForm.year  = campaignStore.todayYear;
  dateForm.month = campaignStore.todayMonth;
  dateForm.day   = campaignStore.todayDay;
  editingDate.value = true;
}

function advanceDay(delta: 1 | -1) {
  if (!campaignStore.activeCampaignId) return;
  const months = calendarMonths.value;
  let year  = campaignStore.todayYear;
  let month = campaignStore.todayMonth;
  let day   = campaignStore.todayDay + delta;
  const daysInMonth = months[month - 1]?.days ?? 30;
  if (day > daysInMonth) {
    day = 1;
    month++;
    if (month > months.length) { month = 1; year++; }
  } else if (day < 1) {
    month--;
    if (month < 1) { month = months.length; year--; }
    day = months[month - 1]?.days ?? 30;
  }
  setToday.mutate({ id: campaignStore.activeCampaignId, year, month, day });
}

function saveDate() {
  if (!campaignStore.activeCampaignId) return;
  setToday.mutate({ id: campaignStore.activeCampaignId, year: dateForm.year, month: dateForm.month, day: dateForm.day });
  editingDate.value = false;
}

// ── Current Location ──────────────────────────────────────────────────────────

const locationOptions = computed(() =>
  (locations.value ?? []).map((l) => ({ id: l.id, name: l.name })),
);

const currentLocationId = computed({
  get: () => campaignStore.activeCampaign?.current_location_id ?? "",
  set: (val: string) => {
    if (!campaignStore.activeCampaignId) return;
    setLocation.mutate({ id: campaignStore.activeCampaignId, locationId: val || null });
  },
});

// ── Recent NPCs ───────────────────────────────────────────────────────────────

const recentNpcs = computed(() => {
  const npcMap = new Map((npcs.value ?? []).map((n) => [n.id, n]));
  return recentNpcIds.value.map((id) => npcMap.get(id)).filter((n): n is NonNullable<typeof n> => n !== null && n !== undefined);
});

// ── Location sync ─────────────────────────────────────────────────────────────

function syncLocationToParty() {
  const memberIds = (party.value ?? []).map((m) => m.id);
  const locationId = campaignStore.activeCampaign?.current_location_id ?? null;
  syncLocation.mutate({ memberIds, locationId });
}

// ── Notes ─────────────────────────────────────────────────────────────────────

const pinnedNotes = computed(() => (notes.value ?? []).filter((n) => n.is_pinned));

function notePreview(note: Note): string { return extractTiptapText(note.content, 120); }

// ── Inventory ─────────────────────────────────────────────────────────────────

const unidentifiedItems = computed(() => {
  const memberNames = new Map((party.value ?? []).map((m) => [m.id, m.name]));
  return (inventory.value ?? [])
    .filter((i) => i.is_identified === false)
    .map((i) => ({ inv: i, carrier: i.carried_by ? (memberNames.get(i.carried_by) ?? null) : null }));
});

async function identifyItem(invId: string) {
  await updateInventoryItem({ id: invId, update: { is_identified: true } });
}

// ── Stats strip ───────────────────────────────────────────────────────────────

const stats = computed(() => [
  { label: "Active Quests", value: activeQuests.value.length || "—", icon: IconNavQuests,     to: "/quests" },
  { label: "NPCs",          value: npcs.value?.length ?? "—",        icon: IconNavNpcs,       to: "/npcs" },
  { label: "Encounters",    value: encounters.value?.length ?? "—",  icon: IconNavEncounters, to: "/encounters" },
  { label: "Locations",     value: locations.value?.length ?? "—",   icon: IconNavAtlas,      to: "/locations" },
]);
</script>
