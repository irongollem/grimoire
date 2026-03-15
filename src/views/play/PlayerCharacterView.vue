<template>
  <div class="space-y-6">
    <div v-if="!member" class="text-center py-16 space-y-3">
      <p class="font-cinzel text-lg text-muted-foreground">No character linked</p>
      <p class="font-fell text-sm text-muted-foreground italic">
        Ask your DM to link your account to a party member.
      </p>
    </div>

    <template v-else>
      <!-- Character header -->
      <div class="rounded-lg border border-border bg-card p-5 flex items-start gap-4">
        <div
          v-if="member.portrait_url"
          class="h-20 w-20 rounded-lg overflow-hidden shrink-0 border border-border"
        >
          <img :src="member.portrait_url" :alt="member.name" class="h-full w-full object-cover" />
        </div>
        <div
          v-else
          class="h-20 w-20 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 border border-border"
        >
          <User class="h-8 w-8 text-muted-foreground" />
        </div>

        <div class="flex-1 min-w-0">
          <h1 class="font-cinzel text-2xl font-bold text-foreground">{{ member.name }}</h1>
          <p class="font-fell text-sm text-muted-foreground italic mt-0.5">
            {{ [member.race, member.class, member.subclass].filter(Boolean).join(" · ") }}
            <span v-if="member.level" class="ml-1 font-cinzel text-xs text-primary">Level {{ member.level }}</span>
          </p>
          <div class="flex flex-wrap gap-2 mt-2">
            <span v-if="member.inspiration" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gold-500/15 font-cinzel text-[11px] text-gold-500 tracking-wider">
              <Star class="h-3 w-3" /> Inspiration
            </span>
            <span
              v-for="cond in member.conditions"
              :key="cond"
              class="inline-flex items-center px-2 py-0.5 rounded bg-destructive/10 font-cinzel text-[11px] text-destructive tracking-wider"
            >
              {{ cond }}
            </span>
          </div>
        </div>
      </div>

      <!-- Core stats row -->
      <div class="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <div
          v-for="stat in coreStats"
          :key="stat.key"
          class="rounded-lg border border-border bg-card p-3 text-center"
        >
          <p class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">{{ stat.label }}</p>
          <p class="font-cinzel text-2xl font-bold text-foreground mt-1">{{ member[stat.key] }}</p>
          <p class="font-fell text-xs text-muted-foreground">{{ signedMod(member[stat.key]) }}</p>
        </div>
      </div>

      <!-- Combat + saves -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="rounded-lg border border-border bg-card p-3 text-center">
          <p class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">HP</p>
          <p class="font-cinzel text-xl font-bold" :class="hpColor">
            {{ member.current_hp }}<span class="text-muted-foreground text-sm font-normal"> / {{ member.max_hp }}</span>
          </p>
          <p v-if="member.temp_hp" class="font-fell text-xs text-blue-400">+{{ member.temp_hp }} temp</p>
        </div>
        <div class="rounded-lg border border-border bg-card p-3 text-center">
          <p class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">AC</p>
          <p class="font-cinzel text-xl font-bold text-foreground">{{ member.ac }}</p>
        </div>
        <div class="rounded-lg border border-border bg-card p-3 text-center">
          <p class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">Speed</p>
          <p class="font-cinzel text-xl font-bold text-foreground">{{ member.speed }}<span class="text-muted-foreground text-sm font-normal"> ft</span></p>
        </div>
        <div class="rounded-lg border border-border bg-card p-3 text-center">
          <p class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">Prof Bonus</p>
          <p class="font-cinzel text-xl font-bold text-foreground">+{{ member.proficiency_bonus }}</p>
        </div>
      </div>

      <!-- Death saves (only if at 0 HP) -->
      <div v-if="member.current_hp <= 0" class="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
        <p class="font-cinzel text-xs font-semibold text-destructive tracking-wider mb-2">Death Saving Throws</p>
        <div class="flex items-center gap-6">
          <div class="flex items-center gap-2">
            <span class="font-fell text-sm text-foreground">Successes:</span>
            <div class="flex gap-1">
              <div v-for="i in 3" :key="i" class="h-4 w-4 rounded-full border-2" :class="i <= member.death_save_successes ? 'bg-elven-green border-elven-green' : 'border-border'" />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="font-fell text-sm text-foreground">Failures:</span>
            <div class="flex gap-1">
              <div v-for="i in 3" :key="i" class="h-4 w-4 rounded-full border-2" :class="i <= member.death_save_failures ? 'bg-destructive border-destructive' : 'border-border'" />
            </div>
          </div>
        </div>
      </div>

      <!-- Skills -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-4 py-2 border-b border-border bg-muted/20">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Skills</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-0 divide-y divide-border">
          <div
            v-for="skill in SKILLS"
            :key="skill.key"
            class="flex items-center gap-2 px-3 py-2"
          >
            <span
              class="h-4 w-4 rounded-full border shrink-0 flex items-center justify-center"
              :class="profClass(skill.key)"
            >
              <span v-if="isExpertise(skill.key)" class="h-2 w-2 rounded-full bg-current" />
            </span>
            <span class="font-fell text-sm flex-1 text-foreground">{{ skill.label }}</span>
            <span class="font-cinzel text-xs font-bold" :class="profTextClass(skill.key)">
              {{ signedBonus(skillBonusValue(skill)) }}
            </span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { User, Star } from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";
