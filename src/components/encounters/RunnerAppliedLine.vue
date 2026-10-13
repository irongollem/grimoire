<template>
  <div class="applied" :data-testid="`applied-${name}`">
    <p v-if="headline" class="applied-main">{{ headline }}</p>
    <p v-if="dyingLine" class="applied-dying">{{ dyingLine }}</p>
    <p v-for="c in conditionsApplied" :key="`on-${c}`" :class="headline ? 'applied-detail' : 'applied-main'">
      {{ name }} is now {{ c }}<template v-if="conditionEnds[c]"> ({{ conditionEnds[c] }})</template>.
    </p>
    <p v-for="c in conditionsImmune" :key="`imm-${c}`" :class="headline ? 'applied-detail' : 'applied-main'">
      {{ name }} is immune to {{ c }}.
    </p>
    <div v-if="damage && damage.concentrationDc !== null" class="applied-concentration">
      <span>Concentration DC {{ damage.concentrationDc }}</span>
      <template v-if="concentration">
        <span class="applied-detail">
          rolled {{ concentration.total }} · {{ concentration.maintained ? "keeps concentrating" : "loses concentration" }}
        </span>
      </template>
      <AppButton
        v-else-if="canRollConcentration"
        variant="tinted"
        tone="arcane"
        size="sm"
        label="Roll"
        @click="emit('roll-concentration')"
      />
      <span v-else class="applied-detail">Ask the player to roll a Con save.</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import type { ConcentrationCheck, DamageApplied, SaveDamageShare } from "@/composables/encounters/useActionResolution";
import { describeDamageOutcome } from "@/rules/dying";
import type { SrdConditionName } from "@/types/statBlock.types";

const {
  name,
  damage,
  share = null,
  conditionsApplied = [],
  conditionsImmune = [],
  conditionEnds = {},
  dealsDamage = true,
  concentration = null,
  canRollConcentration,
} = defineProps<{
  name: string;
  damage: DamageApplied | null;
  /** Set for a save; an attack has no share. */
  share?: SaveDamageShare | null;
  conditionsApplied?: SrdConditionName[];
  conditionsImmune?: SrdConditionName[];
  /** What ends each applied condition, in the badge's words ("save ends · CON 10"). */
  conditionEnds?: Partial<Record<SrdConditionName, string>>;
  /**
   * False for a save with no damage of its own ("or be paralyzed"): saying it
   * dealt none is noise, so the line speaks of the conditions alone.
   */
  dealsDamage?: boolean;
  concentration?: ConcentrationCheck | null;
  /** A stat-block target is rolled here; a party member rolls at the table. */
  canRollConcentration: boolean;
}>();

const emit = defineEmits<{ "roll-concentration": [] }>();

const headline = computed(() => {
  if (!dealsDamage) return conditionsApplied.length + conditionsImmune.length === 0 ? `${name} is unaffected.` : null;
  const taken = damage ? damage.total : 0;
  if (taken === 0) return `${name} takes no damage.`;
  return `${name} takes ${taken}${share === "half" ? " (half)" : ""}.`;
});

const dyingLine = computed(() => (damage ? describeDamageOutcome(name, damage.total, damage.dying) : null));
</script>

<style scoped>
@reference "@/assets/main.css";

.applied {
  @apply flex flex-col gap-0.5 rounded-md border border-border bg-muted/30 px-2 py-1.5;
}

.applied-main {
  @apply text-body font-semibold text-foreground;
}

.applied-dying {
  @apply text-caption text-tone-danger;
}

.applied-detail {
  @apply text-caption text-muted-foreground;
}

.applied-concentration {
  @apply flex flex-wrap items-center gap-2 text-caption text-foreground;
}
</style>
