<template>
  <!-- list: the Skills tab's card, a column per nine skills from sm up.
       compact: Hearth's, always two columns with the first nine down the left. -->
  <div v-if="density === 'list'" class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0">
      <div v-for="(half, i) in halves" :key="i" class="divide-y divide-border" :class="i === 0 && 'sm:border-r border-border'">
        <SkillRollRow
          v-for="skill in half"
          :key="skill.key"
          density="list"
          :label="skill.label"
          :ability="skill.ability"
          :bonus="skillBonusValue(skill)"
          :level="profLevel(skill.key)"
          @roll="(mode) => rollSkill(skill, mode)"
        />
      </div>
    </div>
  </div>
  <div v-else class="grid grid-flow-col grid-cols-2 grid-rows-9 gap-x-2" data-skill-compact>
    <SkillRollRow
      v-for="skill in SKILLS"
      :key="skill.key"
      density="compact"
      :label="skill.label"
      :ability="skill.ability"
      :bonus="skillBonusValue(skill)"
      :level="profLevel(skill.key)"
      @roll="(mode) => rollSkill(skill, mode)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import SkillRollRow from "@/components/player/SkillRollRow.vue";
import type { RollMode } from "@/lib/dice/roller";
import { combineModes } from "@/lib/dice/dice";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { useChatSendFailure } from "@/composables/campaign/chatSendErrors";
import { usePromptedRoll } from "@/composables/dice/usePromptedRoll";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { useWhisperRecipients } from "@/composables/campaign/useWhisperRecipients";
import { skillCheckBonus } from "@/rules/skillCheck";
import { SKILLS } from "@/types/party.types";
import type { PartyMember, SkillProficiencies } from "@/types/party.types";

/**
 * The eighteen skills, one roll each: the Skills tab's list and Hearth's compact
 * grid are this one component, so the immersive whisper, the young-player
 * exception, roll modes and the Exhaustion penalty live here once.
 */
const { member, checkDisadvantage, checkPenalty, overrideScores, density = "list" } = defineProps<{
  member: PartyMember;
  checkDisadvantage: boolean;
  /** 2024-only flat Exhaustion penalty to every ability check (0 under 2014, see `checkDisadvantage`). */
  checkPenalty: number;
  /** Beast ability scores override STR/DEX/CON when wildshaped */
  overrideScores?: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  density?: "list" | "compact";
}>();
const emit = defineEmits<{ roll: [result: { label: string; dice: number; modifier: number; total: number; masked?: boolean }] }>();

const halves = [SKILLS.slice(0, 9), SKILLS.slice(9)];

const { sendFlavorMessage } = useCampaignMessages();
const { reportChatFailure } = useChatSendFailure();
const { promptRoll } = usePromptedRoll();
const { data: campaignMembers } = useCampaignMembers();
const campaignStore = useCampaignStore();
const dmUserId = computed(() => campaignMembers.value?.find((m) => m.role === "dm")?.user_id ?? null);
const auth = useAuthStore();
const { allowedIds: whisperableIds, query: whisperQuery } = useWhisperRecipients();
// An immersive roll reaches the DM as a whisper, and a young player and an
// adult who isn't their parent may not whisper each other (#927). So immersive
// rolls don't apply between them: the check rolls openly instead. A parent and
// their own child still play immersively, and a DM previewing as a player
// whispers only themselves. Until the server has answered who may be whispered,
// stay immersive: rolling openly by default would publish exactly the result
// the table chose to hide, and the insert policy refuses a whisper that isn't
// allowed anyway.
const canWhisperDm = computed(() => {
  const dm = dmUserId.value;
  if (dm === null) return false;
  if (dm === auth.user?.id) return true;
  if (!whisperQuery.isSuccess.value) return true;
  return whisperableIds.value.has(dm);
});

function profLevel(key: keyof SkillProficiencies) {
  return member.skill_proficiencies?.[key] ?? "none";
}
function skillBonusValue(skill: (typeof SKILLS)[number]) {
  // When wildshaped, use beast STR/DEX/CON; player keeps INT/WIS/CHA proficiency
  // bonuses. Shared with the Hide action's Stealth roll via `@/rules/skillCheck`.
  return skillCheckBonus(member, skill.key, overrideScores);
}

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
  const isImmersive =
    campaignStore.activeCampaign?.immersive_rolls && IMMERSIVE_SKILL_KEYS.has(skill.key) && canWhisperDm.value;
  // Player-picked mode (long-press/right-click) combined with any
  // condition-imposed disadvantage: opposing sources cancel to normal (5e RAW).
  const mode: RollMode = combineModes(override ?? "normal", checkDisadvantage ? "disadvantage" : "normal");
  const modifier = skillBonusValue(skill) + checkPenalty;
  const name = member.name;

  if (isImmersive) {
    const label = `${skill.label} Check`;
    await sendFlavorMessage(immersiveFlavor(label), skill.label).catch((e) => reportChatFailure(e, "announce the check in the chat"));
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
  const kept = result.breakdown.find((d) => !d.dropped)!;
  // The label as rolled: it carries a mode picked on the sheet's control.
  emit("roll", { label: result.label, dice: kept.val, modifier, total: result.total });
}
</script>
