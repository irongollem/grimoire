<template>
  <fieldset :disabled="disabled" class="contents">
    <div class="flex flex-col gap-5">
      <!-- Combat stats: CR / AC / HP / Speed -->
      <section>
        <p v-if="!hideHeading" class="section-heading">Combat Statistics</p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label class="block">
            <span class="field-label">Challenge Rating</span>
            <input
              v-model="sb.challenge_rating"
              class="field-input w-full font-bold"
              placeholder="1/4"
            />
          </label>
          <label class="block">
            <span class="field-label">Armor Class</span>
            <input
              v-model.number="sb.armor_class"
              type="number"
              class="field-input w-full"
              @focus="($event.target as HTMLInputElement).select()"
            />
          </label>
          <div class="block">
            <span class="field-label">Hit Points</span>
            <DiceExprInput
              :model-value="sb.hit_points || null"
              placeholder="8d8+16"
              @update:model-value="sb.hit_points = $event ?? ''"
            />
          </div>
          <label class="block">
            <span class="field-label">Proficiency Bonus</span>
            <input
              v-model.number="sb.proficiency_bonus"
              type="number"
              min="0"
              class="field-input w-full"
              placeholder="2"
              @focus="($event.target as HTMLInputElement).select()"
            />
          </label>
          <label class="block">
            <span class="field-label">Initiative</span>
            <input
              v-model.number="(sb as unknown as Record<string, number>).initiative_bonus"
              type="number"
              class="field-input w-full"
              placeholder="Overrides DEX mod (2024)"
              @focus="($event.target as HTMLInputElement).select()"
            />
          </label>
          <div class="block col-span-full">
            <span class="field-label">Speed</span>
            <SpeedGrid
              :model-value="sb.speed"
              @update:model-value="sb.speed = $event"
            />
          </div>
        </div>
      </section>

      <!-- Ability scores -->
      <section>
        <p class="section-heading">Ability Scores</p>
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <label
            v-for="stat in STAT_BLOCK_ABILITIES"
            :key="stat.key"
            class="flex flex-col items-center gap-1"
          >
            <span class="field-label">{{ stat.label }}</span>
            <input
              v-model.number="(sb as unknown as Record<string, unknown>)[stat.key]"
              type="number"
              min="1"
              max="30"
              class="field-input w-full text-center"
              @focus="($event.target as HTMLInputElement).select()"
            />
            <span
              class="font-cinzel text-xs font-bold"
              :class="(((sb as unknown as Record<string, number>)[stat.key] - 10) / 2 | 0) >= 0
                ? 'text-elven-green'
                : 'text-destructive'"
            >
              {{ abilityModifier((sb as unknown as Record<string, number>)[stat.key] || 0) }}
            </span>
          </label>
        </div>
      </section>

      <!-- Proficiencies & senses -->
      <section class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label class="block">
          <span class="field-label">Saving Throws</span>
          <input
            v-model="sb.saving_throws"
            class="field-input w-full"
            placeholder="Con +5, Wis +3"
          />
        </label>
        <label class="block">
          <span class="field-label">Skills</span>
          <input
            :value="skillsText"
            class="field-input w-full"
            placeholder="Perception +3, Stealth +5"
            @input="onSkillsInput(($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="block">
          <span class="field-label">Damage Vulnerabilities</span>
          <input v-model="sb.damage_vulnerabilities" class="field-input w-full" placeholder="bludgeoning" />
        </label>
        <label class="block">
          <span class="field-label">Damage Resistances</span>
          <input v-model="sb.damage_resistances" class="field-input w-full" placeholder="fire, cold" />
        </label>
        <label class="block">
          <span class="field-label">Damage Immunities</span>
          <input v-model="sb.damage_immunities" class="field-input w-full" placeholder="poison, psychic" />
        </label>
        <label class="block">
          <span class="field-label">Condition Immunities</span>
          <input v-model="sb.condition_immunities" class="field-input w-full" placeholder="charmed, exhaustion" />
        </label>
        <label class="block">
          <span class="field-label">Senses</span>
          <input v-model="sb.senses" class="field-input w-full" placeholder="darkvision 60 ft., passive Perception 13" />
        </label>
        <label class="block">
          <span class="field-label">Languages</span>
          <input v-model="sb.languages" class="field-input w-full" placeholder="Common, Giant" />
        </label>
      </section>

      <div class="gold-divider" />

      <!-- Trait sections -->
      <section class="flex flex-col gap-4">
        <TraitSection v-model="sb.special_abilities" label="Special Abilities" />
        <TraitSection v-model="sb.actions" label="Actions" />
        <TraitSection v-model="sb.bonus_actions" label="Bonus Actions" />
        <TraitSection v-model="sb.reactions" label="Reactions" />
      </section>

      <!-- Legendary -->
      <section v-if="showLegendary">
        <p class="section-heading">Legendary</p>
        <label class="flex items-center gap-3 mb-4">
          <span class="field-label whitespace-nowrap">Legendary Resistance (uses/day)</span>
          <input
            v-model.number="(sb as unknown as Record<string, number>).legendary_resistance"
            type="number"
            min="0"
            max="5"
            class="field-input w-20"
            @focus="($event.target as HTMLInputElement).select()"
          />
        </label>
        <TraitSection v-model="sb.legendary_actions" label="Legendary Actions" />
      </section>

      <!-- Lair -->
      <section v-if="showLair">
        <TraitSection v-model="sb.lair_actions" label="Lair Actions" />
      </section>

      <!-- Spellcasting -->
      <section>
        <SpellcastingSection
          v-model="sb.spellcasting"
          :ability-scores="{ int: sb.int, wis: sb.wis, cha: sb.cha }"
          :proficiency-bonus="sb.proficiency_bonus ?? null"
          :challenge-rating="sb.challenge_rating"
        />
      </section>
    </div>
  </fieldset>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { STAT_BLOCK_ABILITIES, abilityModifier, skillsToString, skillsToRecord } from "@/lib/utils";
import DiceExprInput from "@/components/common/DiceExprInput.vue";
import SpeedGrid from "@/components/common/SpeedGrid.vue";
import SpellcastingSection from "@/components/common/SpellcastingSection.vue";
import TraitSection from "@/components/npcs/TraitSection.vue";
import type { MonsterStatBlock } from "@/types/monster.types";
import type { StatBlock } from "@/types/npc.types";

const { sb } = defineProps<{
  sb: MonsterStatBlock | StatBlock;
  showLegendary?: boolean;
  showLair?: boolean;
  hideHeading?: boolean;
  disabled?: boolean;
}>();

defineOptions({ inheritAttrs: false });

const skillsText = computed(() => skillsToString(sb.skills));

function onSkillsInput(raw: string) {
  sb.skills = skillsToRecord(raw);
}
</script>
