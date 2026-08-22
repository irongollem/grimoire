<template>
  <AppModal :open="open" size="md" @close="emit('skip')">
    <ModalHeader title="Spell Level Advisor" :icon="IconTip" tone="primary">
      <template #actions>
        <AppButton variant="ghost" size="inline" label="Skip →" @click="emit('skip')" />
      </template>
    </ModalHeader>

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4 flex flex-col gap-4">
            <p class="text-body text-muted-foreground italic">
              Answer a few questions to pre-fill your spell's mechanics and suggest a balanced
              level.
            </p>

            <!-- 1. School → immediately shows design notes -->
            <label class="flex flex-col gap-1">
              <span class="text-eyebrow text-muted-foreground"
                >School of Magic</span
              >
              <AppSelect v-model="schoolModel" tone="muted" size="body" class="capitalize">
                <option v-for="s in SPELL_SCHOOLS" :key="s" :value="s" class="capitalize">
                  {{ s }}
                </option>
              </AppSelect>
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
              <AppSelect v-model="adv.effectType" tone="muted" size="body">
                <option value="damage">Damage</option>
                <option value="healing">Healing / Restoration</option>
                <option value="control">Control (restrain, slow, etc.)</option>
                <option value="buff">Buff / Enhancement</option>
                <option value="utility">Utility / Exploration</option>
              </AppSelect>
            </label>

            <!-- 4. Intensity (control / buff / utility only) -->
            <label
              v-if="adv.effectType !== 'damage' && adv.effectType !== 'healing'"
              class="flex flex-col gap-1"
            >
              <span class="text-eyebrow text-muted-foreground"
                >Effect Intensity</span
              >
              <AppSelect v-model="adv.effectIntensity" tone="muted" size="body">
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
              </AppSelect>
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
                size="body"
              />
              <span v-if="adv.damageDice" class="text-caption text-muted-foreground">
                Avg: {{ Math.round(parseDiceAvg(adv.damageDice)) }}
              </span>
            </label>

            <!-- 6. Targeting -->
            <label class="flex flex-col gap-1">
              <span class="text-eyebrow text-muted-foreground"
                >Targeting</span
              >
              <AppSelect v-model="adv.targetingMode" tone="muted" size="body">
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

            <!-- 7. Save type -->
            <label class="flex flex-col gap-1">
              <span class="text-eyebrow text-muted-foreground"
                >Targeting / Save</span
              >
              <AppSelect v-model="adv.saveType" tone="muted" size="body">
                <option value="save_for_half">Saving throw — half on save</option>
                <option value="save_negates">Saving throw — negates on save</option>
                <option value="attack_roll">Attack roll (can miss)</option>
                <option value="automatic">Automatic — no save or attack</option>
              </AppSelect>
            </label>

            <!-- 8. Duration -->
            <label class="flex flex-col gap-1">
              <span class="text-eyebrow text-muted-foreground"
                >Duration Tier</span
              >
              <AppSelect v-model="adv.durationTier" tone="muted" size="body">
                <option value="instantaneous">Instantaneous</option>
                <option value="conc_1min">Concentration, ≤1 minute</option>
                <option value="conc_10min">Concentration, ≤10 minutes</option>
                <option value="conc_1hour">Concentration, ≤1 hour</option>
                <option value="sustained_1min">1 minute (no concentration)</option>
                <option value="sustained_long">8+ hours (no concentration)</option>
              </AppSelect>
            </label>

            <!-- 9. Flags -->
            <div class="flex flex-col gap-2">
              <AppCheckbox v-model="adv.requiresConcentration" label="Requires Concentration" />
              <AppCheckbox v-model="adv.hasSecondaryEffect" label="Secondary condition / rider effect" />
              <AppCheckbox v-model="adv.isRitual" label="Can be cast as Ritual" />
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
    <div class="flex shrink-0 items-center justify-between gap-3 px-6 py-4 border-t border-border">
      <AppButton
        variant="ghost"
        size="inline"
        label="Skip, I'll fill it in manually"
        @click="emit('skip')"
      />
      <AppButton variant="primary" size="md" @click="emit('apply')">
        Apply to Spell (Level
        {{
          advResult.suggestedMin +
          Math.floor((advResult.suggestedMax - advResult.suggestedMin) / 2)
        }}) →
      </AppButton>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconTip } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppModal from "@/components/common/AppModal.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import DiceInput from "@/components/common/DiceInput.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
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

// AppSelect requires a v-model. `school` is a prop paired with an
// `update:school` emit (the parent wires it as v-model:school) rather than a
// local ref, so bridge the two through a writable computed.
const schoolModel = computed<SpellSchool>({
  get: () => school,
  set: (value) => emit("update:school", value),
});
</script>
