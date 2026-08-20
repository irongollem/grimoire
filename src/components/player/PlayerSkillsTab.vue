<template>
  <div class="space-y-3">
    <!-- Passives -->
    <div class="rounded-lg border border-border bg-card px-4 py-2.5 flex flex-wrap gap-x-6 gap-y-1">
      <span class="text-label text-muted-foreground">
        Passive Perception <span class="text-foreground font-bold">{{ passivePerception }}</span>
      </span>
      <span class="text-label text-muted-foreground">
        Passive Insight <span class="text-foreground font-bold">{{ passiveInsight }}</span>
      </span>
      <span class="text-label text-muted-foreground">
        Passive Investigation <span class="text-foreground font-bold">{{ passiveInvestigation }}</span>
      </span>
    </div>

    <!-- Skills -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0">
        <div class="sm:border-r border-border divide-y divide-border">
          <AppButton
            v-for="skill in SKILLS.slice(0, 9)"
            :key="skill.key"
            variant="menu"
            size="body"
            block
            class="group px-4 py-2.5 gap-3 rounded-none"
            v-roll-mode="(mode: RollMode | null) => rollSkill(skill, mode)"
          >
            <span
              class="h-3.5 w-3.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors"
              :class="skillProfClass(skill.key)"
            >
              <span v-if="isExpertise(skill.key)" class="h-1.5 w-1.5 rounded-full bg-current" />
            </span>
            <span class="text-body flex-1 text-foreground">{{ skill.label }}</span>
            <span class="font-cinzel text-2xs text-muted-foreground/50 mr-1">{{ skill.ability.toUpperCase() }}</span>
            <span class="font-cinzel text-sm font-bold" :class="skillBonusValue(skill) >= 0 ? 'text-foreground' : 'text-destructive'">
              {{ signedNum(skillBonusValue(skill)) }}
            </span>
            <IconChevronRight class="h-3 w-3 text-muted-foreground/40 group-hover:text-primary transition-colors" />
          </AppButton>
        </div>
        <div class="divide-y divide-border">
          <AppButton
            v-for="skill in SKILLS.slice(9)"
            :key="skill.key"
            variant="menu"
            size="body"
            block
            class="group px-4 py-2.5 gap-3 rounded-none"
            v-roll-mode="(mode: RollMode | null) => rollSkill(skill, mode)"
          >
            <span
              class="h-3.5 w-3.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors"
              :class="skillProfClass(skill.key)"
            >
              <span v-if="isExpertise(skill.key)" class="h-1.5 w-1.5 rounded-full bg-current" />
            </span>
            <span class="text-body flex-1 text-foreground">{{ skill.label }}</span>
            <span class="font-cinzel text-2xs text-muted-foreground/50 mr-1">{{ skill.ability.toUpperCase() }}</span>
            <span class="font-cinzel text-sm font-bold" :class="skillBonusValue(skill) >= 0 ? 'text-foreground' : 'text-destructive'">
              {{ signedNum(skillBonusValue(skill)) }}
            </span>
            <IconChevronRight class="h-3 w-3 text-muted-foreground/40 group-hover:text-primary transition-colors" />
          </AppButton>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconChevronRight } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import type { RollMode } from "@/lib/dice/roller";
import { combineModes } from "@/lib/dice/roller";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import { useCampaignMembers } from "@/composables/useCampaignMembers";
import { useCampaignStore } from "@/stores/campaign";
import { skillCheckBonus } from "@/rules/skillCheck";
import { SKILLS } from "@/types/party.types";
import type { PartyMember, SkillProficiencies } from "@/types/party.types";

const props = defineProps<{
  member: PartyMember;
  checkDisadvantage: boolean;
  /** 2024-only flat Exhaustion penalty to every ability check (0 under 2014 — see `checkDisadvantage`). */
  checkPenalty: number;
  /** Beast ability scores override STR/DEX/CON when wildshaped */
  overrideScores?: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
}>();
const emit = defineEmits<{ roll: [result: { label: string; dice: number; modifier: number; total: number; masked?: boolean }] }>();

const { sendFlavorMessage } = useCampaignMessages();
const { promptRoll } = usePromptedRoll();
const { data: campaignMembers } = useCampaignMembers();
const campaignStore = useCampaignStore();
const dmUserId = computed(() => campaignMembers.value?.find((m) => m.role === "dm")?.user_id ?? null);

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
  // When wildshaped, use beast STR/DEX/CON; player keeps INT/WIS/CHA proficiency
  // bonuses. Shared with the Hide action's Stealth roll via `@/rules/skillCheck`.
  return skillCheckBonus(props.member, skill.key, props.overrideScores);
}

function passiveScore(skillKey: keyof SkillProficiencies) {
  const skill = SKILLS.find((s) => s.key === skillKey)!;
  return 10 + skillBonusValue(skill);
}
const passivePerception   = computed(() => passiveScore("perception"));
const passiveInsight      = computed(() => passiveScore("insight"));
const passiveInvestigation = computed(() => passiveScore("investigation"));

const IMMERSIVE_SKILL_KEYS = new Set([
  "stealth", "sleight_of_hand", "arcana", "history", "nature", "religion",
  "insight", "investigation", "medicine", "perception",
  "persuasion", "intimidation", "deception",
]);

function immersiveFlavor(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("stealth"))       return `tries to move undetected`;
  if (l.includes("sleight"))       return `attempts a careful maneuver`;
  if (l.includes("arcana"))        return `searches their arcane knowledge`;
  if (l.includes("history"))       return `tries to recall what they know`;
  if (l.includes("nature"))        return `reads the signs of the natural world`;
  if (l.includes("religion"))      return `draws on their religious knowledge`;
  if (l.includes("insight"))       return `tries to read the situation`;
  if (l.includes("investigation")) return `examines the area carefully`;
  if (l.includes("medicine"))      return `assesses the situation`;
  if (l.includes("perception"))    return `looks and listens carefully`;
  if (l.includes("persuasion"))    return `tries to make their case`;
  if (l.includes("intimidation"))  return `attempts to assert themselves`;
  if (l.includes("deception"))     return `chooses their words carefully`;
  return `makes a check`;
}

function modeTag(mode: RollMode) {
  return mode === "advantage" ? " (Adv)" : mode === "disadvantage" ? " (Dis)" : "";
}

async function rollSkill(skill: (typeof SKILLS)[number], override: RollMode | null = null) {
  const isImmersive = campaignStore.activeCampaign?.immersive_rolls && IMMERSIVE_SKILL_KEYS.has(skill.key);
  // Player-picked mode (long-press/right-click) combined with any
  // condition-imposed disadvantage — opposing sources cancel to normal (5e RAW).
  const mode: RollMode = combineModes(
    override ?? "normal",
    props.checkDisadvantage ? "disadvantage" : "normal",
  );
  const modifier = skillBonusValue(skill) + props.checkPenalty;
  const name = props.member.name;

  if (isImmersive) {
    const label = `${skill.label} Check`;
    await sendFlavorMessage(immersiveFlavor(label), skill.label);
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
