<template>
  <div class="space-y-3">
    <!-- Passives -->
    <div class="rounded-lg border border-border bg-card px-4 py-2.5 flex flex-wrap gap-x-6 gap-y-1">
      <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">
        Passive Perception <span class="text-foreground font-bold">{{ passivePerception }}</span>
      </span>
      <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">
        Passive Insight <span class="text-foreground font-bold">{{ passiveInsight }}</span>
      </span>
      <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">
        Passive Investigation <span class="text-foreground font-bold">{{ passiveInvestigation }}</span>
      </span>
    </div>

    <!-- Skills -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0">
        <div class="sm:border-r border-border divide-y divide-border">
          <button
            v-for="skill in SKILLS.slice(0, 9)"
            :key="skill.key"
            class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors group text-left"
            @click="rollSkill(skill)"
          >
            <span
              class="h-3.5 w-3.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors"
              :class="skillProfClass(skill.key)"
            >
              <span v-if="isExpertise(skill.key)" class="h-1.5 w-1.5 rounded-full bg-current" />
            </span>
            <span class="font-fell text-sm flex-1 text-foreground">{{ skill.label }}</span>
            <span class="font-cinzel text-[10px] text-muted-foreground/50 mr-1">{{ skill.ability.toUpperCase() }}</span>
            <span class="font-cinzel text-sm font-bold" :class="skillBonusValue(skill) >= 0 ? 'text-foreground' : 'text-destructive'">
              {{ signedNum(skillBonusValue(skill)) }}
            </span>
            <ChevronRight class="h-3 w-3 text-muted-foreground/40 group-hover:text-primary transition-colors" />
          </button>
        </div>
        <div class="divide-y divide-border">
          <button
            v-for="skill in SKILLS.slice(9)"
            :key="skill.key"
            class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors group text-left"
            @click="rollSkill(skill)"
          >
            <span
              class="h-3.5 w-3.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors"
              :class="skillProfClass(skill.key)"
            >
              <span v-if="isExpertise(skill.key)" class="h-1.5 w-1.5 rounded-full bg-current" />
            </span>
            <span class="font-fell text-sm flex-1 text-foreground">{{ skill.label }}</span>
            <span class="font-cinzel text-[10px] text-muted-foreground/50 mr-1">{{ skill.ability.toUpperCase() }}</span>
            <span class="font-cinzel text-sm font-bold" :class="skillBonusValue(skill) >= 0 ? 'text-foreground' : 'text-destructive'">
              {{ signedNum(skillBonusValue(skill)) }}
            </span>
            <ChevronRight class="h-3 w-3 text-muted-foreground/40 group-hover:text-primary transition-colors" />
          </button>
        </div>
      </div>
    </div>

    <!-- Personality (structured roleplay block) -->
    <div
      v-if="hasPersonality"
      class="rounded-lg border border-border bg-card p-4 space-y-3"
    >
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Personality</p>
      <div v-if="member.alignment || member.deity" class="flex flex-wrap gap-1.5">
        <span v-if="member.alignment" class="px-2 py-0.5 rounded bg-muted border border-border font-cinzel text-[10px] text-foreground tracking-wider">
          {{ member.alignment }}
        </span>
        <span v-if="member.deity" class="px-2 py-0.5 rounded bg-muted border border-border font-cinzel text-[10px] text-foreground tracking-wider">
          ✦ {{ member.deity }}
        </span>
      </div>
      <div v-if="member.personality_traits" class="space-y-0.5">
        <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">TRAITS</p>
        <p class="font-fell text-sm text-foreground whitespace-pre-wrap">{{ member.personality_traits }}</p>
      </div>
      <div v-if="member.ideals" class="space-y-0.5">
        <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">IDEALS</p>
        <p class="font-fell text-sm text-foreground whitespace-pre-wrap">{{ member.ideals }}</p>
      </div>
      <div v-if="member.bonds" class="space-y-0.5">
        <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">BONDS</p>
        <p class="font-fell text-sm text-foreground whitespace-pre-wrap">{{ member.bonds }}</p>
      </div>
      <div v-if="member.flaws" class="space-y-0.5">
        <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">FLAWS</p>
        <p class="font-fell text-sm text-foreground whitespace-pre-wrap">{{ member.flaws }}</p>
      </div>
    </div>

    <!-- Identity (age / gender / pronouns / description) -->
    <div v-if="hasIdentityExtras" class="rounded-lg border border-border bg-card p-4 space-y-2">
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Identity</p>
      <div class="flex flex-wrap gap-1.5">
        <span v-if="member.age" class="px-2 py-0.5 rounded bg-muted border border-border font-cinzel text-[10px] text-foreground tracking-wider">
          Age {{ member.age }}
        </span>
        <span v-if="member.gender" class="px-2 py-0.5 rounded bg-muted border border-border font-cinzel text-[10px] text-foreground tracking-wider">
          {{ member.gender }}
        </span>
        <span v-if="member.pronouns" class="px-2 py-0.5 rounded bg-muted border border-border font-cinzel text-[10px] text-foreground tracking-wider">
          {{ member.pronouns }}
        </span>
      </div>
      <p v-if="member.physical_description" class="font-fell text-sm text-foreground whitespace-pre-wrap">{{ member.physical_description }}</p>
    </div>

    <!-- Notes -->
    <div v-if="member.notes" class="rounded-lg border border-border bg-card p-4">
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">Notes</p>
      <p class="font-fell text-sm text-foreground whitespace-pre-wrap">{{ member.notes }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ChevronRight } from "lucide-vue-next";
