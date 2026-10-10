<template>
  <div class="flow">
    <RunnerResolveTargets
      v-model="selected"
      :attacker="attacker"
      :candidates="candidates"
      :multiple="false"
      :detail="(c) => `AC ${resolution.armorClassFor(c) ?? '?'}`"
      :disabled="locked"
      label="Target"
    />

    <div class="flow-options">
      <SegmentedControl
        v-if="attack.delivery === 'melee_or_ranged'"
        v-model="delivery"
        :options="DELIVERIES"
        size="md"
        :disabled="locked"
      />
      <AppCheckbox
        v-if="placed === null"
        :model-value="within"
        label="Within 5 ft"
        :disabled="locked"
        @update:model-value="manualWithin = $event"
      />
      <AppCheckbox v-model="magical" label="Magical" :disabled="appliedResult !== null" />
    </div>

    <p v-if="modeText" class="flow-mode" :class="modeClass" data-testid="attack-mode">{{ modeText }}</p>

    <AppButton
      v-if="!outcome"
      variant="tinted"
      tone="primary"
      emphasis="solid"
      size="md"
      block
      :label="`Roll attack ${signed(attack.bonus)}`"
      :disabled="!target || rolling"
      data-testid="roll-attack"
      @click="roll"
    />

    <template v-else>
      <RunnerAttackOutcome :outcome="outcome" :locked="appliedResult !== null" @choose="choose" />

      <template v-if="outcome.hit === true">
        <p v-if="attack.hit.length === 0" class="flow-note">
          This attack deals no damage of its own. Its effect is in the text above.
        </p>
        <template v-else>
          <AppButton
            v-if="!amounts"
            variant="tinted"
            tone="danger"
            size="md"
            block
            :label="`Roll damage${outcome.critical ? ' (critical)' : ''}`"
            :disabled="rolling"
            data-testid="roll-damage"
            @click="rollDamage"
          />
          <template v-else>
            <RunnerDamageAmounts v-model="amounts" :preview="preview" :disabled="appliedResult !== null" />
            <AppButton
              v-if="!appliedResult"
              variant="tinted"
              tone="primary"
              emphasis="solid"
              size="md"
              block
              :label="`Apply to ${outcome.target.name}`"
              data-testid="apply-damage"
              @click="apply"
            />
          </template>
        </template>
      </template>

      <RunnerAppliedLine
        v-if="appliedResult"
        :name="appliedResult.target.name"
        :damage="appliedResult"
        :concentration="concentration"
        :can-roll-concentration="canRollConcentration"
        @roll-concentration="rollConcentration"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import RunnerAppliedLine from "@/components/encounters/RunnerAppliedLine.vue";
import RunnerAttackOutcome, { type AttackChoice } from "@/components/encounters/RunnerAttackOutcome.vue";
import RunnerDamageAmounts from "@/components/encounters/RunnerDamageAmounts.vue";
import RunnerResolveTargets from "@/components/encounters/RunnerResolveTargets.vue";
import {
  signed,
  toDamageAmounts,
  toEditable,
  type ActionResolution,
  type EditableAmount,
} from "@/components/encounters/runnerResolve";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import type {
  AttackOutcome,
  ConcentrationCheck,
  DamageApplied,
} from "@/composables/encounters/useActionResolution";
import type { RollMode } from "@/lib/dice/dice";
import { targetCandidates, withinFiveFeet } from "@/lib/encounters/actionTargeting";
import { attackRollMode } from "@/rules/combat/attackRoll";
import { applyDefenses } from "@/rules/combat/typedDamage";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { RunCombatant } from "@/types/encounter.types";
import type { AttackStructure, StatBlockEntry } from "@/types/statBlock.types";

const { attacker, entry, attack, resolution, dmMode, silent } = defineProps<{
  attacker: RunCombatant;
  entry: StatBlockEntry;
  attack: AttackStructure;
  resolution: ActionResolution;
  dmMode: RollMode;
  silent: boolean;
}>();

const emit = defineEmits<{ "first-roll": [] }>();

const DELIVERIES = [
  { value: "melee", label: "Melee" },
  { value: "ranged", label: "Ranged" },
] as const;

const store = useEncounterRunStore();
const { ruleset } = useTableRuleset();

const candidates = computed(() => targetCandidates(attacker, store.combatants));
const first = candidates.value[0];
const selected = ref<string[]>(first ? [first.instance_id] : []);
const target = computed(() => candidates.value.find((c) => c.instance_id === selected.value[0]) ?? null);