import { useParty } from "@/composables/useParty";
import { SKILLS } from "@/types/party.types";
import type { PartyMember, SkillProficiencies } from "@/types/party.types";

const auth = useAuthStore();
const { data: partyMembers } = useParty();

const member = computed<PartyMember | null>(() => {
  if (!auth.linkedPartyMemberId || !partyMembers.value) return null;
  return partyMembers.value.find((m) => m.id === auth.linkedPartyMemberId) ?? null;
});

const coreStats = [
  { key: "str" as const, label: "STR" },
  { key: "dex" as const, label: "DEX" },
  { key: "con" as const, label: "CON" },
  { key: "int" as const, label: "INT" },
  { key: "wis" as const, label: "WIS" },
  { key: "cha" as const, label: "CHA" },
];

function mod(score: number) { return Math.floor((score - 10) / 2); }
function signedMod(score: number) {
  const m = mod(score);
  return m >= 0 ? `+${m}` : `${m}`;
}

const hpColor = computed(() => {
  if (!member.value) return "text-foreground";
  const pct = member.value.current_hp / member.value.max_hp;
  if (pct <= 0) return "text-destructive";
  if (pct < 0.33) return "text-destructive";
  if (pct < 0.66) return "text-amber-400";
  return "text-elven-green";
});

function profLevel(key: keyof SkillProficiencies) {
  return member.value?.skill_proficiencies?.[key] ?? "none";
}
function isProficient(key: keyof SkillProficiencies) {
  return profLevel(key) !== "none";
}
function isExpertise(key: keyof SkillProficiencies) {
  return profLevel(key) === "expertise";
}
function profClass(key: keyof SkillProficiencies) {
  const level = profLevel(key);
  if (level === "expertise") return "border-gold-500 text-gold-500";
  if (level === "proficient") return "border-primary text-primary bg-primary/20";
  return "border-muted-foreground/40 text-transparent";
}
function profTextClass(key: keyof SkillProficiencies) {
  return isProficient(key) ? "text-primary" : "text-muted-foreground";
}
function skillBonusValue(skill: typeof SKILLS[number]) {
  if (!member.value) return 0;
  const abilityMod = mod(member.value[skill.ability]);
  const level = profLevel(skill.key);
  const pb = member.value.proficiency_bonus;
  const extra = level === "expertise" ? pb * 2 : level === "proficient" ? pb : 0;
  return abilityMod + extra;
}

function signedBonus(n: number) {
  return n >= 0 ? `+${n}` : `${n}`;
}
</script>