import type { RollMode } from "@/lib/roller";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import { useCampaignMembers } from "@/composables/useCampaignMembers";
import { useCampaignStore } from "@/stores/campaign";
import { SKILLS } from "@/types/party.types";
import type { PartyMember, SkillProficiencies } from "@/types/party.types";

const props = defineProps<{ member: PartyMember; checkDisadvantage: boolean }>();
const emit = defineEmits<{ roll: [result: { label: string; dice: number; modifier: number; total: number; masked?: boolean }] }>();

const { sendFlavorMessage } = useCampaignMessages();
const { promptRoll } = usePromptedRoll();
const { data: campaignMembers } = useCampaignMembers();
const campaignStore = useCampaignStore();
const dmUserId = computed(() => campaignMembers.value?.find((m) => m.role === "dm")?.user_id ?? null);

function abilityMod(score: number) { return Math.floor((score - 10) / 2); }
function signedNum(n: number) { return n >= 0 ? `+${n}` : `${n}`; }

function profLevel(key: keyof SkillProficiencies) {
  return props.member.skill_proficiencies?.[key] ?? "none";
}
function isExpertise(key: keyof SkillProficiencies) { return profLevel(key) === "expertise"; }
function skillProfClass(key: keyof SkillProficiencies) {
  const level = profLevel(key);
  if (level === "expertise") return "border-gold-500 text-gold-500";
  if (level === "proficient") return "border-primary text-primary bg-primary/20";
  return "border-muted-foreground/30 text-transparent";
}
function skillBonusValue(skill: (typeof SKILLS)[number]) {
  const score = props.member[skill.ability] as number;
  const mod = abilityMod(score);
  const level = profLevel(skill.key);
  const pb = props.member.proficiency_bonus;
  return mod + (level === "expertise" ? pb * 2 : level === "proficient" ? pb : 0);
}

function passiveScore(skillKey: keyof SkillProficiencies) {
  const skill = SKILLS.find((s) => s.key === skillKey)!;
  return 10 + skillBonusValue(skill);
}
const passivePerception   = computed(() => passiveScore("perception"));
const hasPersonality = computed(() =>
  !!(props.member.alignment
    || props.member.deity
    || props.member.personality_traits
    || props.member.ideals
    || props.member.bonds
    || props.member.flaws),
);
const hasIdentityExtras = computed(() =>
  !!(props.member.age || props.member.gender || props.member.pronouns || props.member.physical_description),
);
const passiveInsight      = computed(() => passiveScore("insight"));
const passiveInvestigation = computed(() => passiveScore("investigation"));

const IMMERSIVE_SKILL_KEYS = new Set([
  "stealth", "sleight_of_hand", "arcana", "history", "nature", "religion",
  "insight", "investigation", "medicine", "perception",
  "persuasion", "intimidation", "deception",
]);

function immersiveFlavor(label: string, name: string): string {
  const l = label.toLowerCase();
  if (l.includes("stealth"))       return `${name} tries to move undetected`;
  if (l.includes("sleight"))       return `${name} attempts a careful maneuver`;
  if (l.includes("arcana"))        return `${name} searches their arcane knowledge`;
  if (l.includes("history"))       return `${name} tries to recall what they know`;
  if (l.includes("nature"))        return `${name} reads the signs of the natural world`;
  if (l.includes("religion"))      return `${name} draws on their religious knowledge`;
  if (l.includes("insight"))       return `${name} tries to read the situation`;
  if (l.includes("investigation")) return `${name} examines the area carefully`;
  if (l.includes("medicine"))      return `${name} assesses the situation`;
  if (l.includes("perception"))    return `${name} looks and listens carefully`;
  if (l.includes("persuasion"))    return `${name} tries to make their case`;
  if (l.includes("intimidation"))  return `${name} attempts to assert themselves`;
  if (l.includes("deception"))     return `${name} chooses their words carefully`;
  return `${name} makes a check`;
}

function modeTag(mode: RollMode) {
  return mode === "advantage" ? " (Adv)" : mode === "disadvantage" ? " (Dis)" : "";
}

async function rollSkill(skill: (typeof SKILLS)[number]) {
  const isImmersive = campaignStore.activeCampaign?.immersive_rolls && IMMERSIVE_SKILL_KEYS.has(skill.key);
  const mode: RollMode = props.checkDisadvantage ? "disadvantage" : "normal";
  const modifier = skillBonusValue(skill);
  const name = props.member.name;

  if (isImmersive) {
    const label = `${skill.label} Check`;
    await sendFlavorMessage(immersiveFlavor(label, name), skill.label);
    const result = await promptRoll({
      counts: { 20: 1 },
      modifier,
      label,
      mode,
      recipientUserId: dmUserId.value,
      senderName: name,
    });
    if (result) emit("roll", { label, dice: 0, modifier, total: 0, masked: true });
    return;
  }

  const fullLabel = `${skill.label} Check` + modeTag(mode);
  const result = await promptRoll({ counts: { 20: 1 }, modifier, label: fullLabel, mode });
  if (!result) return;
  const kept = result.breakdown.find(d => !d.dropped)!;
  emit("roll", { label: fullLabel, dice: kept.val, modifier, total: result.total });
}
</script>
