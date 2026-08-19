<template>
  <fieldset :disabled="disabled" class="contents">
    <div class="flex flex-col gap-5">
      <!-- Combat stats: CR / AC / HP / Speed -->
      <section>
        <p v-if="!hideHeading" class="section-heading">Combat Statistics</p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label class="block">
            <span class="field-label">Challenge Rating</span>
            <AppInput
              v-model="sb.challenge_rating"
              tone="filled"
              size="body"
              placeholder="1/4"
              class="font-bold"
            />
          </label>
          <label class="block">
            <span class="field-label">Armor Class</span>
            <AppInput
              v-model.number="sb.armor_class"
              type="number"
              tone="filled"
              size="body"
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
            <AppInput
              v-model.number="sb.proficiency_bonus"
              type="number"
              min="0"
              tone="filled"
              size="body"
              placeholder="2"
              @focus="($event.target as HTMLInputElement).select()"
            />
          </label>
          <label class="block">
            <span class="field-label">Initiative</span>
            <AppInput
              v-model.number="sb.initiative_bonus"
              type="number"
              tone="filled"
              size="body"
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
            <AppInput
              v-model.number="(sb as unknown as Record<string, number>)[stat.key]"
              type="number"
              min="1"
              max="30"
              tone="filled"
              size="body"
              align="center"
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
          <AppInput v-model="sb.saving_throws" tone="filled" size="body" placeholder="Con +5, Wis +3" />
        </label>
        <label class="block">
          <span class="field-label">Skills</span>
          <AppInput v-model="skillsText" tone="filled" size="body" placeholder="Perception +3, Stealth +5" />
        </label>
        <label class="block">
          <span class="field-label">Damage Vulnerabilities</span>
          <AppInput v-model="sb.damage_vulnerabilities" tone="filled" size="body" placeholder="bludgeoning" />
        </label>
        <label class="block">
          <span class="field-label">Damage Resistances</span>
          <AppInput v-model="sb.damage_resistances" tone="filled" size="body" placeholder="fire, cold" />
        </label>
        <label class="block">
          <span class="field-label">Damage Immunities</span>
          <AppInput v-model="sb.damage_immunities" tone="filled" size="body" placeholder="poison, psychic" />
        </label>
        <label class="block">
          <span class="field-label">Condition Immunities</span>
          <AppInput v-model="sb.condition_immunities" tone="filled" size="body" placeholder="charmed, exhaustion" />
        </label>
        <label class="block">
          <span class="field-label">Senses</span>
          <AppInput v-model="sb.senses" tone="filled" size="body" placeholder="darkvision 60 ft., passive Perception 13" />
        </label>
        <label class="block">
          <span class="field-label">Languages</span>
          <AppInput v-model="sb.languages" tone="filled" size="body" placeholder="Common, Giant" />
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
          <AppInput
            v-model.number="(sb as unknown as Record<string, number>).legendary_resistance"
            type="number"
            min="0"
            max="5"
            tone="filled"
            size="body"
            :block="false"
            class="w-20"
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
import AppInput from "@/components/common/AppInput.vue";
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

const skillsText = computed({
  get: () => skillsToString(sb.skills),
  set: (raw: string) => { sb.skills = skillsToRecord(raw); },
});
</script>

<style scoped>
@reference "@/assets/main.css";

.field-label {
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
.section-heading {
  @apply text-label-lg font-semibold text-muted-foreground uppercase mb-3;
}
</style>
