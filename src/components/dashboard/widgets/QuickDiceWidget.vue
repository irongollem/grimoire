<template>
  <DashboardWidget title="Dice roller">
    <div class="flex flex-col gap-3 p-3">
      <div class="flex flex-wrap gap-1.5">
        <AppButton
          v-for="button in QUICK_DICE_BUTTONS"
          :key="button.sides"
          variant="subtle"
          surface="card"
          size="xs"
          :icon="DIE_ICONS[button.sides]"
          :label="button.label"
          @click="rollStandard(button)"
        />
      </div>

      <!-- Only d20 reads this (see quickDice.ts's advantageAppliesTo), but the
           toggle stays visible rather than popping in/out around the row above
           — a control that appears and disappears as you click different dice
           reads as broken before it reads as smart. -->
      <SegmentedControl v-model="mode" :options="MODE_OPTIONS" size="xs" block />

      <div class="flex items-center gap-1.5">
        <AppInput
          v-model="expression"
          type="text"
          size="body"
          placeholder="2d6+3"
          class="min-w-0 flex-1"
          @keydown.enter.prevent="rollExpression"
        />
        <AppButton
          variant="subtle"
          surface="card"
          tone="primary"
          size="icon-sm"
          icon-size="md"
          :icon="IconDice"
          :disabled="expressionCheck.status !== 'ready'"
          tooltip="Roll · Enter to roll"
          class="shrink-0"
          @click="rollExpression"
        />
      </div>
      <p v-if="expressionCheck.status === 'invalid'" class="text-caption text-destructive/70">
        Can't parse that expression.
      </p>

      <Transition name="quick-dice-result">
        <div v-if="display" class="flex flex-col items-center gap-1 rounded-lg bg-muted/40 px-3 py-2">
          <DiceResult :value="display.total" :is-crit="display.isCrit" :is-fumble="display.isFumble" />
          <div class="text-label text-muted-foreground">{{ display.label }}</div>
          <div class="mt-0.5 flex flex-wrap items-center justify-center gap-1">
            <span
              v-for="(die, index) in display.dice"
              :key="index"
              class="rounded bg-muted px-1.5 py-0.5 font-cinzel text-xs font-semibold text-foreground"
              :class="die.dropped && 'text-muted-foreground line-through opacity-50'"
              >{{ die.val }}</span
            >
          </div>
        </div>
      </Transition>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
/**
 * Roll dice from the dashboard without opening the sidebar panel (#764).
 *
 * `DiceRoller.vue` already covers the general case — any pool, any modifier —
 * from a trigger that floats over every page. This widget is the narrower,
 * faster sibling for the two things a DM reaches for constantly during a
 * session: one standard die, or a short damage/check expression they already
 * know by heart. Anything more elaborate is one click away in the sidebar.
 *
 * Every roll goes through `@/lib/dice/roller`, never `@/lib/dice/dice`
 * directly, so the dice sound and the future roll-history hook stay wired —
 * see that module's docstring. `quickDice.ts` holds everything that is pure:
 * the button list, the Advantage/Disadvantage-applies-to-d20 rule, expression
 * validation, and reshaping a roll for display.
 *
 * Takes no props: unlike the DM screen card or the roll-table card, there is
 * nothing per-instance to configure — a die is a die.
 */
import { computed, ref, type Component } from "vue";
import DashboardWidget from "@/components/dashboard/DashboardWidget.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/SegmentedControl.vue";
import DiceResult from "@/components/common/DiceResult.vue";
import {
  IconDice,
  IconDie4,
  IconDie6,
  IconDie8,
  IconDie10,
  IconDie12,
  IconDie20,
  IconDie100,
} from "@/lib/icons";
import { rollDice, rollParsed } from "@/lib/dice/roller";
import type { DieSize, RollMode } from "@/lib/dice/dice";
import {
  QUICK_DICE_BUTTONS,
  effectiveMode,
  checkQuickExpression,
  displayStandardRoll,
  displayExpressionRoll,
  type QuickDieButton,
  type QuickRollDisplay,
} from "@/lib/dashboard/quickDice";

const DIE_ICONS: Record<DieSize, Component> = {
  4: IconDie4,
  6: IconDie6,
  8: IconDie8,
  10: IconDie10,
  12: IconDie12,
  20: IconDie20,
  100: IconDie100,
};

const MODE_OPTIONS = [
  { value: "disadvantage", label: "Dis" },
  { value: "normal", label: "Normal" },
  { value: "advantage", label: "Adv" },
] as const satisfies readonly SegmentedOption<RollMode>[];

const mode = ref<RollMode>("normal");
const expression = ref("");
const display = ref<QuickRollDisplay | null>(null);

const expressionCheck = computed(() => checkQuickExpression(expression.value));

function rollStandard(button: QuickDieButton) {
  const usedMode = effectiveMode(button.sides, mode.value);
  const result = rollDice({ [button.sides]: 1 }, 0, usedMode);
  display.value = displayStandardRoll(result);
}

function rollExpression() {
  const check = expressionCheck.value;
  if (check.status !== "ready") return;
  const result = rollParsed(check.parsed);
  display.value = displayExpressionRoll(expression.value.trim(), result);
}
</script>

<style scoped>
.quick-dice-result-enter-active,
.quick-dice-result-leave-active {
  transition: opacity 0.15s ease;
}
.quick-dice-result-enter-from,
.quick-dice-result-leave-to {
  opacity: 0;
}
</style>