// Distance: the map answers when both are placed; otherwise the DM does.
const placed = computed(() => (target.value ? withinFiveFeet(attacker, target.value) : null));
const manualWithin = ref<boolean | null>(null);
const delivery = ref<"melee" | "ranged">(attack.delivery === "ranged" ? "ranged" : "melee");
const effectiveDelivery = computed<"melee" | "ranged">(() =>
  attack.delivery === "melee_or_ranged" ? delivery.value : attack.delivery,
);
const within = computed(() => placed.value ?? manualWithin.value ?? effectiveDelivery.value === "melee");

const magical = ref(false);

const preRoll = computed(() =>
  target.value
    ? attackRollMode({
        attackerConditions: attacker.conditions,
        targetConditions: target.value.conditions,
        delivery: effectiveDelivery.value,
        withinFiveFeet: within.value,
        ruleset: ruleset.value,
        dmMode,
      })
    : null,
);

const outcome = ref<AttackOutcome | null>(null);
const amounts = ref<EditableAmount[] | null>(null);
const appliedResult = ref<DamageApplied | null>(null);
const concentration = ref<ConcentrationCheck | null>(null);
const rolling = ref(false);
const locked = computed(() => outcome.value !== null);

const modeText = computed(() => {
  const m = outcome.value ?? preRoll.value;
  if (!m || m.mode === "normal") return null;
  const label = m.mode === "advantage" ? "Advantage" : "Disadvantage";
  return [label, ...m.reasons].join(" · ");
});
const modeClass = computed(() => {
  const mode = (outcome.value ?? preRoll.value)?.mode;
  return mode === "advantage" ? "text-tone-success" : "text-tone-caution";
});

async function roll() {
  const t = target.value;
  if (!t || rolling.value) return;
  rolling.value = true;
  try {
    const result = await resolution.resolveAttack({
      attacker,
      entry,
      target: t,
      dmMode,
      withinFiveFeet: within.value,
      ...(attack.delivery === "melee_or_ranged" ? { delivery: delivery.value } : {}),
      silent,
    });
    // A cancelled prompt leaves the panel where it was.
    if (!result) return;
    outcome.value = result;
    emit("first-roll");
  } finally {
    rolling.value = false;
  }
}

function choose(choice: AttackChoice) {
  if (!outcome.value) return;
  outcome.value = resolution.overrideAttack(outcome.value, { hit: choice !== "miss", critical: choice === "crit" });
  // The rolled dice depend on the critical, so a changed ruling rolls again.
  amounts.value = null;
}

async function rollDamage() {
  const o = outcome.value;
  if (!o || !o.damageParts || rolling.value) return;
  rolling.value = true;
  try {
    const rolled = await resolution.rollDamage({
      parts: o.damageParts,
      critical: o.critical,
      label: `${entry.name} damage vs ${o.target.name}`,
      senderName: attacker.name,
      silent,
    });
    if (rolled) amounts.value = toEditable(rolled);
  } finally {
    rolling.value = false;
  }
}

const preview = computed(() => {
  const o = outcome.value;
  if (!o || !amounts.value) return null;
  return applyDefenses({
    parts: toDamageAmounts(amounts.value),
    defenses: resolution.defensesFor(o.target),
    properties: magical.value ? ["magical"] : [],
  });
});

function apply() {
  const o = outcome.value;
  if (!o || !amounts.value || appliedResult.value) return;
  appliedResult.value = resolution.applyDamage({
    target: o.target,
    parts: toDamageAmounts(amounts.value),
    defenses: resolution.defensesFor(o.target),
    magical: magical.value,
    critical: o.critical,
  });
}

const canRollConcentration = computed(() =>
  appliedResult.value ? resolution.saveBonusFor(appliedResult.value.target, "con") !== null : false,
);

async function rollConcentration() {
  const applied = appliedResult.value;
  if (!applied) return;
  const check = await resolution.rollConcentration({ target: applied.target, damage: applied.total, silent });
  if (check) concentration.value = check;
}
</script>

<style scoped>
@reference "@/assets/main.css";

.flow {
  @apply flex flex-col gap-2;
}

.flow-options {
  @apply flex flex-wrap items-center gap-x-4 gap-y-1;
}

.flow-mode {
  @apply text-caption font-semibold;
}

.flow-note {
  @apply text-caption text-muted-foreground italic;
}
</style>
