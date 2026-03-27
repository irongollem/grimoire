<template>
  <div class="rounded-lg border border-primary/30 bg-card overflow-hidden font-stat text-[15px]">

    <!-- AC · HP · Speed -->
    <div class="flex flex-wrap gap-x-5 gap-y-1 px-4 py-2 border-b border-primary/20 font-medium">
      <span><strong>AC</strong> {{ sb.armor_class }}</span>
      <span><strong>HP</strong> {{ sb.hit_points }}</span>
      <span><strong>Speed</strong> {{ sb.speed }}</span>
    </div>

    <!-- Ability scores: two tables side by side, rows = ability, cols = name/score/mod/save -->
    <div class="flex gap-px border-b border-primary/20">
      <table v-for="group in ABILITY_GROUPS" :key="group[0].key" class="flex-1">
        <thead>
          <tr class="border-b border-primary/10">
            <th class="py-1 px-2"></th>
            <th class="py-1 px-1"></th>
            <th class="text-[11px] font-semibold tracking-wider text-muted-foreground py-1 px-1 text-center">MOD</th>
            <th class="text-[11px] font-semibold tracking-wider text-muted-foreground py-1 px-2 text-center">SAVE</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="ab in group"
            :key="ab.key"
            class="border-b border-primary/5 last:border-b-0"
            :style="{ backgroundColor: ab.color + '12' }"
          >
            <td class="py-1.5 px-2 font-bold text-[11px] tracking-wider whitespace-nowrap" :style="{ color: ab.color }">
              {{ ab.label }}
            </td>
            <td class="py-1.5 px-2 text-center font-bold text-[17px] leading-none">
              {{ score(ab.key) }}
            </td>
            <td class="py-1.5 px-1 text-center text-[13px] text-muted-foreground">
              {{ abilityModifier(score(ab.key)) }}
            </td>
            <td
              class="py-1.5 px-2 text-center text-[13px] font-semibold"
              :class="savesMap[ab.key] ? 'text-primary' : 'text-muted-foreground'"
            >
              {{ savesMap[ab.key] ?? abilityModifier(score(ab.key)) }}
            </td>
          </tr>
        </tbody>
      </table>
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
import { abilityModifier, skillsToString } from "@/lib/utils";
import type { MonsterStatBlock } from "@/types/monster.types";
import type { StatBlock } from "@/types/npc.types";

const ABILITIES = [
  { key: "str", label: "STR", color: "#ef4444" },
  { key: "dex", label: "DEX", color: "#22c55e" },
  { key: "con", label: "CON", color: "#f59e0b" },
  { key: "int", label: "INT", color: "#3b82f6" },
  { key: "wis", label: "WIS", color: "#14b8a6" },
  { key: "cha", label: "CHA", color: "#a855f7" },
] as const;

const ABILITY_GROUPS = [ABILITIES.slice(0, 3), ABILITIES.slice(3)];

const props = defineProps<{
  sb: MonsterStatBlock | StatBlock;
}>();

function score(key: string): number {
  return Number((props.sb as unknown as Record<string, unknown>)[key]) || 0;
}

// Parse "Str +4, Dex +2, Con +6" → { str: "+4", dex: "+2", con: "+6" }
const savesMap = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  if (!props.sb.saving_throws) return map;
  props.sb.saving_throws.split(",").forEach((part) => {
    const m = part.trim().match(/^(\w+)\s+([+-]\d+)$/);
    if (m) map[m[1].toLowerCase()] = m[2];
  });
  return map;
});

const skillsLine = computed(() => skillsToString(props.sb.skills));
</script>
