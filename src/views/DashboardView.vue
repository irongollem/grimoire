<template>
  <div class="flex flex-col gap-6">
    <PageHeader title="Campaign Dashboard" description="Your realm at a glance" />

    <!-- Stat cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard
        v-for="stat in stats"
        :key="stat.label"
        :label="stat.label"
        :value="stat.value"
        :icon="stat.icon"
        :to="stat.to"
      />
    </div>

    <!-- Main row: Active Quests + Party -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Active Quests (2/3) -->
      <div class="lg:col-span-2 rounded-lg border border-border bg-card overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
          <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">Active Quests</h2>
          <RouterLink to="/quests" class="font-cinzel text-[10px] font-semibold text-primary tracking-wider hover:opacity-80 transition-opacity">
            View all →
          </RouterLink>
        </div>

        <div v-if="questsLoading" class="flex justify-center py-8">
          <LoadingSpinner />
        </div>

        <div v-else-if="!activeQuests.length" class="px-4 py-8 text-center">
          <ScrollText class="h-6 w-6 mx-auto mb-2 text-muted-foreground/30" />
          <p class="font-fell text-sm text-muted-foreground italic">No active quests.</p>
          <RouterLink to="/quests/new" class="mt-2 inline-block font-cinzel text-xs text-primary tracking-wider hover:opacity-80 transition-opacity">
            + New Quest
          </RouterLink>
        </div>

        <div v-else class="divide-y divide-border">
          <RouterLink
            v-for="quest in activeQuests"
            :key="quest.id"
            :to="`/quests/${quest.id}`"
            class="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group"
          >
            <div class="h-2 w-2 rounded-full mt-2 shrink-0 bg-green-500" />
            <div class="min-w-0 flex-1">
              <p class="font-cinzel text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                {{ quest.title || "Untitled Quest" }}
              </p>
              <p v-if="quest.summary" class="font-fell text-xs text-muted-foreground italic truncate mt-0.5">
                {{ quest.summary }}
              </p>
              <div class="flex items-center gap-2 mt-1 flex-wrap">
                <span v-if="giverName(quest)" class="font-fell text-[11px] text-muted-foreground">
                  Given by {{ giverName(quest) }}
                </span>
                <span v-if="quest.tags.length" class="flex gap-1">
                  <span
                    v-for="tag in quest.tags.slice(0, 2)"
                    :key="tag"
                    class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider"
                  >{{ tag }}</span>
                </span>
              </div>
            </div>
            <ChevronRight class="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
          </RouterLink>
        </div>
      </div>

      <!-- Party at a Glance (1/3) -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
          <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">Party</h2>
          <RouterLink to="/party" class="font-cinzel text-[10px] font-semibold text-primary tracking-wider hover:opacity-80 transition-opacity">
            Full tracker →
          </RouterLink>
        </div>

        <div v-if="partyLoading" class="flex justify-center py-8">
          <LoadingSpinner />
        </div>

        <div v-else-if="!party?.length" class="px-4 py-8 text-center">
          <Shield class="h-6 w-6 mx-auto mb-2 text-muted-foreground/30" />
          <p class="font-fell text-sm text-muted-foreground italic">No party members yet.</p>
          <RouterLink to="/party" class="mt-2 inline-block font-cinzel text-xs text-primary tracking-wider hover:opacity-80 transition-opacity">
            + Add Members
          </RouterLink>
        </div>

        <div v-else class="divide-y divide-border">
          <div v-for="member in party" :key="member.id" class="px-4 py-3 flex flex-col gap-2">
            <!-- Name row -->
            <div class="flex items-center gap-2">
              <div class="relative h-8 w-8 shrink-0">
                <div class="h-8 w-8 rounded-full overflow-hidden bg-secondary flex items-center justify-center">
                  <img
                    v-if="member.portrait_url"
                    :src="member.portrait_url"
                    :alt="member.name"
                    class="h-full w-full object-cover"
                  />
                  <span v-else class="font-cinzel text-xs font-bold text-foreground">
                    {{ member.name.charAt(0).toUpperCase() }}
                  </span>
                </div>
                <span
                  class="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card"
                  :class="partyMemberOnline(member.id) ? 'bg-green-500' : 'bg-muted-foreground/30'"
                />
              </div>
              <div class="min-w-0 flex-1">
                <p class="font-cinzel text-sm font-semibold text-foreground truncate leading-tight">
                  {{ member.name }}
                </p>
                <p class="font-fell text-[11px] text-muted-foreground italic truncate leading-tight">
                  {{ [member.race, member.class, member.level ? `Lvl ${member.level}` : null].filter(Boolean).join(" · ") || "—" }}
                </p>
              </div>
              <!-- HP -->
              <div class="text-right shrink-0">
                <span class="font-cinzel text-sm font-bold" :class="hpColor(member.current_hp, member.max_hp)">
                  {{ member.current_hp }}
                </span>
                <span class="font-fell text-[11px] text-muted-foreground">/{{ member.max_hp }}</span>
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

            <!-- Quick stats: AC · PP · PI -->
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider" title="Armour Class">
                AC {{ member.ac }}
              </span>
              <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider" title="Passive Perception">
                <Eye class="h-2.5 w-2.5" />
                {{ passivePerception(member) }}
              </span>
              <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider" title="Passive Insight">
                <Brain class="h-2.5 w-2.5" />
                {{ passiveInsight(member) }}
              </span>
              <span v-if="member.inspiration" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gold-500/20 border border-gold-500/40 font-cinzel text-[10px] text-gold-500 tracking-wider" title="Has Inspiration">
                ★ Insp.
              </span>
            </div>

            <!-- Conditions + Curses -->
            <div v-if="member.conditions?.length || member.curses?.length" class="flex flex-wrap gap-1">
              <span
                v-for="cond in member.conditions"
                :key="cond"
                class="px-1.5 py-0.5 rounded bg-destructive/10 border border-destructive/20 font-cinzel text-[10px] text-destructive tracking-wider"
              >
                {{ cond }}
              </span>
              <span
                v-for="curse in member.curses"
                :key="curse"
                class="px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/30 font-cinzel text-[10px] text-violet-400 tracking-wider"
              >
                Cursed: {{ curse }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Notes -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">
          Notes
          <span v-if="pinnedNotes.length" class="font-fell font-normal text-xs text-muted-foreground ml-1">
            {{ pinnedNotes.length }} pinned
          </span>
        </h2>
        <RouterLink to="/notes" class="font-cinzel text-[10px] font-semibold text-primary tracking-wider hover:opacity-80 transition-opacity">
          All notes →
        </RouterLink>
      </div>

      <div v-if="notesLoading" class="flex justify-center py-8">
        <LoadingSpinner />
      </div>

      <div v-else-if="!dashboardNotes.length" class="px-4 py-8 text-center">
        <BookOpen class="h-6 w-6 mx-auto mb-2 text-muted-foreground/30" />
        <p class="font-fell text-sm text-muted-foreground italic">No notes yet.</p>
        <RouterLink to="/notes/new" class="mt-2 inline-block font-cinzel text-xs text-primary tracking-wider hover:opacity-80 transition-opacity">
          + New Note
        </RouterLink>
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
        <RouterLink
          v-for="note in dashboardNotes"
          :key="note.id"
          :to="`/notes/${note.id}`"
          class="flex flex-col gap-1.5 px-4 py-3 hover:bg-muted/30 transition-colors group"
        >
          <div class="flex items-start gap-2">
            <Pin v-if="note.is_pinned" class="h-3 w-3 text-gold-500 mt-0.5 shrink-0" />
            <p class="font-cinzel text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
              {{ note.title || "Untitled" }}
            </p>
          </div>
          <p v-if="note.category" class="font-fell text-[11px] text-muted-foreground italic capitalize">
            {{ note.category.replace(/_/g, " ") }}
          </p>
          <p v-if="notePreview(note)" class="font-fell text-xs text-muted-foreground line-clamp-2">
            {{ notePreview(note) }}
          </p>
        </RouterLink>
      </div>
    </div>

    <!-- On Hold quests chip strip -->
    <div v-if="onHoldQuests.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">
          On Hold
          <span class="font-fell font-normal text-xs text-muted-foreground ml-1">({{ onHoldQuests.length }})</span>
        </h2>
        <RouterLink to="/quests" class="font-cinzel text-[10px] font-semibold text-primary tracking-wider hover:opacity-80 transition-opacity">
          Quest log →
        </RouterLink>
      </div>
      <div class="flex flex-wrap gap-2 px-4 py-3">
        <RouterLink
          v-for="quest in onHoldQuests"
          :key="quest.id"
          :to="`/quests/${quest.id}`"
          class="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1 font-fell text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
          {{ quest.title || "Untitled Quest" }}
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  BookOpen, Shield, Users, Swords, MapPin, ScrollText,
  ChevronRight, Pin, Eye, Brain,
} from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import StatCard from "@/components/common/StatCard.vue";
import { extractTiptapText } from "@/lib/utils";
import { useAllQuests } from "@/composables/useQuests";
import { useParty } from "@/composables/useParty";
import { useNotes } from "@/composables/useNotes";
import { useNpcs } from "@/composables/useNpcs";
import { useAllLocations } from "@/composables/useLocations";
import { useEncounters } from "@/composables/useEncounters";
import { useCampaignMembers } from "@/composables/useCampaignMembers";
import { useCampaignPresence } from "@/composables/useCampaignPresence";
import type { Note } from "@/types/notes.types";
import type { Quest } from "@/types/quest.types";
import type { PartyMember } from "@/types/party.types";

