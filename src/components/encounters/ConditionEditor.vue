<template>
  <Teleport to="body">
    <Transition name="cond-editor">
      <div
        v-if="open"
        ref="floatingRef"
        :style="floatingStyle"
        data-slip
        class="cond-editor"
        role="dialog"
        :aria-label="isNew ? 'New condition' : `Edit ${condition?.name}`"
        @click.stop
        @keydown.enter.prevent="submit"
      >
        <header class="cond-editor-head">
          <AppInput
            v-if="isNew"
            v-model="name"
            size="sm"
            placeholder="Condition name, e.g. Burning"
            aria-label="Condition name"
          />
          <h3 v-else class="cond-editor-title">{{ condition?.name }}</h3>
        </header>

        <section class="cond-editor-section">
          <label class="cond-editor-field">
            <span class="cond-editor-label">Applied by</span>
            <AppSelect v-model="sourceModel" size="xs" block aria-label="Source of the condition">
              <option value="">Nobody</option>
              <option v-for="c in others" :key="c.id" :value="c.id">{{ c.name }}</option>
            </AppSelect>
          </label>
          <label class="cond-editor-field">
            <span class="cond-editor-label">Spell or ability</span>
            <AppInput v-model="spell" size="xs" placeholder="Hold Person" />
          </label>
          <AppCheckbox
            v-model="concentration"
            size="sm"
            label="Held by concentration"
            label-role="caption"
            :disabled="!sourceId"
          />
        </section>

        <section class="cond-editor-section">
          <span class="cond-editor-label">Ends</span>
          <SegmentedControl v-model="endsKind" :options="ENDS_OPTIONS" size="xs" block />

          <div v-if="endsKind === 'turn'" class="cond-editor-row">
            <SegmentedControl v-model="turnAt" :options="EDGE_OPTIONS" size="xs" />
            <span class="cond-editor-hint">of</span>
            <SegmentedControl v-model="turnOf" :options="turnOfOptions" size="xs" />
            <span class="cond-editor-hint">next turn</span>
          </div>

          <div v-else-if="endsKind === 'rounds'" class="cond-editor-row">
            <AppInput v-model.number="rounds" type="number" min="1" size="xs" :block="false" align="center" class="w-16" aria-label="Rounds" />
            <span class="cond-editor-hint">rounds, counted down on the source's turn</span>
          </div>

          <div v-else-if="endsKind === 'save'" class="cond-editor-row">
            <AppSelect v-model="saveAbility" size="xs" aria-label="Save ability">
              <option v-for="a in SAVE_ABILITIES" :key="a" :value="a">{{ a.toUpperCase() }}</option>
            </AppSelect>
            <span class="cond-editor-hint">DC</span>
            <AppInput v-model.number="saveDc" type="number" min="1" size="xs" :block="false" align="center" class="w-16" aria-label="Save DC" />
            <SegmentedControl v-model="saveAt" :options="EDGE_OPTIONS" size="xs" />
            <span class="cond-editor-hint">of its turn</span>
          </div>
        </section>

        <section class="cond-editor-section">
          <span class="cond-editor-label">Damage each turn</span>
          <div class="cond-editor-row">
            <AppInput v-model="ongoingDice" size="xs" :block="false" class="w-24" placeholder="2d6" aria-label="Ongoing damage dice" />
            <AppSelect v-model="ongoingType" size="xs" aria-label="Ongoing damage type">
              <option value="">untyped</option>
              <option v-for="t in DAMAGE_TYPES" :key="t" :value="t">{{ t }}</option>
            </AppSelect>
            <SegmentedControl v-model="ongoingAt" :options="EDGE_OPTIONS" size="xs" />
          </div>
          <p v-if="diceError" class="cond-editor-error">That is not a dice expression. Try 2d6 or 1d4+2.</p>
        </section>

        <footer class="cond-editor-foot">
          <AppButton v-if="!isNew" variant="link" tone="danger" size="inline-xs" label="Remove" @click="emit('remove', condition!.name)" />
          <span class="flex-1" />
          <AppButton variant="ghost" size="xs" label="Cancel" @click="emit('close')" />
          <AppButton variant="primary" size="xs" label="Save" :disabled="!canSave" @click="submit" />
        </footer>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { buildCondition, conditionToForm, type ConditionForm } from "@/lib/encounters/conditionForm";
import { parseExpression } from "@/lib/dice/dice";
import { DAMAGE_TYPES } from "@/types/damage.types";
import { SAVE_ABILITIES } from "@/types/statBlock.types";
import type { AppliedCondition, TurnEdge } from "@/types/condition.types";

/**
 * Edits one condition record (#1018): who applied it, what ends it, what it
 * deals each turn. Presentational: the caller owns the store and decides what
 * Save and Remove do. `condition` null means a new, named condition.
 */
const { open, anchor, condition, others, concentrationOf } = defineProps<{
  open: boolean;
  anchor: Element | null;
  condition: AppliedCondition | null;
  /** Every other combatant: the choices for the source. */
  others: Array<{ id: string; name: string }>;
  /** The spell a combatant is concentrating on right now (a party member's sheet), for prefilling. */
  concentrationOf: (combatantId: string) => string | null;
}>();

