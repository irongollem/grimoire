<template>
  <DashboardWidget tour="dm-party" title="Party" max-height="none" :loading="partyLoading">
    <template #action>
      <div class="flex items-center gap-3">
        <AppButton to="/downtime" variant="link" size="inline-xs" label="Grant downtime →" />
        <AppButton to="/party" variant="link" size="inline-xs" label="Full tracker →" />
      </div>
    </template>
    <div v-if="!party?.length" class="px-4 py-6 text-center">
      <IconNavParty class="h-6 w-6 mx-auto mb-2 text-muted-foreground/30" />
      <p class="text-body text-muted-foreground italic">No party members yet.</p>
      <AppButton to="/party" variant="link" size="inline" class="mt-2" label="+ Add Members" />
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
            <p class="text-caption text-muted-foreground italic truncate leading-tight">{{ memberSubtitle(member) }}</p>
          </div>
          <div class="text-right shrink-0">
            <span class="font-cinzel text-sm font-bold" :class="hpColor(member.current_hp, member.max_hp)">{{ member.current_hp }}</span>
            <span class="text-caption text-muted-foreground">/{{ member.max_hp }}</span>
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
          <span v-if="member.inspiration" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/20 border border-primary/40 text-label text-primary">★ Insp.</span>
        </div>
        <!-- Conditions + Curses -->
        <div v-if="member.conditions?.length || member.curses?.length" class="flex flex-wrap gap-1">
          <span v-for="cond in member.conditions" :key="cond" class="px-1.5 py-0.5 rounded bg-destructive/10 border border-destructive/20 text-label text-destructive">{{ cond }}</span>
          <span v-for="curse in member.curses" :key="curse" class="px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/30 text-label text-violet-400">Cursed: {{ curse }}</span>
        </div>
        <!-- DM tracker buttons -->
        <DmTrackerButtons
          v-if="auth.isDM && campaign.activeCampaignId"
          :party-member-id="member.id"
          :campaign-id="campaign.activeCampaignId"
        />
      </div>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconMind, IconNavParty, IconReveal } from "@/lib/icons";
import { useParty } from "@/composables/useParty";
import { useSpeciesNameMap } from "@/composables/useSpecies";
import { useAllCampaignCharacterClasses } from "@/composables/useCharacterClasses";
import { useCampaignMembers } from "@/composables/useCampaignMembers";
import { useCampaignPresence } from "@/composables/useCampaignPresence";
import { formatMulticlassLabel, totalLevel } from "@/types/multiclass.types";
import type { CharacterClass } from "@/types/multiclass.types";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import FocalImage from "@/components/common/FocalImage.vue";
import AppButton from "@/components/common/AppButton.vue";
import DmTrackerButtons from "@/components/rules/DmTrackerButtons.vue";
import DashboardWidget from "../DashboardWidget.vue";
import type { PartyMember } from "@/types/party.types";

/** The numbers that change during play — HP, conditions, inspiration — plus
 *  who is actually at the table, from campaign presence. */
const auth = useAuthStore();
const campaign = useCampaignStore();
const { data: party, isLoading: partyLoading } = useParty();
const { data: campaignMembers } = useCampaignMembers();
const { isOnline } = useCampaignPresence();
const speciesNameMap = useSpeciesNameMap();
const { data: allCharacterClasses } = useAllCampaignCharacterClasses();

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
  if (list.length === 1) return list[0]!.class_name;
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
  ].filter(Boolean).join(" \u00b7 ") || "\u2014";
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
</script>
