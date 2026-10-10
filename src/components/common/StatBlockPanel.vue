<template>
  <div class="rounded-lg border border-primary/30 bg-card overflow-hidden font-stat text-base">

    <!-- AC · HP · Speed · Initiative -->
    <div class="flex flex-wrap gap-x-5 gap-y-1 px-4 py-2 border-b border-primary/20 font-medium">
      <span><strong>AC</strong> {{ sb.armor_class }}</span>
      <span><strong>HP</strong> {{ formatHitPoints(sb.hit_points) }}</span>
      <span><strong>Speed</strong> {{ sb.speed }}</span>
      <span v-if="initiativeBonus !== null">
        <strong>Initiative</strong> {{ initiativeBonus >= 0 ? "+" : "" }}{{ initiativeBonus }}
      </span>
    </div>

    <!-- Ability scores -->
    <div class="border-b border-primary/20 p-1">
      <AbilityScoreTable
        :scores="scoresObj"
        :saves="savesObj"
        :roll-mode-picker="true"
        @roll-ability="(_k, label, modifier, mode) => roll(modifier, `${label} Check`, mode)"
        @roll-save="(_k, label, bonus, mode) => roll(bonus, `${label} Save`, mode)"
      />
    </div>

    <!-- Derived rows -->
    <dl class="px-4 py-2 flex flex-col gap-0.5">
      <div v-if="skillsLine" class="flex gap-1.5">
        <dt class="font-semibold shrink-0">Skills</dt>
        <dd>{{ skillsLine }}</dd>
      </div>
      <div v-if="vulnerabilitiesLine" class="flex gap-1.5">
        <dt class="font-semibold shrink-0">Damage Vulnerabilities</dt>
        <dd>{{ vulnerabilitiesLine }}</dd>
      </div>
      <div v-if="resistancesLine" class="flex gap-1.5">
        <dt class="font-semibold shrink-0">Damage Resistances</dt>
        <dd>{{ resistancesLine }}</dd>
      </div>
      <div v-if="immunitiesLine" class="flex gap-1.5">
        <dt class="font-semibold shrink-0">Damage Immunities</dt>
        <dd>{{ immunitiesLine }}</dd>
      </div>
      <div v-if="conditionImmunitiesLine" class="flex gap-1.5">
        <dt class="font-semibold shrink-0">Condition Immunities</dt>
        <dd>{{ conditionImmunitiesLine }}</dd>
      </div>
      <p v-if="sb.defenses.notes" class="text-muted-foreground">{{ sb.defenses.notes }}</p>
      <div v-if="sb.senses" class="flex gap-1.5">
        <dt class="font-semibold shrink-0">Senses</dt>
        <dd>{{ sb.senses }}</dd>
      </div>
      <div v-if="sb.languages" class="flex gap-1.5">
        <dt class="font-semibold shrink-0">Languages</dt>
        <dd>{{ sb.languages }}</dd>
      </div>
      <div class="flex gap-1.5">
        <dt class="font-semibold shrink-0">CR</dt>
        <dd>
          {{ sb.challenge_rating }}
          <span v-if="sb.proficiency_bonus" class="text-muted-foreground">(PB +{{ sb.proficiency_bonus }})</span>
        </dd>
      </div>
    </dl>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { skillsToString, formatHitPoints } from "@/lib/utils";
import type { MonsterStatBlock } from "@/types/monster.types";
import type { StatBlock } from "@/types/npc.types";
import { formatConditionImmunities, formatDefenseList } from "@/rules/statBlock/parseDefenses";
import type { RollMode } from "@/lib/dice/roller";
import { usePromptedRoll } from "@/composables/dice/usePromptedRoll";
import AbilityScoreTable from "@/components/common/AbilityScoreTable.vue";
import type { SaveEntry } from "@/rules/characterChecks";

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;

const props = defineProps<{
  sb: MonsterStatBlock | StatBlock;
  /** Creature name, used to attribute the roll in campaign chat. */
  name?: string;
}>();

// Ability/save buttons in the table only emit — without this the clicks were
// silently dropped everywhere StatBlockPanel is used (#monster sheets, NPCs,
// wildshape preview). Plain click rolls normal; right-click / long-press picks
// advantage or disadvantage via the v-roll-mode picker.
const { promptRoll } = usePromptedRoll();

function roll(modifier: number, label: string, mode?: RollMode | null): void {
  void promptRoll({
    counts: { 20: 1 },
    modifier,
    label,
    mode: mode ?? "normal",
    senderName: props.name,
  });
}

function rawScore(key: string): number {
  return Number((props.sb as unknown as Record<string, unknown>)[key]) || 0;
}

const scoresObj = computed(() => ({
  str: rawScore("str"), dex: rawScore("dex"), con: rawScore("con"),
  int: rawScore("int"), wis: rawScore("wis"), cha: rawScore("cha"),
}));

// Parse "Str +4, Dex +2" → SaveEntry map with proficiency indicated
const savesObj = computed<Record<string, SaveEntry>>(() => {
  const parsed: Record<string, number> = {};
  if (props.sb.saving_throws) {
    props.sb.saving_throws.split(",").forEach((part) => {
      const m = part.trim().match(/^(\w+)\s+([+-]\d+)$/);
      if (m) parsed[m[1].toLowerCase()] = Number(m[2]);
    });
  }
  const result: Record<string, SaveEntry> = {};
  for (const key of ABILITY_KEYS) {
    const mod = Math.floor((rawScore(key) - 10) / 2);
    result[key] = {
      bonus: parsed[key] ?? mod,
      proficient: key in parsed,
    };
  }
  return result;
});

const vulnerabilitiesLine = computed(() => formatDefenseList(props.sb.defenses.vulnerabilities));
const resistancesLine = computed(() => formatDefenseList(props.sb.defenses.resistances));
const immunitiesLine = computed(() => formatDefenseList(props.sb.defenses.immunities));
const conditionImmunitiesLine = computed(() => formatConditionImmunities(props.sb.defenses.condition_immunities));
const skillsLine = computed(() => skillsToString(props.sb.skills));

// 2024 stat blocks print a flat Initiative bonus; 2014 stat blocks (and NPCs
// that never set one) keep DEX-derived initiative. Null/absent renders nothing.
const initiativeBonus = computed(() => {
  const value = props.sb.initiative_bonus;
  return typeof value === "number" ? value : null;
});
</script>
