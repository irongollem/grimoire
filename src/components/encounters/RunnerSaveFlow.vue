<template>
  <div class="flow">
    <RunnerResolveTargets
      v-model="selected"
      :attacker="attacker"
      :candidates="candidates"
      :multiple="true"
      :detail="targetDetail"
      :disabled="results !== null"
      label="Targets"
    />

    <div v-if="save.fail.length > 0" class="flow-options">
      <AppCheckbox v-model="magical" label="Magical" :disabled="applied !== null" />
    </div>

    <AppButton
      v-if="!results"
      variant="tinted"
      tone="primary"
      emphasis="solid"
      size="md"
      block
      :label="rollLabel"
      :disabled="selected.length === 0 || rolling"
      data-testid="roll-saves"
      @click="rollSaves"
    />

    <template v-else>
      <RunnerSaveOutcome :results="results" :locked="applied !== null" @override="override" @settle="settle" />

      <template v-if="save.fail.length > 0">
        <AppButton
          v-if="!amounts"
          variant="tinted"
          tone="danger"
          size="md"
          block
          label="Roll damage"
          :disabled="rolling"
          data-testid="roll-damage"
          @click="rollDamage"
        />
        <template v-else>
          <p class="flow-note">
            Rolled once for everyone. {{ save.success === "half" ? "Half on a success." : "Nothing on a success." }}
          </p>
          <RunnerDamageAmounts v-model="amounts" :disabled="applied !== null" />
        </template>
      </template>

      <p v-if="!allSettled" class="flow-note">Waiting on every save before applying.</p>
      <AppButton
        v-if="!applied"
        variant="tinted"
        tone="primary"
        emphasis="solid"
        size="md"
        block
        label="Apply"
        :disabled="!canApply"
        data-testid="apply-save"
        @click="apply"
      />

      <div v-if="applied" class="flow-applied">
        <RunnerAppliedLine
          v-for="a in applied"
          :key="a.target.instance_id"
          :name="a.target.name"
          :damage="a.damage"
          :share="a.share"
          :conditions-applied="a.conditionsApplied"
          :conditions-immune="a.conditionsImmune"
          :concentration="concentration[a.target.instance_id] ?? null"
          :can-roll-concentration="resolution.saveBonusFor(a.target, 'con') !== null"
          @roll-concentration="rollConcentration(a)"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import RunnerAppliedLine from "@/components/encounters/RunnerAppliedLine.vue";
import RunnerDamageAmounts from "@/components/encounters/RunnerDamageAmounts.vue";
import RunnerResolveTargets from "@/components/encounters/RunnerResolveTargets.vue";
import RunnerSaveOutcome from "@/components/encounters/RunnerSaveOutcome.vue";
import {
  signed,
  toDamageAmounts,
  toEditable,
  type ActionResolution,
  type EditableAmount,
} from "@/components/encounters/runnerResolve";
import type {
  ConcentrationCheck,
  SaveApplied,
  SaveTargetResult,
} from "@/composables/encounters/useActionResolution";
import { targetCandidates } from "@/lib/encounters/actionTargeting";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { RunCombatant } from "@/types/encounter.types";
import type { SaveStructure, StatBlockEntry } from "@/types/statBlock.types";

const { attacker, entry, save, resolution, silent } = defineProps<{
  attacker: RunCombatant;
  entry: StatBlockEntry;
  save: SaveStructure;
  resolution: ActionResolution;
  silent: boolean;
}>();

const emit = defineEmits<{ "first-roll": [] }>();

const store = useEncounterRunStore();

const candidates = computed(() => targetCandidates(attacker, store.combatants));
const selected = ref<string[]>([]);
const magical = ref(false);

const results = ref<SaveTargetResult[] | null>(null);
const amounts = ref<EditableAmount[] | null>(null);
const applied = ref<SaveApplied[] | null>(null);
const concentration = reactive<Record<string, ConcentrationCheck | undefined>>({});
const rolling = ref(false);

const abilityLabel = computed(() => save.ability.toUpperCase());
const rollLabel = computed(() => {
  const n = selected.value.length;
  return n === 0 ? "Pick who saves" : `Roll ${abilityLabel.value} saves (${n})`;
});

function targetDetail(c: RunCombatant): string {
  const bonus = resolution.saveBonusFor(c, save.ability);
  return bonus === null ? "player rolls" : `${abilityLabel.value} ${signed(bonus)}`;
}

async function rollSaves() {
  const targets = candidates.value.filter((c) => selected.value.includes(c.instance_id));
  if (targets.length === 0 || rolling.value) return;
  rolling.value = true;
  try {
    results.value = await resolution.resolveSaves({ entry, targets, silent });
    emit("first-roll");
  } finally {
    rolling.value = false;
  }
}

function replaceResult(index: number, next: (r: SaveTargetResult) => SaveTargetResult) {
  if (!results.value) return;
  results.value = results.value.map((r, i) => (i === index ? next(r) : r));
}

function override(index: number, success: boolean) {
  replaceResult(index, (r) => ({ ...r, success }));
}

function settle(index: number, total: number) {
  replaceResult(index, (r) => resolution.settleSave(r, total));
}

async function rollDamage() {
  if (rolling.value) return;
  rolling.value = true;
  try {
    const rolled = await resolution.rollDamage({
      parts: save.fail,
      critical: false,
      label: `${entry.name} damage`,
      senderName: attacker.name,
      silent,
    });
    if (rolled) amounts.value = toEditable(rolled);
  } finally {
    rolling.value = false;
  }
}

const allSettled = computed(() => (results.value ?? []).every((r) => r.success !== null));
const canApply = computed(
  () => allSettled.value && (save.fail.length === 0 || amounts.value !== null),
);

function apply() {
  if (!results.value || applied.value || !canApply.value) return;
  applied.value = resolution.applySaveOutcome({
    entry,
    results: results.value,
    damageParts: amounts.value ? toDamageAmounts(amounts.value) : [],
    magical: magical.value,
  });
}

async function rollConcentration(a: SaveApplied) {
  if (!a.damage) return;
  const check = await resolution.rollConcentration({ target: a.target, damage: a.damage.total, silent });
  if (check) concentration[a.target.instance_id] = check;
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

.flow-note {
  @apply text-caption text-muted-foreground italic;
}

.flow-applied {
  @apply flex flex-col gap-1;
}
</style>
