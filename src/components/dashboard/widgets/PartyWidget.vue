<template>
  <DashboardWidget tour="dm-party" title="Party" max-height="none" :loading="partyLoading" :empty="partyEmpty">
    <template #action>
      <div class="flex items-center gap-3">
        <AppButton to="/downtime" variant="link" size="inline-xs" label="Grant downtime →" />
        <AppButton to="/party" variant="link" size="inline-xs" label="Full tracker →" />
      </div>
    </template>
    <template #empty>
      <!-- A session-layer 401 surfaces here as isError, not as an empty roster —
           conflating the two is the bug this widget used to have (RLS returning
           `200 []` unauthenticated read as "no party members yet"). -->
      <div v-if="partyIsError" class="px-4 py-6 text-center">
        <p class="text-body text-destructive">Party could not be loaded.</p>
        <AppButton class="mt-2" label="Retry" size="sm" variant="destructive" @click="refetchParty()" />
      </div>
      <div v-else class="px-4 py-6 text-center">
        <IconNavParty class="h-6 w-6 mx-auto mb-2 text-muted-foreground/30" />
        <p class="text-body text-muted-foreground italic">No party members yet.</p>
        <AppButton to="/party" variant="link" size="inline" class="mt-2" label="+ Add Members" />
      </div>
    </template>
    <div v-if="party?.length" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-border">
      <div v-for="member in party" :key="member.id" class="bg-card px-3 py-2.5 flex flex-col gap-1.5">
        <!-- Name row -->
        <div class="flex items-center gap-2">
          <div class="relative h-8 w-8 shrink-0">
            <div class="h-8 w-8 rounded-full overflow-hidden bg-secondary">
              <FocalImage v-bind="portraitProps(member)" format="token" />
            </div>
            <span
              class="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card"
              :class="partyMemberOnline(member.id) ? 'bg-tone-success' : 'bg-muted-foreground/30'"
            />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-heading-xs font-semibold text-foreground truncate leading-tight">{{ member.name }}</p>
            <p class="text-caption text-muted-foreground italic truncate leading-tight">{{ memberSubtitle(member, speciesNameOf(member)) }}</p>
          </div>
          <div class="text-right shrink-0">
            <span class="text-heading-sm font-bold" :class="hpColor(member.current_hp, member.max_hp)">{{ member.current_hp }}</span>
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
          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-label text-muted-foreground" :title="acTitle(member)">AC {{ acOf(member) }}</span>
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
          <span v-for="curse in member.curses" :key="curse" class="px-1.5 py-0.5 rounded bg-tone-arcane/10 border border-tone-arcane/30 text-label text-ink-arcane">Cursed: {{ curse }}</span>
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
import { useActiveParty } from "@/composables/party/useActiveParty";
import { useMonstersByIds } from "@/composables/monsters/useMonstersByIds";
import { useTrackerStates } from "@/composables/dashboard/useTrackerState";
import { useRules } from "@/composables/rules/useRules";
import { useArmorClass } from "@/composables/party/useArmorClass";
import { describeAc } from "@/rules/armorClass";
import { useSpeciesNames } from "@/composables/rules/useSpecies";
import { useAllCampaignCharacterClasses } from "@/composables/party/useCharacterClasses";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import { useCampaignPresence } from "@/composables/campaign/useCampaignPresence";
import { formatMulticlassLabel, totalLevel } from "@/types/multiclass.types";
import type { CharacterClass } from "@/types/multiclass.types";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import FocalImage from "@/components/common/media/FocalImage.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import DmTrackerButtons from "@/components/rules/DmTrackerButtons.vue";
import DashboardWidget from "../DashboardWidget.vue";
import type { PartyMember } from "@/types/party.types";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { formPortrait } from "@/lib/wildshapePortrait";


/** The numbers that change during play — HP, conditions, inspiration — plus
 *  who is actually at the table, from campaign presence. */
const auth = useAuthStore();
const campaign = useCampaignStore();
const { acFor, acBreakdownFor } = useArmorClass();
/** A wild-shaped member has the beast's AC, as everywhere else. */
const acOf = (m: PartyMember) => m.wildshape_state?.beast_ac ?? acFor(m);
const acTitle = (m: PartyMember) =>
  m.wildshape_state ? `Wild Shape: ${m.wildshape_state.beast_name}` : describeAc(acBreakdownFor(m));
const { data: party, isError: partyIsError, refetch: refetchParty } = useActiveParty();
// The party body (and so each member's DmTrackerButtons) mounts only after the
// party and memorials load, which put these two reads a round behind. The
// buttons read the same cache entries; this only moves when the request starts.
// DM-only exactly as the buttons are, so a player never sends them.
useTrackerStates(() => auth.isDM);
useRules(() => auth.isDM);

/** A wild-shaped member wears the beast's face, as everywhere else — the
 *  beast's picture as it reads now (art tables merged), not only the copy the
 *  form took when it was assumed, which is null for a library beast whose
 *  picture lives in the art tables. */
const { data: shapedBeasts } = useMonstersByIds(
  () => (party.value ?? []).map((m) => m.wildshape_state?.monster_id),
  { withArt: true },
);
function portraitProps(member: PartyMember) {
  const form = member.wildshape_state;
  const live = form ? shapedBeasts.value.get(form.monster_id)?.image_url : null;
  const { src, focalPoint, alt, shaped } = formPortrait(member, form, live);
  return { src, focalPoint, alt, placeholder: placeholderUrl(shaped ? "monster" : "character") };
}
// `isLoading` (isPending && isFetching) reports false while disabled or between
// fetches, so a query with no active campaign yet reads as "not loading" with
// undefined data — the trap behind the original bug. `!data` is the honest
// "no answer yet" check; it is true for both the disabled and in-flight cases.
const partyLoading = computed(() => !partyIsError.value && !party.value);
const partyEmpty = computed(() => partyIsError.value || party.value?.length === 0);
const speciesNameOf = useSpeciesNames(() => party.value ?? []);
const { data: campaignMembers } = useCampaignMembers();
const { isOnline } = useCampaignPresence();
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

function memberSubtitle(member: PartyMember, speciesName: string | null): string {
  const lvl = memberLevelDisplay(member.id, member.level);
  return [
    speciesName,
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
  if (pct <= 0.25) return "text-destructive";
  if (pct <= 0.5)  return "text-ink-caution";
  return "text-ink-success";
}

function hpBarColor(current: number, max: number): string {
  const pct = max > 0 ? current / max : 0;
  if (pct <= 0)    return "bg-muted-foreground/40";
  if (pct <= 0.25) return "bg-tone-danger";
  if (pct <= 0.5)  return "bg-tone-caution";
  return "bg-tone-success";
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
