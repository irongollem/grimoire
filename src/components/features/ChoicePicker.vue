<template>
  <section class="space-y-3" :aria-label="due.choice.label">
    <header class="flex items-baseline justify-between gap-2">
      <div class="min-w-0">
        <h4 class="text-label-lg font-semibold text-foreground">{{ due.choice.label }}</h4>
        <p class="text-caption text-muted-foreground">{{ due.featureName }}</p>
      </div>
      <span
        v-if="due.picks > 0 && !isAsi"
        class="shrink-0 text-label-lg font-bold tabular-nums"
        :class="enoughPicked ? 'text-ink-success' : 'text-primary'"
      >
        {{ value.picks.length }} / {{ needed }}
      </span>
    </header>

    <template v-if="isAsi">
      <SegmentedControl
        :model-value="value.asi?.mode ?? ''"
        :options="asiModes"
        block
        size="body"
        @update:model-value="setAsiMode"
      />
      <ChoiceAbilityGrid
        v-if="value.asi !== null && value.asi.mode !== 'feat'"
        :model-value="{ primary: value.asi.primary, secondary: value.asi.secondary }"
        :scores="context.abilityScores"
        :allowed="ABILITIES"
        :single="value.asi.mode === 'plus2' ? 2 : 1"
        :pair="value.asi.mode === 'plus1plus1' ? 1 : null"
        :max="ASI_MAX"
        label="Abilities to raise"
        @update:model-value="setAsiAbilities"
      />
      <p v-if="value.asi?.mode === 'plus1plus1'" class="text-caption text-muted-foreground">
        Choose two different abilities.
      </p>
    </template>

    <template v-if="listed">
      <p v-if="needed === 0 && due.picks > 0" class="text-caption text-muted-foreground italic">
        Nothing is left to choose from.
      </p>
      <AppInput
        v-if="due.picks > 0 && options.length > SEARCH_FROM"
        v-model="search"
        type="search"
        tone="muted"
        size="sm"
        :placeholder="`Search ${due.choice.label.toLowerCase()}`"
      />
      <ul v-if="due.picks > 0" class="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
        <li v-for="option in shown" :key="option.value">
          <AppButton
            variant="menu"
            size="body"
            block
            :active="value.picks.includes(option.value)"
            :disabled="blocked(option)"
            :aria-pressed="value.picks.includes(option.value)"
            class="gap-2 px-3 py-2"
            @click="toggle(option.value)"
          >
            <span class="min-w-0 flex-1">
              <span class="block text-caption font-semibold">{{ option.label }}</span>
              <span v-if="option.unavailable !== null" class="block text-caption-sm text-muted-foreground">
                {{ option.unavailable }}
              </span>
            </span>
            <span v-if="value.picks.includes(option.value)" class="shrink-0 text-label text-primary">Chosen</span>
          </AppButton>
        </li>
        <li v-if="shown.length === 0" class="px-3 py-3 text-caption text-muted-foreground italic">
          Nothing matches.
        </li>
      </ul>
    </template>

    <div v-if="pickedFeat !== null" class="space-y-2 rounded-md border border-border/60 bg-muted/30 p-3">
      <p class="text-label-lg font-semibold">{{ pickedFeat.name }}</p>
      <RichTextViewer v-if="pickedFeat.description" :content="pickedFeat.description" />
      <template v-if="increase !== null">
        <p class="text-caption text-muted-foreground">
          {{ increase.split ? "Raise one ability by 2, or two by 1." : `Raise one ability by ${increase.amount}.` }}
        </p>
        <ChoiceAbilityGrid
          :model-value="value.ability"
          :scores="context.abilityScores"
          :allowed="increase.abilities"
          :single="increase.amount"
          :pair="increase.split ? 1 : null"
          :max="increase.max"
          label="Ability this feat raises"
          @update:model-value="setFeatAbility"
        />
      </template>
    </div>

    <div v-if="due.replaceAllowed" class="space-y-2">
      <AppButton
        variant="link"
        size="inline"
        :label="value.replace === null ? 'Swap an earlier pick' : 'Keep my earlier picks'"
        @click="toggleReplace"
      />
      <div v-if="value.replace !== null" class="space-y-2 rounded-md border border-border/60 p-3">
        <label class="block space-y-1">
          <span class="text-caption text-muted-foreground">Give up</span>
          <AppSelect
            :model-value="value.replace.from"
            size="body"
            weight="normal"
            block
            aria-label="Pick to give up"
            @update:model-value="setReplaceFrom"
          >
            <option value="" disabled>Choose a pick</option>
            <option v-for="old in due.existing" :key="old" :value="old">{{ labelOf(old) }}</option>
          </AppSelect>
        </label>
        <label class="block space-y-1">
          <span class="text-caption text-muted-foreground">Take instead</span>
          <EntityCombobox
            :model-value="value.replace.to"
            :options="replacementOptions"
            placeholder="Search"
            @update:model-value="setReplaceTo"
          />
        </label>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import type { AbilityKey } from "@/rules/characterCreation";