const emit = defineEmits<{
  save: [condition: AppliedCondition];
  remove: [name: string];
  close: [];
}>();

const ENDS_OPTIONS: SegmentedOption<ConditionForm["endsKind"]>[] = [
  { value: "none", label: "Until removed" },
  { value: "turn", label: "Turn" },
  { value: "rounds", label: "Rounds" },
  { value: "save", label: "Save" },
];
const EDGE_OPTIONS: SegmentedOption<TurnEdge>[] = [
  { value: "start", label: "Start" },
  { value: "end", label: "End" },
];

const anchorRef = computed(() => anchor);
const { floatingRef, floatingStyle } = useAnchoredPopover(anchorRef, computed(() => open), () => emit("close"));

const isNew = computed(() => condition === null);

const name = ref("");
const sourceId = ref("");
const spell = ref("");
const concentration = ref(false);
const endsKind = ref<ConditionForm["endsKind"]>("none");
const turnAt = ref<TurnEdge>("end");
const turnOf = ref<"self" | "source">("self");
const rounds = ref<number>(1);
const saveAbility = ref<(typeof SAVE_ABILITIES)[number]>("wis");
const saveDc = ref<number>(10);
const saveAt = ref<TurnEdge>("end");
const ongoingDice = ref("");
const ongoingType = ref("");
const ongoingAt = ref<TurnEdge>("start");

function load(form: ConditionForm) {
  name.value = form.name;
  sourceId.value = form.sourceId;
  spell.value = form.spell;
  concentration.value = form.concentration;
  endsKind.value = form.endsKind;
  turnAt.value = form.turnAt;
  turnOf.value = form.turnOf;
  rounds.value = form.rounds;
  saveAbility.value = form.saveAbility;
  saveDc.value = form.saveDc;
  saveAt.value = form.saveAt;
  ongoingDice.value = form.ongoingDice;
  ongoingType.value = form.ongoingType;
  ongoingAt.value = form.ongoingAt;
}

watch(
  () => open,
  (now) => { if (now) load(conditionToForm(condition)); },
  { immediate: true },
);

/** Choosing a source who is concentrating offers their spell, since that is nearly always what this is. */
const sourceModel = computed<string>({
  get: () => sourceId.value,
  set: (id) => {
    sourceId.value = id;
    if (!id) {
      concentration.value = false;
      if (turnOf.value === "source") turnOf.value = "self";
      return;
    }
    const held = concentrationOf(id);
    if (held) {
      spell.value = held;
      concentration.value = true;
    }
  },
});

const turnOfOptions = computed<SegmentedOption<"self" | "source">[]>(() => [
  { value: "self", label: "Its own" },
  { value: "source", label: "Source's", disabled: !sourceId.value, tooltip: sourceId.value ? undefined : "Pick who applied it first" },
]);

const diceError = computed(() => ongoingDice.value.trim() !== "" && parseExpression(ongoingDice.value) === null);

const form = computed<ConditionForm>(() => ({
  name: name.value,
  level: condition?.level,
  sourceId: sourceId.value,
  spell: spell.value,
  concentration: concentration.value,
  endsKind: endsKind.value,
  turnAt: turnAt.value,
  turnOf: turnOf.value,
  rounds: rounds.value,
  saveAbility: saveAbility.value,
  saveDc: saveDc.value,
  saveAt: saveAt.value,
  ongoingDice: ongoingDice.value,
  ongoingType: ongoingType.value,
  ongoingAt: ongoingAt.value,
}));

const canSave = computed(() => {
  if (diceError.value) return false;
  if (isNew.value && name.value.trim() === "") return false;
  if (endsKind.value === "rounds" && !(rounds.value >= 1)) return false;
  if (endsKind.value === "save" && !(saveDc.value >= 1)) return false;
  return true;
});

function submit() {
  if (!open || !canSave.value) return;
  emit("save", buildCondition(form.value));
}
</script>

<style scoped>
@reference "@/assets/main.css";

.cond-editor {
  z-index: 300;
  width: min(22rem, calc(100vw - 1.5rem));
  @apply bg-card border border-border rounded-lg shadow-xl;
}

.cond-editor-head { @apply px-3 pt-3 pb-1; }
.cond-editor-title { @apply text-heading-sm font-semibold text-foreground; }

.cond-editor-section {
  @apply flex flex-col gap-1.5 px-3 py-2 border-t border-border/50;
}
.cond-editor-head + .cond-editor-section { @apply border-t-0; }

.cond-editor-field { @apply flex flex-col gap-0.5; }
.cond-editor-label { @apply text-caption text-muted-foreground; }
.cond-editor-hint { @apply text-caption text-muted-foreground; }
.cond-editor-row { @apply flex flex-wrap items-center gap-1.5; }
.cond-editor-error { @apply text-caption text-destructive; }

.cond-editor-foot {
  @apply flex items-center gap-1.5 px-3 py-2 border-t border-border/50;
}

.cond-editor-enter-active,
.cond-editor-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.cond-editor-enter-from,
.cond-editor-leave-to {
  opacity: 0;
  transform: translateY(0.25rem);
}
@media (prefers-reduced-motion: reduce) {
  .cond-editor-enter-active,
  .cond-editor-leave-active { transition: none; }
}
</style>
