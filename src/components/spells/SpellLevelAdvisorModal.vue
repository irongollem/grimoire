<template>
  <Teleport to="body">
    <Transition name="advisor-modal">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @keydown.esc="emit('skip')"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/70" @click="emit('skip')" />

        <!-- Card -->
        <div
          class="relative z-10 w-full max-w-lg rounded-xl border border-primary/40 bg-card shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        >
          <!-- Header -->
          <div
            class="flex items-center justify-between gap-3 px-6 pt-6 pb-4 border-b border-border shrink-0"
          >
            <h2
              class="font-cinzel text-sm font-bold tracking-wider text-foreground flex items-center gap-2"
            >
              <IconTip class="h-4 w-4 text-primary" />
              Spell Level Advisor
            </h2>
            <button
              type="button"
              class="text-label-lg text-muted-foreground hover:text-foreground transition-colors"
              @click="emit('skip')"
            >
              Skip →
            </button>
          </div>

          <div class="overflow-y-auto px-6 py-4 flex flex-col gap-4">
            <p class="text-body text-muted-foreground italic">
              Answer a few questions to pre-fill your spell's mechanics and suggest a balanced
              level.
            </p>

            <!-- 1. School → immediately shows design notes -->
            <label class="flex flex-col gap-1">
              <span class="text-eyebrow text-muted-foreground"
                >School of Magic</span
              >
              <select
                :value="school"
                class="bg-muted border border-border rounded px-3 py-2 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring capitalize"
                @change="emit('update:school', ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="s in SPELL_SCHOOLS" :key="s" :value="s" class="capitalize">
                  {{ s }}
                </option>
              </select>
            </label>

            <!-- 2. School design notes (reactive to school above) -->
            <div
              v-if="schoolTip"
              class="rounded-md border border-border bg-muted/40 p-3 flex flex-col gap-2"
            >
              <span class="text-eyebrow text-muted-foreground"
                >{{ schoolTip.title }} design notes</span
              >
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

            <!-- 3. Effect type -->
            <label class="flex flex-col gap-1">
              <span class="text-eyebrow text-muted-foreground"
                >Main Effect</span
              >
              <select
                v-model="adv.effectType"
                class="bg-muted border border-border rounded px-3 py-2 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="damage">Damage</option>
                <option value="healing">Healing / Restoration</option>
                <option value="control">Control (restrain, slow, etc.)</option>
                <option value="buff">Buff / Enhancement</option>
                <option value="utility">Utility / Exploration</option>
              </select>
            </label>

            <!-- 4. Intensity (control / buff / utility only) -->
            <label
              v-if="adv.effectType !== 'damage' && adv.effectType !== 'healing'"
              class="flex flex-col gap-1"
            >
              <span class="text-eyebrow text-muted-foreground"
                >Effect Intensity</span
              >
              <select
                v-model="adv.effectIntensity"
                class="bg-muted border border-border rounded px-3 py-2 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <template v-if="adv.effectType === 'control'">
                  <option value="weak">Weak — disadvantage, minor debuff (e.g. Bane)</option>
                  <option value="moderate">
                    Moderate — restrained, frightened, slow (e.g. Hold Person)
                  </option>
                  <option value="major">
                    Major — stunned, incapacitated, banished (e.g. Hold Monster)
                  </option>
                  <option value="extreme">
                    Extreme — dominated, paralysed, power word (e.g. Dominate Person)
                  </option>
                </template>
                <template v-else-if="adv.effectType === 'buff'">
                  <option value="weak">Weak — minor bonus, +d4 (e.g. Guidance)</option>
                  <option value="moderate">
                    Moderate — advantage, resistance (e.g. Bless, Shield)
                  </option>
                  <option value="major">
                    Major — extra attack, flight, haste (e.g. Haste, Fly)
                  </option>
                  <option value="extreme">Extreme — extra action, immunity, resurrection</option>
                </template>
                <template v-else>
                  <option value="weak">
                    Minor — convenience, limited info (e.g. Prestidigitation)
                  </option>
                  <option value="moderate">
                    Moderate — solves a problem category (e.g. Darkvision)
                  </option>
                  <option value="major">Major — teleportation, legend lore (e.g. Teleport)</option>
                  <option value="extreme">World-altering — Wish, Gate level</option>
                </template>
              </select>
            </label>

            <!-- 5. Damage / healing dice -->
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
                class="bg-muted border border-border rounded px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-full"
              />
              <span v-if="adv.damageDice" class="font-fell text-[0.6875rem] text-muted-foreground">
                Avg: {{ Math.round(parseDiceAvg(adv.damageDice)) }}
              </span>
            </label>

            <!-- 6. Targeting -->
            <label class="flex flex-col gap-1">
              <span class="text-eyebrow text-muted-foreground"
                >Targeting</span
              >
              <select
                v-model="adv.targetingMode"
                class="bg-muted border border-border rounded px-3 py-2 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="self">Self only</option>
                <option value="single">Single target</option>
                <option value="multi_2">Up to 2 creatures</option>
                <option value="multi_3">Up to 3 creatures</option>
                <option value="multi_4_5">Up to 4–5 creatures</option>
                <option value="aoe_small">Small AoE (≤15 ft cone / ≤30 ft line)</option>
                <option value="aoe_medium">Medium AoE (20 ft radius / 60 ft line)</option>
                <option value="aoe_large">Large AoE (30+ ft radius)</option>
              </select>
            </label>

            <!-- 7. Save type -->
            <label class="flex flex-col gap-1">
              <span class="text-eyebrow text-muted-foreground"
                >Targeting / Save</span
              >
              <select
                v-model="adv.saveType"
                class="bg-muted border border-border rounded px-3 py-2 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="save_for_half">Saving throw — half on save</option>
                <option value="save_negates">Saving throw — negates on save</option>
                <option value="attack_roll">Attack roll (can miss)</option>
                <option value="automatic">Automatic — no save or attack</option>
              </select>
            </label>

            <!-- 8. Duration -->
            <label class="flex flex-col gap-1">
              <span class="text-eyebrow text-muted-foreground"
                >Duration Tier</span
              >
              <select
                v-model="adv.durationTier"
                class="bg-muted border border-border rounded px-3 py-2 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="instantaneous">Instantaneous</option>
                <option value="conc_1min">Concentration, ≤1 minute</option>
                <option value="conc_10min">Concentration, ≤10 minutes</option>
                <option value="conc_1hour">Concentration, ≤1 hour</option>
                <option value="sustained_1min">1 minute (no concentration)</option>
                <option value="sustained_long">8+ hours (no concentration)</option>
              </select>
            </label>

            <!-- 9. Flags -->
            <div class="flex flex-col gap-2">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="adv.requiresConcentration" class="rounded" />
                <span class="text-body text-foreground">Requires Concentration</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="adv.hasSecondaryEffect" class="rounded" />
                <span class="text-body text-foreground"
                  >Secondary condition / rider effect</span
                >
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="adv.isRitual" class="rounded" />
                <span class="text-body text-foreground">Can be cast as Ritual</span>
              </label>
            </div>

            <!-- 10. Result -->
            <div class="rounded-md bg-primary/10 border border-primary/30 p-4 flex flex-col gap-3">
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
              <!-- Reference spells for non-damage types -->
              <template
                v-if="adv.effectType !== 'damage' && adv.effectType !== 'healing' && refSpells"
              >
                <div class="border-t border-primary/20 pt-2 flex flex-col gap-1">
                  <span
                    class="text-eyebrow text-muted-foreground"
                    >Reference spells at this level</span
                  >
                  <p
                    v-if="refSpells.control && adv.effectType === 'control'"
                    class="text-caption text-muted-foreground"
                  >
                    Control: {{ refSpells.control }}
                  </p>
                  <p
                    v-if="refSpells.buff && adv.effectType === 'buff'"
                    class="text-caption text-muted-foreground"
                  >
                    Buff: {{ refSpells.buff }}
                  </p>
                  <p
                    v-if="refSpells.utility && adv.effectType === 'utility'"
                    class="text-caption text-muted-foreground"
                  >
                    Utility: {{ refSpells.utility }}
                  </p>
                </div>
              </template>
            </div>
          </div>

          <!-- Footer actions -->
          <div
            class="flex items-center justify-between gap-3 px-6 py-4 border-t border-border shrink-0"
          >
            <button
              type="button"
              class="text-label-lg text-muted-foreground hover:text-foreground transition-colors"
              @click="emit('skip')"
            >
              Skip, I'll fill it in manually
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              @click="emit('apply')"
            >
              Apply to Spell (Level
              {{
                advResult.suggestedMin +
                Math.floor((advResult.suggestedMax - advResult.suggestedMin) / 2)
              }}) →
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { IconTip } from "@/lib/icons";
import DiceInput from "@/components/common/DiceInput.vue";
import { SPELL_SCHOOLS } from "@/types/spell.types";
import type { SpellSchool } from "@/types/spell.types";
import { parseDiceAvg } from "@/lib/spellAdvisor";
import type { AdvisorState, AdvisorResult, SchoolTip, RefSpells } from "./spellAdvisorTypes";

const { open, adv, school, advResult, schoolTip, refSpells } = defineProps<{
  open: boolean;
  adv: AdvisorState;
  school: SpellSchool;
  advResult: AdvisorResult;
  schoolTip: SchoolTip | null;
  refSpells: RefSpells | null;
}>();

const emit = defineEmits<{
  skip: [];
  apply: [];
  "update:school": [value: string];
}>();
</script>

<style>
.advisor-modal-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.advisor-modal-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.advisor-modal-enter-from,
.advisor-modal-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(-0.375rem);
}
</style>
