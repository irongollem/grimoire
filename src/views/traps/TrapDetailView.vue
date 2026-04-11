<template>
  <PageHeader :title="isNew ? 'New Trap' : form.name || 'Loading…'">
    <template #actions>
      <button
        v-if="isEdit"
        type="button"
        class="font-fell text-sm text-destructive hover:opacity-70 transition-opacity"
        @click="deleteTrap"
      >
        Delete
      </button>
      <button
        type="button"
        :disabled="saving || !form.name.trim()"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        {{ saving ? "Saving…" : isNew ? "Create" : "Save" }}
      </button>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <template v-else>
      <div class="flex flex-col gap-4 max-w-2xl">
        <!-- Image + Identity -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span
              class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
              >Identity</span
            >
          </div>
          <div class="p-4 flex gap-4">
            <!-- Image -->
            <div class="shrink-0 w-28">
              <ImageUpload
                :model-value="form.image_url"
                :focal-point="form.image_focal_point"
                aspect="square"
                show-focal-point
                bucket="trap-images"
                @update:model-value="form.image_url = $event"
                @update:focal-point="form.image_focal_point = $event"
              />
            </div>

            <!-- Fields -->
            <div class="flex-1 grid grid-cols-2 gap-3">
              <div class="col-span-2">
                <label
                  class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1"
                  >Name</label
                >
                <input
                  v-model="form.name"
                  placeholder="Trap name…"
                  class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-cinzel text-sm font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label
                  class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1"
                  >Type</label
                >
                <select
                  v-model="form.trap_type"
                  class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option v-for="t in TRAP_TYPES" :key="t" :value="t">
                    {{ t }}
                  </option>
                </select>
              </div>
              <div>
                <label
                  class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1"
                  >CR</label
                >
                <div class="flex items-center gap-2">
                  <select
                    v-model="form.cr"
                    class="flex-1 bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option :value="null">—</option>
                    <option v-for="cr in CR_LIST" :key="cr" :value="cr">
                      {{ cr }}
                    </option>
                  </select>
                  <span
                    v-if="crXp"
                    class="font-cinzel text-[10px] text-muted-foreground tracking-wider whitespace-nowrap"
                  >
                    {{ crXp }} XP
                  </span>
                  <button
                    type="button"
                    class="shrink-0 inline-flex items-center gap-1 font-cinzel text-[10px] font-semibold text-primary hover:opacity-80 transition-opacity tracking-wider whitespace-nowrap"
                    title="Open CR advisor"
                    @click="showAdvisor = true"
                  >
                    <Sparkles class="h-3 w-3" />
                    Suggest
                  </button>
                </div>
              </div>
              <div class="col-span-2">
                <label
                  class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1"
                  >Tags</label
                >
                <TagInput v-model="form.tags" />
              </div>
            </div>
          </div>
        </div>

        <!-- Mechanics -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span
              class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
              >Mechanics</span
            >
          </div>
          <div class="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label
                class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1"
                >Trigger</label
              >
              <select
                v-model="form.trigger_type"
                class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option :value="null">—</option>
                <option v-for="t in TRAP_TRIGGERS" :key="t" :value="t">
                  {{ t }}
                </option>
              </select>
            </div>
            <div>
              <label
                class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1"
                >Detection DC</label
              >
              <input
                v-model.number="form.detection_dc"
                type="number"
                min="1"
                max="30"
                placeholder="15"
                class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label
                class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1"
                >Disarm DC</label
              >
              <input
                v-model.number="form.disarm_dc"
                type="number"
                min="1"
                max="30"
                placeholder="15"
                class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label
                class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1"
                >Reset</label
              >
              <select
                v-model="form.reset_type"
                class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option v-for="r in TRAP_RESET_TYPES" :key="r" :value="r">
                  {{ r }}
                </option>
              </select>
            </div>
            <div>
              <label
                class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1"
                >Trap HP</label
              >
              <input
                v-model.number="form.trap_hp"
                type="number"
                min="1"
                placeholder="—"
                class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label
                class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1"
                >Trap AC</label
              >
              <input
                v-model.number="form.trap_ac"
                type="number"
                min="1"
                max="30"
                placeholder="—"
                class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div class="col-span-2 sm:col-span-3">
              <label
                class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1"
                >Damage Immunities</label
              >
              <TagInput
                v-model="form.damage_immunities"
                :suggestions="[...DAMAGE_TYPES]"
                placeholder="Add immunity…"
              />
            </div>
          </div>
        </div>

        <!-- Effect -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span
              class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
              >Effect</span
            >
          </div>
          <div class="p-4 space-y-3">
            <div>
              <label
                class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1"
                >Effect Description</label
              >
              <input
                v-model="form.effect_description"
                placeholder="The trap fires a poisoned dart at the nearest creature…"
                class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <!-- Attack bonus -->
              <div>
                <label
                  class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1"
                  >Attack Bonus</label
                >
                <input
                  v-model.number="form.attack_bonus"
                  type="number"
                  placeholder="+5"
                  class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <!-- Save type + DC -->
              <div>
                <label
                  class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1"
                  >Save Type</label
                >
                <select
                  v-model="form.save_type"
                  class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option :value="null">—</option>
                  <option v-for="s in TRAP_SAVE_TYPES" :key="s" :value="s">
                    {{ s }}
                  </option>
                </select>
              </div>
              <div>
                <label
                  class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1"
                  >Save DC</label
                >
                <input
                  v-model.number="form.save_dc"
                  type="number"
                  min="1"
                  max="30"
                  placeholder="15"
                  class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <!-- Damage entries -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label
                  class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
                  >Damage</label
                >
                <button
                  type="button"
                  class="font-cinzel text-[10px] font-semibold text-primary hover:opacity-80 transition-opacity tracking-wider"
                  @click="addDamageEntry"
                >
                  + Add
                </button>
              </div>
              <div class="flex flex-col gap-2">
                <div
                  v-for="(entry, i) in form.damage_entries"
                  :key="i"
                  class="flex items-center gap-2"
                >
                  <DiceExprInput
                    v-model="entry.dice"
                    placeholder="1d6"
                    compact
                    class="w-28 shrink-0"
                  />
                  <select
                    v-model="entry.type"
                    class="flex-1 bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring capitalize"
                  >
                    <option value="">—</option>
                    <option
                      v-for="d in DAMAGE_TYPES"
                      :key="d"
                      :value="d"
                      class="capitalize"
                    >
                      {{ d }}
                    </option>
                  </select>
                  <button
                    type="button"
                    class="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                    @click="form.damage_entries.splice(i, 1)"
                  >
                    <X class="h-3.5 w-3.5" />
                  </button>
                </div>
                <p
                  v-if="!form.damage_entries.length"
                  class="font-fell text-xs text-muted-foreground italic"
                >
                  No damage — add a component above.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Description -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span
              class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
              >Description</span
            >
          </div>
          <div class="p-3">
            <RichTextEditor
              v-model="form.description"
              placeholder="Flavor text, lore, appearance…"
              min-height="120px"
            />
          </div>
        </div>

        <!-- DM Notes -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span
              class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
              >DM Notes</span
            >
          </div>
          <div class="p-3">
            <RichTextEditor
              v-model="form.notes"
              placeholder="Private notes, encounter ideas, variants…"
              min-height="100px"
            />
          </div>
        </div>
      </div>
    </template>

    <!-- CR Advisor Modal -->
    <Teleport to="body">
      <div
        v-if="showAdvisor"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        @click.self="showAdvisor = false"
        @keydown.escape="showAdvisor = false"
      >
        <div
          class="w-full max-w-lg bg-card border border-border rounded-xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden"
        >
          <!-- Header -->
          <div
            class="flex items-center justify-between px-5 py-4 border-b border-border"
          >
            <h2
              class="font-cinzel text-sm font-bold text-foreground tracking-wider"
            >
              CR Advisor
            </h2>
            <button
              type="button"
              @click="showAdvisor = false"
              class="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
            <!-- Effect category -->
            <div>
              <label
                class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2"
                >Primary Effect</label
              >
              <div class="grid grid-cols-5 gap-1.5">
                <button
                  v-for="cat in EFFECT_CATEGORIES"
                  :key="cat.value"
                  type="button"
                  class="rounded-md border px-2 py-1.5 font-cinzel text-[10px] font-semibold tracking-wider transition-colors text-center"
                  :class="
                    advisorInputs.effectCategory === cat.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  "
                  @click="advisorInputs.effectCategory = cat.value"
                >
                  {{ cat.label }}
                </button>
              </div>
            </div>

            <!-- Damage dice (only for damage) -->
            <div v-if="advisorInputs.effectCategory === 'damage'">
              <label
                class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1"
                >Damage Dice</label
              >
              <DiceExprInput
                v-model="advisorInputs.damageDice"
                placeholder="2d10+3"
              />
            </div>

            <!-- Targeting -->
            <div>
              <label
                class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2"
                >Area of Effect</label
              >
              <div class="grid grid-cols-3 gap-1.5">
                <button
                  v-for="opt in TARGETING_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="rounded-md border px-2 py-1.5 font-cinzel text-[10px] font-semibold tracking-wider transition-colors text-center"
                  :class="
                    advisorInputs.targeting === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  "
                  @click="advisorInputs.targeting = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <!-- DC Tier -->
            <div>
              <label
                class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2"
                >DC Difficulty (highest of detection / save)</label
              >
              <div class="grid grid-cols-4 gap-1.5">
                <button
                  v-for="opt in DC_TIER_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="rounded-md border px-2 py-1.5 font-cinzel text-[10px] font-semibold tracking-wider transition-colors text-center"
                  :class="
                    advisorInputs.dcTier === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  "
                  @click="advisorInputs.dcTier = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <!-- Secondary effect -->
            <div>
              <label
                class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2"
                >Secondary Effect</label
              >
              <div class="grid grid-cols-5 gap-1.5">
                <button
                  v-for="opt in SECONDARY_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="rounded-md border px-2 py-1.5 font-cinzel text-[10px] font-semibold tracking-wider transition-colors text-center"
                  :class="
                    advisorInputs.secondaryEffect === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  "
                  @click="advisorInputs.secondaryEffect = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <!-- Reset + save-or-die -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label
                  class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1"
                  >Reset</label
                >
                <select
                  v-model="advisorInputs.resetType"
                  class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option v-for="r in TRAP_RESET_TYPES" :key="r" :value="r">
                    {{ r }}
                  </option>
                </select>
              </div>
              <div class="flex items-end pb-1">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    v-model="advisorInputs.isInstantDeath"
                    class="accent-primary"
                  />
                  <span class="font-fell text-sm text-foreground"
                    >Save-or-die mechanic</span
                  >
                </label>
              </div>
            </div>

            <!-- Result -->
            <div
              v-if="advisorResult"
              class="rounded-lg border border-border bg-muted/20 p-4 flex flex-col gap-3"
            >
              <div class="flex items-center justify-between">
                <span
                  class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
                  >SUGGESTED CR</span
                >
                <span class="font-cinzel text-2xl font-bold text-primary">{{
                  advisorResult.suggestedCr
                }}</span>
              </div>
              <div
                class="font-cinzel text-[10px] text-muted-foreground tracking-wider"
              >
                Range: CR {{ advisorResult.suggestedMin }} –
                {{ advisorResult.suggestedMax }}
                <span v-if="CR_XP[advisorResult.suggestedCr]" class="ml-2"
                  >({{ CR_XP[advisorResult.suggestedCr] }} XP)</span
                >
              </div>
              <ul class="flex flex-col gap-1">
                <li
                  v-for="(factor, i) in advisorResult.factors"
                  :key="i"
                  class="font-fell text-xs text-muted-foreground flex items-start gap-1.5"
                >
                  <span class="text-primary mt-0.5">·</span>{{ factor }}
                </li>
              </ul>

              <!-- Benchmark reference -->
              <div class="border-t border-border pt-3">
                <div
                  class="font-cinzel text-[10px] text-muted-foreground tracking-wider mb-2"
                >
                  REFERENCE BENCHMARKS
                </div>
                <div class="flex flex-col gap-1">
                  <div
                    v-for="bench in CR_TRAP_BENCHMARKS.slice(0, 5)"
                    :key="bench.cr"
                    class="flex items-start gap-2 font-fell text-xs"
                    :class="
                      bench.cr === advisorResult.suggestedCr
                        ? 'text-primary font-semibold'
                        : 'text-muted-foreground'
                    "
                  >
                    <span class="font-cinzel shrink-0 w-6">{{ bench.cr }}</span>
                    <span class="shrink-0 w-28">{{ bench.label }}</span>
                    <span class="italic">{{ bench.examples }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div
            class="flex items-center justify-end gap-2 px-5 py-4 border-t border-border"
          >
            <button
              type="button"
              class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
              @click="showAdvisor = false"
            >
              Cancel
            </button>
            <button
              v-if="advisorResult"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
              @click="applyCr"
            >
              <Check class="h-3.5 w-3.5" />
              Use CR {{ advisorResult.suggestedCr }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Sparkles, X, Check } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import {
  useTrap,
  useCreateTrap,
  useUpdateTrap,
  useDeleteTrap,
} from "@/composables/useTraps";
import { useConfirm } from "@/composables/useConfirm";
import {
  TRAP_TYPES,
  TRAP_TRIGGERS,
  TRAP_RESET_TYPES,
  TRAP_SAVE_TYPES,
  CR_LIST,
} from "@/types/trap.types";
import type { DamageEntry } from "@/types/trap.types";
import { DAMAGE_TYPES } from "@/types/damage.types";
import { CR_XP } from "@/types/encounter.types";
import { adviseCr, CR_TRAP_BENCHMARKS } from "@/lib/trapAdvisor";
import type {
  TrapEffectCategory,
  TrapTargeting,
  TrapDcTier,
  TrapSecondaryEffect,
} from "@/lib/trapAdvisor";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ImageUpload from "@/components/common/ImageUpload.vue";
import TagInput from "@/components/common/TagInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import DiceExprInput from "@/components/common/DiceExprInput.vue";

// ── Advisor state ──────────────────────────────────────────────────────────────

const showAdvisor = ref(false);

const EFFECT_CATEGORIES: { value: TrapEffectCategory; label: string }[] = [
  { value: "damage", label: "Damage" },
  { value: "condition", label: "Condition" },
  { value: "terrain", label: "Terrain" },
  { value: "alarm", label: "Alarm" },
  { value: "death", label: "Death" },
];

const TARGETING_OPTIONS: { value: TrapTargeting; label: string }[] = [
  { value: "single", label: "Single target" },
  { value: "area_small", label: "Small area (≤3)" },
  { value: "area_large", label: "Large area (4+)" },
];

const DC_TIER_OPTIONS: { value: TrapDcTier; label: string }[] = [
  { value: "low", label: "Low (≤12)" },
  { value: "moderate", label: "Mod (13–16)" },
  { value: "high", label: "High (17–20)" },
  { value: "extreme", label: "Extreme (21+)" },
];

const SECONDARY_OPTIONS: { value: TrapSecondaryEffect; label: string }[] = [
  { value: "none", label: "None" },
  { value: "minor_condition", label: "Minor condition" },
  { value: "major_condition", label: "Major condition" },
  { value: "ongoing_damage", label: "Ongoing damage" },
  { value: "barrier", label: "Barrier / split" },
];

const advisorInputs = reactive({
  effectCategory: "damage" as TrapEffectCategory,
  damageDice: "",
  targeting: "single" as TrapTargeting,
  dcTier: "moderate" as TrapDcTier,
  resetType: "None" as "None" | "Manual" | "Automatic",
  secondaryEffect: "none" as TrapSecondaryEffect,
  isInstantDeath: false,
});

// Pre-fill advisor from form values when opening
watch(showAdvisor, (open) => {
  if (!open) return;
  advisorInputs.damageDice =
    form.value.damage_entries.map((e) => e.dice).join("+") ?? "";
  advisorInputs.resetType = form.value.reset_type;
  const maxDc = Math.max(
    form.value.detection_dc ?? 0,
    form.value.disarm_dc ?? 0,
    form.value.save_dc ?? 0,
  );
  advisorInputs.dcTier =
    maxDc >= 21
      ? "extreme"
      : maxDc >= 17
        ? "high"
        : maxDc >= 13
          ? "moderate"
          : "low";
});

const advisorResult = computed(() =>
  adviseCr({
    ...advisorInputs,
    trapHp: form.value.trap_hp,
    trapAc: form.value.trap_ac,
  }),
);

function applyCr() {
  if (!advisorResult.value) return;
  form.value.cr = advisorResult.value.suggestedCr;
  showAdvisor.value = false;
}

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.name === "trap-new");
const isEdit = computed(() => !isNew.value);
const id = computed(() => route.params.id as string);

