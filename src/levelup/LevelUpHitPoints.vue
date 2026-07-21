<template>
  <WizardStepCard>
    <template #header>
      <h3 class="font-cinzel text-xs tracking-wider text-muted-foreground uppercase">Hit Points</h3>
      <span class="text-label text-muted-foreground">
        d{{ hitDie }} · CON {{ conMod >= 0 ? '+' : '' }}{{ conMod }}
      </span>
    </template>

    <!-- Mode picker -->
    <div class="flex rounded-md border border-border overflow-hidden w-fit font-cinzel text-xs tracking-wider">
      <button
        class="px-3 py-1.5 transition-colors"
        :class="hpMode === 'average' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
        @click="emit('setMode', 'average')"
      >Average</button>
      <button
        class="px-3 py-1.5 transition-colors"
        :class="hpMode === 'roll' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
        @click="emit('setMode', 'roll')"
      >Roll</button>
      <button
        class="px-3 py-1.5 transition-colors"
        :class="hpMode === 'max' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
        title="House rule — take the hit die's maximum."
        @click="emit('setMode', 'max')"
      >Max</button>
    </div>

    <!-- Roll mode -->
    <template v-if="hpMode === 'roll'">
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-md border border-border bg-muted/40 px-3 py-1.5 font-cinzel text-xs text-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
          :disabled="rolledHp !== null"
          @click="emit('roll')"
        >Roll d{{ hitDie }}</button>
        <span v-if="rolledHp !== null" class="font-fell text-sm text-foreground">
          Rolled <strong class="font-cinzel">{{ rolledHp }}</strong>
          <span class="text-muted-foreground"> + CON {{ conMod >= 0 ? '+' : '' }}{{ conMod }} = </span>
          <strong class="font-cinzel text-primary">{{ Math.max(1, rolledHp + conMod) }}</strong> HP
        </span>
        <span v-else class="font-fell text-xs text-muted-foreground italic">
          Roll once. Minimum 1 HP per level.
        </span>
      </div>
    </template>

    <p v-else class="font-fell text-sm text-muted-foreground">
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
</script>