const { data: allQuests,  isLoading: questsLoading } = useAllQuests();
const { data: party,      isLoading: partyLoading }  = useParty();
const { data: notes,      isLoading: notesLoading }  = useNotes();
const { data: npcs }      = useNpcs();
const { data: locations } = useAllLocations();
const { data: encounters } = useEncounters();
const { data: campaignMembers } = useCampaignMembers();
const { isOnline } = useCampaignPresence();

// ── Derived ────────────────────────────────────────────────────────────────────

const activeQuests = computed(() => (allQuests.value ?? []).filter((q) => q.status === "active"));
const onHoldQuests = computed(() => (allQuests.value ?? []).filter((q) => q.status === "on_hold"));

const pinnedNotes = computed(() => (notes.value ?? []).filter((n) => n.is_pinned));

// Pinned first, then most recently updated; capped at 8
const dashboardNotes = computed(() => {
  const all = [...(notes.value ?? [])];
  all.sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
  return all.slice(0, 8);
});

// ── Stat cards ─────────────────────────────────────────────────────────────────

const stats = computed(() => [
  { label: "Active Quests", value: activeQuests.value.length || "—", icon: ScrollText, to: "/quests" },
  { label: "NPCs",          value: npcs.value?.length ?? "—",        icon: Users,      to: "/npcs" },
  { label: "Encounters",    value: encounters.value?.length ?? "—",  icon: Swords,     to: "/encounters" },
  { label: "Locations",     value: locations.value?.length ?? "—",   icon: MapPin,     to: "/locations" },
]);

// ── Helpers ────────────────────────────────────────────────────────────────────

function giverName(quest: Quest): string {
  if (!quest.giver_npc_id) return "";
  return (npcs.value ?? []).find((n) => n.id === quest.giver_npc_id)?.name ?? "";
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

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function skillBonus(member: PartyMember, skill: "perception" | "insight"): number {
  const wisMod = abilityMod(member.wis);
  const level = member.skill_proficiencies[skill] ?? "none";
  if (level === "expertise")  return wisMod + member.proficiency_bonus * 2;
  if (level === "proficient") return wisMod + member.proficiency_bonus;
  return wisMod;
}

function passivePerception(member: PartyMember): number {
  return 10 + skillBonus(member, "perception");
}

function passiveInsight(member: PartyMember): number {
  return 10 + skillBonus(member, "insight");
}

function notePreview(note: Note): string {
  return extractTiptapText(note.content, 120);
}

function partyMemberOnline(partyMemberId: string): boolean {
  const member = (campaignMembers.value ?? []).find((m) => m.party_member_id === partyMemberId);
  if (!member) return false;
  return isOnline(member.user_id);
}
</script>