const { data: trap, isLoading } = useTrap(id);
const createMut = useCreateTrap();
const updateMut = useUpdateTrap();
const deleteMut = useDeleteTrap();
const { confirm } = useConfirm();

const saving = ref(false);

const blankForm = () => ({
  name: "",
  trap_type: "Mechanical" as const,
  cr: null as string | null,
  trigger_type: null as string | null,
  detection_dc: null as number | null,
  disarm_dc: null as number | null,
  effect_description: null as string | null,
  attack_bonus: null as number | null,
  save_type: null as string | null,
  save_dc: null as number | null,
  damage_entries: [] as DamageEntry[],
  reset_type: "None" as const,
  trap_hp: null as number | null,
  trap_ac: null as number | null,
  damage_immunities: ["poison", "psychic"] as string[],
  image_url: null as string | null,
  image_focal_point: null as { x: number; y: number } | null,
  tags: [] as string[],
  description: null as string | null,
  notes: null as string | null,
});

const form = ref(blankForm());

watch(
  trap,
  (t) => {
    if (t)
      Object.assign(form.value, {
        name: t.name,
        trap_type: t.trap_type,
        cr: t.cr,
        trigger_type: t.trigger_type,
        detection_dc: t.detection_dc,
        disarm_dc: t.disarm_dc,
        effect_description: t.effect_description,
        attack_bonus: t.attack_bonus,
        save_type: t.save_type,
        save_dc: t.save_dc,
        damage_entries: t.damage_entries
          ? t.damage_entries.map((e) => ({ ...e }))
          : [],
        reset_type: t.reset_type,
        trap_hp: t.trap_hp,
        trap_ac: t.trap_ac,
        damage_immunities: [...(t.damage_immunities ?? ["poison", "psychic"])],
        image_url: t.image_url,
        image_focal_point: t.image_focal_point,
        tags: [...(t.tags ?? [])],
        description: t.description
          ? typeof t.description === "string"
            ? t.description
            : JSON.stringify(t.description)
          : null,
        notes: t.notes
          ? typeof t.notes === "string"
            ? t.notes
            : JSON.stringify(t.notes)
          : null,
      });
  },
  { immediate: true },
);

const crXp = computed(() => (form.value.cr ? CR_XP[form.value.cr] : null));

function addDamageEntry() {
  form.value.damage_entries.push({ dice: "", type: "" });
}

async function save() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  try {
    const payload = { ...form.value } as Parameters<
      typeof createMut.mutateAsync
    >[0];
    if (isNew.value) {
      await createMut.mutateAsync(payload);
    } else {
      await updateMut.mutateAsync({ id: id.value, update: payload });
    }
    router.push({ path: "/dungeon-craft", query: { tab: "traps" } });
  } finally {
    saving.value = false;
  }
}

async function deleteTrap() {
  const ok = await confirm(
    `Delete "${form.value.name}"? This cannot be undone.`,
    {
      title: "Delete Trap",
      confirmLabel: "Delete",
      danger: true,
    },
  );
  if (!ok) return;
  await deleteMut.mutateAsync(trap.value!);
  router.push({ path: "/dungeon-craft", query: { tab: "traps" } });
}
</script>
