<template>
  <form
    class="roll-editor flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-3"
    @submit.prevent="save"
  >
    <SegmentedControl v-model="draft.kind" :options="KIND_OPTIONS" size="xs" aria-label="Kind of roll" />

    <!-- Attack -->
    <StatBlockAttackFields v-if="attack" :attack="attack" />

    <!-- Save -->
    <StatBlockSaveFields v-if="save_" :save="save_" />

    <!-- Options: "uses one of the following" -->
    <div v-if="draft.kind === 'options'" class="flex flex-col gap-3">
      <div
        v-for="(opt, i) in options"
        :key="i"
        class="flex flex-col gap-3 rounded-md border border-border bg-card/60 p-3"
      >
        <div class="flex items-center gap-2">
          <AppInput v-model="opt.name" tone="filled" size="body" placeholder="Fire Breath" :aria-label="`Option ${i + 1} name`" />
          <SegmentedControl
            :model-value="opt.kind"
            :options="OPTION_KIND_OPTIONS"
            size="xs"
            :aria-label="`Option ${i + 1} kind`"
            @update:model-value="(k) => setOptionKind(opt, k)"
          />
          <AppButton
            variant="ghost"
            tone="danger"
            size="inline-xs"
            icon-size="md"
            :icon="IconClose"
            class="shrink-0"
            :aria-label="`Remove option ${i + 1}`"
            @click="options.splice(i, 1)"
          />
        </div>
        <StatBlockAttackFields v-if="opt.kind === 'attack' && opt.attack" :attack="opt.attack" />
        <StatBlockSaveFields v-if="opt.kind === 'save' && opt.save" :save="opt.save" />
      </div>
      <AppButton variant="link" size="inline" class="self-start" label="+ Add option" @click="addOption" />
    </div>

    <!-- Multiattack -->
    <div v-if="draft.kind === 'multiattack'" class="flex flex-col gap-1.5">
      <span class="field-label">Attacks made</span>
      <div v-for="(step, i) in steps" :key="i" class="flex items-center gap-2">
        <AppInput
          :model-value="step.count"
          type="number"
          min="1"
          tone="filled"
          size="body"
          class="w-20"
          :block="false"
          :aria-label="`Count ${i + 1}`"
          @update:model-value="(v) => (step.count = Math.max(1, toInt(v, 1)))"
        />
        <span class="text-muted-foreground">×</span>
        <AppInput v-model="step.action" tone="filled" size="body" placeholder="Claw" :aria-label="`Action ${i + 1}`" />
        <AppButton
          variant="ghost"
          tone="danger"
          size="inline-xs"
          icon-size="md"
          :icon="IconClose"
          class="shrink-0"
          aria-label="Remove attack"
          @click="steps.splice(i, 1)"
        />
      </div>
      <AppButton
        variant="link"
        size="inline"
        class="self-start"
        label="+ Add attack"
        @click="steps.push({ action: '', count: 1 })"
      />
    </div>

    <!-- Use limits: any kind -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <label class="block">
        <span class="field-label">Recharge from</span>
        <AppInput
          :model-value="draft.recharge?.min ?? ''"
          type="number"
          min="2"
          max="6"
          tone="filled"
          size="body"
          placeholder="None"
          @update:model-value="(v) => setRecharge(v)"
        />
      </label>
      <label class="block">
        <span class="field-label">Uses</span>
        <AppInput
          :model-value="draft.uses?.count ?? ''"
          type="number"
          min="1"
          tone="filled"
          size="body"
          placeholder="At will"
          @update:model-value="(v) => setUses(v)"
        />
      </label>
      <label v-if="draft.uses" class="block">
        <span class="field-label">Per</span>
        <AppSelect v-model="draft.uses.per" tone="filled" size="body">
          <option value="day">Day</option>
          <option value="short_rest">Short rest</option>
          <option value="long_rest">Long rest</option>
        </AppSelect>
      </label>
      <label v-if="showCost" class="block">
        <span class="field-label">Legendary cost</span>
        <AppInput
          :model-value="draft.legendary_cost ?? ''"
          type="number"
          min="1"
          tone="filled"
          size="body"
          placeholder="1"
          @update:model-value="(v) => (draft.legendary_cost = toOptional(v))"
        />
      </label>
    </div>

    <p v-if="problem" class="text-caption text-tone-caution" role="alert">{{ problem }}</p>

    <div class="flex items-center gap-3">
      <AppButton type="submit" variant="primary" size="sm" label="Use this roll" />
      <AppButton variant="link" size="inline" label="Cancel" @click="emit('cancel')" />
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, reactive, watchEffect } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import StatBlockAttackFields from "@/components/common/StatBlockAttackFields.vue";
import StatBlockSaveFields from "@/components/common/StatBlockSaveFields.vue";
import { IconClose } from "@/lib/icons";
import { toInt, toOptional } from "@/lib/statBlock/inputNumbers";
import {
  type ActionKind,
  type ActionOption,
  type ActionStructure,
  type AttackStructure,
  type MultiattackStep,
  type SaveStructure,
} from "@/types/statBlock.types";

