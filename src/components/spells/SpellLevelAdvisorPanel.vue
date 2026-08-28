<template>
  <div
    class="rounded-lg border bg-card p-4 transition-shadow duration-700"
    :class="[
      open ? 'border-primary/50' : 'border-border',
      highlighted ? 'ring-2 ring-primary/60 ring-offset-1 ring-offset-background' : '',
    ]"
  >
    <div class="flex items-center justify-between gap-2">
      <button
        type="button"
        class="flex items-center gap-1.5 flex-1 text-left"
        @click="emit('toggle')"
      >
        <IconTip class="h-3.5 w-3.5 text-primary shrink-0" />
        <h3
          class="text-label-lg font-bold text-muted-foreground uppercase"
        >
          Spell Level Advisor
        </h3>
        <IconChevronDown
          class="h-3.5 w-3.5 text-muted-foreground transition-transform ml-auto"
          :class="open ? 'rotate-180' : ''"
        />
      </button>
      <AppButton
        v-if="open"
        variant="ghost"
        size="inline-xs"
        label="Skip →"
        class="shrink-0"
        @click="emit('toggle')"
      />
    </div>
    <p class="text-caption text-muted-foreground italic mt-1 mb-3">
      {{
        isNew
          ? "Answer a few questions to pre-fill mechanics and suggest a level."
          : "Estimate a balanced level based on 2024 DMG guidelines."
      }}
    </p>

    <div v-if="open" class="flex flex-col gap-3">
      <!-- Effect type -->
      <label class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground"
          >Main Effect</span
        >
        <AppSelect v-model="adv.effectType" tone="muted" size="body" weight="normal" block>
          <option value="damage">Damage</option>
          <option value="healing">Healing / Restoration</option>
          <option value="control">Control (restrain, slow, etc.)</option>
          <option value="buff">Buff / Enhancement</option>
          <option value="utility">Utility / Exploration</option>
        </AppSelect>
      </label>

      <!-- Intensity (control / buff / utility only) -->
      <label
        v-if="adv.effectType !== 'damage' && adv.effectType !== 'healing'"
        class="flex flex-col gap-1"
      >
        <span class="text-eyebrow text-muted-foreground"
          >Effect Intensity</span
        >
        <AppSelect v-model="adv.effectIntensity" tone="muted" size="body" weight="normal" block>
          <template v-if="adv.effectType === 'control'">
            <option value="weak">Weak — disadvantage, minor debuff</option>
            <option value="moderate">Moderate — restrained, frightened, slow</option>
            <option value="major">Major — stunned, incapacitated, banished</option>
            <option value="extreme">Extreme — dominated, paralysed, power word</option>
          </template>
          <template v-else-if="adv.effectType === 'buff'">
            <option value="weak">Weak — minor bonus, +d4</option>
            <option value="moderate">Moderate — advantage, resistance</option>
            <option value="major">Major — extra attack, flight, haste</option>
            <option value="extreme">Extreme — extra action, immunity</option>
          </template>
          <template v-else>
            <option value="weak">Minor — convenience, limited info</option>
            <option value="moderate">Moderate — solves a problem category</option>
            <option value="major">Major — teleportation, legend lore</option>
            <option value="extreme">World-altering — Wish, Gate level</option>
          </template>
        </AppSelect>
      </label>

      <!-- Damage / healing dice -->
      <label
        v-if="adv.effectType === 'damage' || adv.effectType === 'healing'"
        class="flex flex-col gap-1"
      >
        <span class="text-eyebrow text-muted-foreground">
          {{ adv.effectType === "damage" ? "Damage Dice" : "Healing Dice" }}
        </span>
        <DiceInput
          v-model="adv.damageDice"
          placeholder="e.g. 8d6 · 2d6 fire + 1d6 force · 3d8 + 5"
          size="body-xs"
        />
        <span v-if="adv.damageDice" class="text-caption text-muted-foreground">
          Avg: {{ Math.round(parseDiceAvg(adv.damageDice)) }}
        </span>
      </label>

      <!-- Targeting -->
      <label class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground"
          >Targeting</span
        >
        <AppSelect v-model="adv.targetingMode" tone="muted" size="body" weight="normal" block>
          <option value="self">Self only</option>
          <option value="single">Single target</option>
          <option value="multi_2">Up to 2 creatures</option>
          <option value="multi_3">Up to 3 creatures</option>
          <option value="multi_4_5">Up to 4–5 creatures</option>
          <option value="aoe_small">Small AoE (≤15 ft cone / ≤30 ft line)</option>
          <option value="aoe_medium">Medium AoE (20 ft radius / 60 ft line)</option>
          <option value="aoe_large">Large AoE (30+ ft radius)</option>
        </AppSelect>
      </label>

      <!-- Save type -->
      <label class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground"
          >Targeting / Save</span
        >
        <AppSelect v-model="adv.saveType" tone="muted" size="body" weight="normal" block>
          <option value="save_for_half">Saving throw — half on save</option>
          <option value="save_negates">Saving throw — negates on save</option>
          <option value="attack_roll">Attack roll (can miss)</option>
          <option value="automatic">Automatic — no save or attack</option>
        </AppSelect>
      </label>

      <!-- Duration -->
      <label class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground"
          >Duration Tier</span
        >
        <AppSelect v-model="adv.durationTier" tone="muted" size="body" weight="normal" block>
          <option value="instantaneous">Instantaneous</option>
          <option value="conc_1min">Concentration, ≤1 minute</option>
          <option value="conc_10min">Concentration, ≤10 minutes</option>
          <option value="conc_1hour">Concentration, ≤1 hour</option>
          <option value="sustained_1min">1 minute (no concentration)</option>
          <option value="sustained_long">8+ hours (no concentration)</option>
        </AppSelect>
      </label>

      <!-- Checkboxes -->
      <div class="flex flex-col gap-2">
        <AppCheckbox v-model="adv.requiresConcentration" label="Requires Concentration" />
        <AppCheckbox v-model="adv.hasSecondaryEffect" label="Secondary condition / rider effect" />
        <AppCheckbox v-model="adv.isRitual" label="Can be cast as Ritual" />
      </div>

      <!-- Result -->
      <div
        v-if="advResult"
        class="rounded-md bg-primary/10 border border-primary/30 p-3 flex flex-col gap-2"
      >
        <p class="font-cinzel text-sm font-bold text-primary">
          Suggested: Level {{ advResult.suggestedMin }}–{{ advResult.suggestedMax }}
        </p>
        <ul class="space-y-0.5">
          <li
            v-for="(f, i) in advResult.factors"
            :key="i"
            class="text-caption text-muted-foreground flex gap-1.5"
          >
            <span class="text-primary shrink-0">·</span>{{ f }}
          </li>
        </ul>
        <!-- Reference spells -->
        <template
          v-if="adv.effectType !== 'damage' && adv.effectType !== 'healing' && refSpells"
        >
          <div class="border-t border-primary/20 pt-2 flex flex-col gap-0.5">
            <span
              class="text-eyebrow text-muted-foreground"
              >Reference spells at this level</span
            >
            <p
              v-if="refSpells.control && adv.effectType === 'control'"
              class="text-caption text-muted-foreground"
            >
              {{ refSpells.control }}
            </p>
            <p
              v-if="refSpells.buff && adv.effectType === 'buff'"
              class="text-caption text-muted-foreground"
            >
              {{ refSpells.buff }}
            </p>
            <p
              v-if="refSpells.utility && adv.effectType === 'utility'"
              class="text-caption text-muted-foreground"
            >
              {{ refSpells.utility }}
            </p>
          </div>
        </template>
        <AppButton variant="primary" size="sm" class="mt-1" @click="emit('apply')">
          Apply to Spell (Level
          {{
            advResult.suggestedMin +
            Math.floor((advResult.suggestedMax - advResult.suggestedMin) / 2)
          }}) →
        </AppButton>
      </div>

      <!-- School design tips -->
      <div
        v-if="schoolTip"
        class="rounded-md border border-border bg-muted/40 p-3 flex flex-col gap-2"
      >
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-eyebrow text-muted-foreground"
            >{{ schoolTip.title }} design notes</span
          >
          <span class="text-caption-sm text-muted-foreground/60 italic shrink-0"
            >from School field ↑</span
          >
        </div>
        <ul class="space-y-1">
          <li
            v-for="(tip, i) in schoolTip.tips"
            :key="i"
            class="text-caption text-muted-foreground flex gap-1.5"
          >
            <span class="text-primary/60 shrink-0">·</span>{{ tip }}
          </li>
        </ul>
      </div>

      <!-- Reference table toggle -->
      <AppButton variant="ghost" size="inline-xs" @click="emit('toggle-table')">
        {{ showTable ? "▲ Hide" : "▼ Show" }} damage benchmark table
      </AppButton>
      <div v-if="showTable" class="overflow-x-auto">
        <table class="w-full text-caption-sm">
          <thead>
            <tr class="border-b border-border text-muted-foreground">
              <th class="text-left py-1 pr-2">Lvl</th>
              <th class="text-left py-1 pr-2">Single</th>
              <th class="text-left py-1 pr-2">Small AoE</th>
              <th class="text-left py-1">Large AoE</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in DAMAGE_BENCHMARKS"
              :key="row.level"
              class="border-b border-border/30"
            >
              <td class="py-0.5 pr-2 font-cinzel font-bold text-foreground">
                {{ row.label }}
              </td>
              <td class="py-0.5 pr-2 text-muted-foreground">{{ row.singleTarget }}</td>
              <td class="py-0.5 pr-2 text-muted-foreground">{{ row.aoeSmall }}</td>
              <td class="py-0.5 text-muted-foreground">{{ row.aoeLarge }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconChevronDown, IconTip } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import DiceInput from "@/components/common/DiceInput.vue";
import { parseDiceAvg, DAMAGE_BENCHMARKS } from "@/lib/spells/spellAdvisor";
import type { AdvisorState, AdvisorResult, SchoolTip, RefSpells } from "./spellAdvisorTypes";

const { open, highlighted, isNew, adv, advResult, schoolTip, refSpells, showTable } =
  defineProps<{
    open: boolean;
    highlighted: boolean;
    isNew: boolean;
    adv: AdvisorState;
    advResult: AdvisorResult;
    schoolTip: SchoolTip | null;
    refSpells: RefSpells | null;
    showTable: boolean;
  }>();

const emit = defineEmits<{
  toggle: [];
  apply: [];
  "toggle-table": [];
}>();
</script>
