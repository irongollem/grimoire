<template>
  <WizardStepCard>
    <template #header>
      <h3 class="text-label-lg text-muted-foreground uppercase">Hit Points</h3>
      <span class="text-label text-muted-foreground">
        d{{ hitDie }} · CON {{ conMod >= 0 ? '+' : '' }}{{ conMod }}
      </span>
    </template>

    <!-- Mode picker -->
    <SegmentedControl
      :model-value="hpMode"
      :options="hpModeOptions"
      size="sm"
      @update:model-value="(mode) => emit('setMode', mode)"
    />

    <!-- Roll mode -->
    <template v-if="hpMode === 'roll'">
      <div class="flex items-center gap-2">
        <AppButton
          variant="subtle"
          tone="primary"
          surface="muted"
          size="sm"
          :disabled="rolledHp !== null"
          :label="`Roll d${hitDie}`"
          @click="emit('roll')"
        />
        <span v-if="rolledHp !== null" class="text-body text-foreground">
          Rolled <strong class="font-cinzel">{{ rolledHp }}</strong>
          <span class="text-muted-foreground"> + CON {{ conMod >= 0 ? '+' : '' }}{{ conMod }} = </span>
          <strong class="font-cinzel text-primary">{{ Math.max(1, rolledHp + conMod) }}</strong> HP
        </span>
        <span v-else class="text-caption text-muted-foreground italic">
          Roll once. Minimum 1 HP per level.
        </span>
      </div>
    </template>

    <p v-else class="text-body text-muted-foreground">
      <template v-if="hpMode === 'average'">
        Take the average: <strong class="font-cinzel text-foreground">{{ hpAverageValue }}</strong>
        (½ hit die rounded up, +1) + CON {{ conMod >= 0 ? '+' : '' }}{{ conMod }}
        = <strong class="font-cinzel text-primary">{{ Math.max(1, hpAverageValue + conMod) }}</strong> HP
      </template>
      <template v-else>
        Take the maximum: <strong class="font-cinzel text-foreground">{{ hitDie }}</strong>
        + CON {{ conMod >= 0 ? '+' : '' }}{{ conMod }}
        = <strong class="font-cinzel text-primary">{{ Math.max(1, hitDie + conMod) }}</strong> HP
      </template>
    </p>

    <!-- Totals -->
    <CalloutChip variant="muted" label="MAX HP">
      {{ currentMaxHp }} → <strong class="font-cinzel text-primary">{{ currentMaxHp + hpGain }}</strong>
      <span class="text-muted-foreground ml-1">(+{{ hpGain }})</span>
    </CalloutChip>
    <CalloutChip variant="muted" label="HIT DICE">
      {{ currentHitDice }}d{{ hitDie }} → <strong class="font-cinzel text-primary">{{ newHitDiceCount }}d{{ hitDie }}</strong>
    </CalloutChip>
  </WizardStepCard>
</template>

<script setup lang="ts">
import WizardStepCard from "@/components/common/WizardStepCard.vue";
import CalloutChip from "@/components/common/CalloutChip.vue";
import AppButton from "@/components/common/AppButton.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/SegmentedControl.vue";

const {
  hitDie,
  conMod,
  hpMode,
  rolledHp,
  hpAverageValue,
  hpGain,
  currentMaxHp,
  currentHitDice,
  newHitDiceCount,
} = defineProps<{
  hitDie: number;
  conMod: number;
  hpMode: "average" | "roll" | "max";
  rolledHp: number | null;
  hpAverageValue: number;
  hpGain: number;
  currentMaxHp: number;
  currentHitDice: number;
  newHitDiceCount: number;
}>();

const emit = defineEmits<{
  setMode: [mode: "average" | "roll" | "max"];
  roll: [];
}>();

const hpModeOptions: SegmentedOption<"average" | "roll" | "max">[] = [
  { value: "average", label: "Average" },
  { value: "roll", label: "Roll" },
  { value: "max", label: "Max", tooltip: "House rule — take the hit die's maximum." },
];
</script>
