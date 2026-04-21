<template>
  <div class="rounded-lg border border-primary/30 bg-card overflow-hidden font-stat text-[15px]">

    <!-- AC · HP · Speed -->
    <div class="flex flex-wrap gap-x-5 gap-y-1 px-4 py-2 border-b border-primary/20 font-medium">
      <span><strong>AC</strong> {{ sb.armor_class }}</span>
      <span><strong>HP</strong> {{ formatHitPoints(sb.hit_points) }}</span>
      <span><strong>Speed</strong> {{ sb.speed }}</span>
    </div>

    <!-- Ability scores -->
    <div class="border-b border-primary/20 p-1">
      <AbilityScoreTable :scores="scoresObj" :saves="savesObj" :rounded="false" />
    </div>

    <!-- Derived rows -->
    <dl class="px-4 py-2 flex flex-col gap-0.5">
      <div v-if="skillsLine" class="flex gap-1.5">
        <dt class="font-semibold shrink-0">Skills</dt>
        <dd>{{ skillsLine }}</dd>
      </div>
      <div v-if="sb.damage_vulnerabilities" class="flex gap-1.5">
        <dt class="font-semibold shrink-0">Damage Vulnerabilities</dt>
        <dd>{{ sb.damage_vulnerabilities }}</dd>
      </div>
      <div v-if="sb.damage_resistances" class="flex gap-1.5">
        <dt class="font-semibold shrink-0">Damage Resistances</dt>
        <dd>{{ sb.damage_resistances }}</dd>
      </div>
      <div v-if="sb.damage_immunities" class="flex gap-1.5">
        <dt class="font-semibold shrink-0">Damage Immunities</dt>
        <dd>{{ sb.damage_immunities }}</dd>
      </div>
      <div v-if="sb.condition_immunities" class="flex gap-1.5">
        <dt class="font-semibold shrink-0">Condition Immunities</dt>
        <dd>{{ sb.condition_immunities }}</dd>
      </div>
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
import AbilityScoreTable from "@/components/common/AbilityScoreTable.vue";
import type { SaveEntry } from "@/components/common/AbilityScoreTable.vue";

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;

const props = defineProps<{
  sb: MonsterStatBlock | StatBlock;
}>();

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

const skillsLine = computed(() => skillsToString(props.sb.skills));
</script>