import type { ChoiceOption, DueChoice, OptionContext } from "@/rules/features/levelUpChoices";
import type { ClassFeature } from "@/types/feature.types";
import ChoiceAbilityGrid from "./ChoiceAbilityGrid.vue";
import {
  entryTakesFeat,
  featIncrease,
  optionsForDue,
  type AbilityPick,
  type AsiPickMode,
  type ChoiceValue,
} from "./choiceValue";

/** Past this many options a search box earns its place. */
const SEARCH_FROM = 12;
const ABILITIES: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];
/** An Ability Score Improvement never takes a score past this. */
const ASI_MAX = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const { due, context, modelValue, featsAllowed = true } = defineProps<{
  due: DueChoice;
  /** Without `existing`: the picker adds the entry's own. */
  context: Omit<OptionContext, "existing">;
  modelValue: ChoiceValue;
  /** The `feats_2014` rule; only an Ability Score Improvement reads it. */
  featsAllowed?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: ChoiceValue] }>();

const value = computed(() => modelValue);
const search = ref("");

const isAsi = computed(() => due.choice.pick.kind === "asi_or_feat");
const takesFeat = computed(() => entryTakesFeat(due, value.value));
/** Whether an option list is shown: every kind but a plain ASI, and an ASI only once it takes a feat. */
const listed = computed(() => !isAsi.value || takesFeat.value);

const asiModes = computed(() => {
  const modes: { value: AsiPickMode; label: string }[] = [
    { value: "plus2", label: "+2 to one" },
    { value: "plus1plus1", label: "+1 to two" },
  ];
  if (featsAllowed) modes.push({ value: "feat", label: "Feat" });
  return modes;
});

const options = computed<ChoiceOption[]>(() => optionsForDue(due, value.value, context));

const shown = computed(() => {
  const q = search.value.toLowerCase().trim();
  return q === "" ? options.value : options.value.filter((o) => o.label.toLowerCase().includes(q));
});

const featsById = computed(() => new Map(context.feats.map((f) => [f.id, f])));
const selectable = computed(() => options.value.filter((o) => o.unavailable === null).length);
const needed = computed(() => (isAsi.value ? 1 : Math.min(due.picks, selectable.value)));
/** A feat entry that owes one feat swaps its pick rather than stacking a second. */
const singleFeat = computed(() => takesFeat.value && needed.value <= 1);
const enoughPicked = computed(() => value.value.picks.length >= needed.value);

const pickedFeat = computed<ClassFeature | null>(() => {
  if (!takesFeat.value || value.value.picks.length === 0) return null;
  return featsById.value.get(value.value.picks[0]) ?? null;
});
const increase = computed(() => featIncrease(pickedFeat.value ?? undefined));

const replacementOptions = computed(() =>
  options.value
    .filter((o) => o.unavailable === null && !value.value.picks.includes(o.value))
    .map((o) => ({ id: o.value, name: o.label })),
);

function labelOf(optionValue: string): string {
  const found = options.value.find((o) => o.value === optionValue);
  if (found) return found.label;
  return UUID.test(optionValue) ? "Earlier pick" : optionValue;
}

// A pick already made stays clickable so it can be undone; the rest wait for the reason to clear.
function blocked(option: ChoiceOption): boolean {
  if (value.value.picks.includes(option.value)) return false;
  if (option.unavailable !== null || option.value === value.value.replace?.to) return true;
  return !singleFeat.value && value.value.picks.length >= needed.value;
}

function update(patch: Partial<ChoiceValue>) {
  emit("update:modelValue", { ...modelValue, ...patch });
}

function toggle(optionValue: string) {
  const picks = value.value.picks;
  if (picks.includes(optionValue)) {
    update({ picks: picks.filter((p) => p !== optionValue), ability: { primary: null, secondary: null } });
    return;
  }
  // One feat at a time: picking another replaces it, since each carries its own text and ability.
  update({ picks: singleFeat.value ? [optionValue] : [...picks, optionValue], ability: { primary: null, secondary: null } });
}

function setAsiMode(mode: string) {
  const asi = { mode: mode as AsiPickMode, primary: null, secondary: null };
  update({ asi, picks: [], ability: { primary: null, secondary: null } });
}

function setAsiAbilities(pick: AbilityPick) {
  if (value.value.asi === null) return;
  update({ asi: { ...value.value.asi, primary: pick.primary, secondary: pick.secondary } });
}

function setFeatAbility(pick: AbilityPick) {
  update({ ability: pick });
}

function toggleReplace() {
  update({ replace: value.value.replace === null ? { from: "", to: "" } : null });
}

function setReplaceFrom(from: string) {
  update({ replace: { from, to: value.value.replace === null ? "" : value.value.replace.to } });
}

function setReplaceTo(to: string) {
  update({ replace: { from: value.value.replace === null ? "" : value.value.replace.from, to } });
}
</script>
