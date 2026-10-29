<template>
  <section class="flex flex-col gap-4 rounded-lg border border-border bg-card p-4" aria-label="The rules of this craft">
    <div class="flex items-center gap-3">
      <div class="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
        <FocalImage :src="recipeArt?.url ?? null" :alt="recipe.name" format="landscape" :focal-point="recipeArt?.focalPoint ?? null" :placeholder="placeholderUrl('item')" />
      </div>
      <div class="min-w-0">
        <p class="text-eyebrow text-muted-foreground">Makes</p>
        <p class="truncate text-label-lg font-semibold text-foreground">{{ outputNames.join(", ") || "Nothing listed" }}</p>
      </div>
    </div>

    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-body">
      <dt class="text-muted-foreground">DC</dt>
      <dd class="text-foreground">{{ recipe.dc }}</dd>
      <dt class="text-muted-foreground">Time</dt>
      <dd class="text-foreground">{{ craftingTimeText(recipe.crafting_time, recipe.crafting_time_unit) }}</dd>
      <dt class="text-muted-foreground">Roll</dt>
      <dd class="text-foreground">{{ rollLine }}</dd>
      <dt class="text-muted-foreground">Tools</dt>
      <dd :class="hasTools ? 'text-foreground' : 'text-tone-caution'">{{ toolsLine }}</dd>
      <dt class="text-muted-foreground">Proficient</dt>
      <dd :class="hasProficiency ? 'text-foreground' : 'text-tone-caution'">{{ hasProficiency ? "Yes" : "No" }}</dd>
    </dl>

    <p v-if="lockLine" class="flex items-start gap-2 text-caption text-destructive">
      <IconWarning class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{{ lockLine }}
    </p>

    <fieldset class="flex flex-col gap-1.5">
      <legend class="mb-1 text-eyebrow text-muted-foreground">Your situation</legend>
      <AppCheckbox v-if="discipline.workspaceBonus > 0" v-model="workspaceEnabled" :disabled="done" label-layout="row">
        <span>{{ discipline.workspaceLabel }}</span>
        <span class="ml-auto shrink-0 font-semibold text-primary">+{{ discipline.workspaceBonus }}</span>
      </AppCheckbox>
      <!-- Read-only: the quality of the stacks the plan spends, set by the player's choice in the picker. -->
      <!-- Shown whenever a spent row is not standard, even at ±0: Fine and Poor stock can cancel out, and a missing line would read as quality not counting. -->
      <p v-if="qualityLine" class="flex items-baseline gap-2 text-body text-foreground" data-testid="quality-line">
        <span>{{ qualityLine }}</span>
        <span class="ml-auto shrink-0 font-semibold" :class="qualityMod < 0 ? 'text-destructive' : qualityMod > 0 ? 'text-primary' : 'text-muted-foreground'">{{ qualityMod < 0 ? "\u2212" : qualityMod > 0 ? "+" : "\u00b1" }}{{ Math.abs(qualityMod) }}</span>
      </p>
      <AppCheckbox
        v-for="(mod, idx) in modifiers"
        :key="idx"
        :model-value="selectedModifiers.has(idx)"
        :disabled="done"
        label-layout="row"
        @update:model-value="emit('toggleModifier', idx)"
      >
        <span>{{ mod.description }}</span>
        <span class="ml-auto shrink-0 font-semibold text-primary">+{{ mod.bonus }}</span>
      </AppCheckbox>
    </fieldset>

    <p class="text-label-lg text-foreground">d20 {{ signed(totalBonus) }} against DC {{ recipe.dc }}</p>

    <template v-if="!result">
      <p v-if="blockedReason" class="text-caption text-destructive">{{ blockedReason }}</p>
      <AppButton
        variant="primary"
        size="lg"
        block
        :icon="IconDiceRoll"
        label="Attempt craft"
        :loading="attempting"
        :disabled="!canAttempt"
        @click="emit('attempt')"
      />
      <p class="text-caption text-muted-foreground">A success spends every ingredient. A failure costs the time and makes the primary ingredient one step worse; a critical failure ruins it.</p>
    </template>

    <div v-else class="flex flex-col gap-2">
      <h2 class="flex items-center gap-2 text-heading-sm font-bold" :class="tone">
        <component :is="outcomeIcon" class="h-5 w-5 shrink-0" aria-hidden="true" />{{ title }}
      </h2>
      <p class="text-body text-foreground">{{ rolledText }}</p>
      <p class="text-caption text-muted-foreground">{{ detail }}</p>
      <!-- The post is sent after the roll lands, and can fail on its own; chatNotice then says so. -->
      <p v-if="!attempting && !chatNotice" class="text-caption text-muted-foreground">Posted to the campaign chat.</p>
      <template v-if="result.outcome === 'success'">
        <AppButton variant="primary" size="md" block label="Done" :to="{ name: 'play-crafting' }" />
      </template>
      <template v-else>
        <p v-if="!canAttempt" class="text-caption text-destructive">You no longer have what this recipe needs.</p>
        <AppButton variant="primary" size="md" block label="Try again" :disabled="!canAttempt" @click="emit('retry')" />
        <AppButton variant="ghost" size="md" block label="Done" :to="{ name: 'play-crafting' }" />
      </template>
    </div>

    <p v-if="attemptError" class="flex items-start gap-2 text-caption text-destructive">
      <IconWarning class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{{ attemptError }}
    </p>
    <p v-if="chatNotice" class="text-caption text-muted-foreground">{{ chatNotice }}</p>

    <p class="sr-only" role="status" aria-live="polite">{{ result ? `${title}. ${rolledText}` : "" }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { IconCheckCircle, IconCloseCircle, IconDiceRoll, IconWarning } from "@/lib/icons";
import type { DisciplineConfig } from "@/lib/crafting/disciplines";
import { craftBonus, outcomeDetail, rolledLine, signed } from "@/lib/crafting/craftMessage";
import type { IngredientSlot } from "@/lib/crafting/ingredients";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import type { RecipeArt } from "@/lib/crafting/recipeArt";
import { craftingTimeText } from "@/lib/crafting/craftingTime";
import type { CraftingAttemptResult, CraftingModifier, CraftingRecipe } from "@/types/crafting.types";

const {
  recipe, discipline, modifiers, slots, abilityMod, profBonus, hasProficiency, hasTools, modifierBonuses,
  selectedModifiers, canAttempt, attempting, result, outputNames, recipeArt, short, qualityMod, qualityLine, fine, degradeLine, primaryTouched,
} = defineProps<{
  recipe: CraftingRecipe;
  discipline: DisciplineConfig;
  modifiers: readonly CraftingModifier[];
  slots: readonly IngredientSlot[];
  abilityMod: number;
  profBonus: number;
  hasProficiency: boolean;
  hasTools: boolean;
  modifierBonuses: readonly number[];
  selectedModifiers: ReadonlySet<number>;
  canAttempt: boolean;
  attempting: boolean;
  result: CraftingAttemptResult | null;
  outputNames: readonly string[];
  recipeArt: RecipeArt | null;
  /** A stack shared by two slots cannot fill both. */
  short: boolean;
  /** The roll modifier from the quality of the stacks the plan spends. */
  qualityMod: number;
  /** "Poor leather, fine ingots": the non-standard materials behind it; null when all are standard. */
  qualityLine: string | null;
  /** The roll beat the DC by 10 or more, so the outputs are Fine. */
  fine: boolean;
  /** What a failure did to the primary ingredient ("Your Iron Ingot is now Poor."). */
  degradeLine: string | null;
  /** False when the attempt consumed nothing, so no ingredient was degraded or ruined. */
  primaryTouched: boolean;
  attemptError: string | null;
  chatNotice: string | null;
}>();

const emit = defineEmits<{ attempt: []; retry: []; toggleModifier: [idx: number] }>();
const workspaceEnabled = defineModel<boolean>("workspace", { required: true });

const done = computed(() => result !== null);
const ability = computed(() => discipline.ability.toUpperCase());
const totalBonus = computed(() => craftBonus(abilityMod, profBonus, hasProficiency, modifierBonuses));

const rollLine = computed(
  () => `d20 ${signed(abilityMod)} ${ability.value}` + (hasProficiency ? ` + proficiency ${profBonus}` : " (no proficiency)"),
);
const tool = computed(() => discipline.tools[0]);
const toolsLine = computed(() => (hasTools ? `${tool.value}, in your pack` : `No ${tool.value}: you roll with disadvantage`));

const lockLine = computed(() => {
  if (recipe.requires_proficiency && !hasProficiency) return `This recipe needs ${tool.value} proficiency.`;
  if (recipe.requires_tools && !hasTools) return `This recipe needs ${tool.value} in your pack.`;
  return null;
});

const blockedReason = computed(() => {
  const missing = slots.filter((s) => !s.met).map((s) => s.name);
  if (missing.length > 0) return `Missing: ${missing.join(", ")}.`;
  if (short) return "One stack is shared between two ingredients and runs short.";
  return null;
});

const title = computed(() => (!result ? "" : result.outcome === "success" ? "Success" : result.outcome === "ruin" ? "Critical failure" : "Failed"));
const tone = computed(() => (!result ? "" : result.outcome === "success" ? "text-tone-success" : result.outcome === "ruin" ? "text-destructive" : "text-muted-foreground"));
const outcomeIcon = computed(() => (result?.outcome === "success" ? IconCheckCircle : IconCloseCircle));
const detail = computed(() => (result ? [outcomeDetail(result.outcome, outputNames, { fine, primaryTouched }), result.outcome === "fail" ? degradeLine : null].filter(Boolean).join(" ") : ""));
const rolledText = computed(() => (result ? rolledLine(result, totalBonus.value, recipe.dc) : ""));
</script>