const { structure, showCost = false } = defineProps<{
  structure: ActionStructure;
  /** Legendary actions only: show the cost-in-pool field. */
  showCost?: boolean;
}>();

const emit = defineEmits<{
  save: [structure: ActionStructure];
  cancel: [];
}>();

/**
 * The editor for a hand-set roll. It works on a private draft and emits one
 * finished `source: "manual"` structure, so half-typed numbers never reach the
 * stat block (and never get parsed over).
 */
const KIND_OPTIONS: Array<{ value: ActionKind; label: string }> = [
  { value: "attack", label: "Attack" },
  { value: "save", label: "Save" },
  { value: "multiattack", label: "Multiattack" },
  { value: "options", label: "Options" },
  { value: "other", label: "Not rolled" },
];

/** Props arrive as reactive proxies, which structuredClone refuses. */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

const OPTION_KIND_OPTIONS: Array<{ value: "attack" | "save"; label: string }> = [
  { value: "attack", label: "Attack" },
  { value: "save", label: "Save" },
];

const draft = reactive<ActionStructure>(clone(structure));
const options = reactive<ActionOption[]>(structure.options ? clone(structure.options) : []);
const steps = reactive<MultiattackStep[]>(structure.multiattack ? clone(structure.multiattack) : []);

const defaultAttack = (): AttackStructure => ({ delivery: "melee", bonus: 0, reach: 5, hit: [{ dice: "", type: null }] });
const defaultSave = (): SaveStructure => ({ ability: "dex", dc: 10, fail: [], success: "half", conditions: [] });

// Entering a kind makes sure its fields exist; leaving it keeps them until save,
// so flipping the kind back and forth loses nothing.
watchEffect(() => {
  if (draft.kind === "attack") draft.attack ??= defaultAttack();
  if (draft.kind === "save") draft.save ??= defaultSave();
  if (draft.kind === "options" && options.length === 0) options.push(defaultOption(), defaultOption());
});
const attack = computed(() => (draft.kind === "attack" ? draft.attack : undefined));
const save_ = computed(() => (draft.kind === "save" ? draft.save : undefined));

const defaultOption = (): ActionOption => ({ name: "", kind: "save", save: defaultSave() });

function addOption() {
  options.push(defaultOption());
}

function setOptionKind(opt: ActionOption, kind: "attack" | "save") {
  opt.kind = kind;
  if (kind === "attack") opt.attack ??= defaultAttack();
  else opt.save ??= defaultSave();
}

function setRecharge(v: string | number | null | undefined) {
  const min = toOptional(v);
  draft.recharge = min === undefined ? undefined : { min: Math.min(6, Math.max(2, min)), max: 6 };
}

function setUses(v: string | number | null | undefined) {
  const count = toOptional(v);
  draft.uses = count === undefined ? undefined : { count: Math.max(1, count), per: draft.uses?.per ?? "day" };
}

const DICE = /^(\d+d\d+([+-]\d+)?|\d+)$/;

const problem = computed(() => {
  if (draft.kind === "attack") {
    const hit = draft.attack?.hit ?? [];
    if (hit.length === 0 || hit.some((p) => !DICE.test(p.dice))) return "Each damage part needs dice, like 1d6+2.";
  }
  if (draft.kind === "save" && draft.save?.fail.some((p) => !DICE.test(p.dice))) {
    return "Each damage part needs dice, like 8d6.";
  }
  if (draft.kind === "options") {
    if (options.length < 2) return "Options need at least two choices.";
    if (options.some((o) => o.name.trim() === "")) return "Name each option, like Fire Breath.";
    if (options.some((o) => (o.kind === "attack" ? (o.attack?.hit ?? []) : (o.save?.fail ?? [])).some((p) => !DICE.test(p.dice)))) {
      return "Each damage part needs dice, like 12d6.";
    }
  }
  if (draft.kind === "multiattack" && (steps.length === 0 || steps.some((s) => s.action.trim() === ""))) {
    return "Name each attack, like Claw.";
  }
  return null;
});

function save() {
  if (problem.value) return;
  const out: ActionStructure = { kind: draft.kind, source: "manual" };
  if (draft.kind === "attack" && draft.attack) out.attack = clone(draft.attack);
  if (draft.kind === "attack" || draft.kind === "save") {
    if (draft.save && (draft.kind === "save" || structure.save)) out.save = clone(draft.save);
  }
  if (draft.kind === "options") {
    out.options = options.map((o) => ({
      name: o.name.trim(),
      kind: o.kind,
      ...(o.kind === "attack" && o.attack ? { attack: clone(o.attack) } : {}),
      ...(o.kind === "save" && o.save ? { save: clone(o.save) } : {}),
    }));
  }
  if (draft.kind === "multiattack") out.multiattack = steps.map((s) => ({ action: s.action.trim(), count: s.count }));
  if (draft.recharge) out.recharge = { ...draft.recharge };
  if (draft.uses) out.uses = { ...draft.uses };
  if (draft.legendary_cost !== undefined) out.legendary_cost = draft.legendary_cost;
  emit("save", out);
}
</script>

<style scoped>
@reference "@/assets/main.css";

.field-label {
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
</style>
