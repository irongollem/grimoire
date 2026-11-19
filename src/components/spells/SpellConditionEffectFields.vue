<template>
  <div class="flex flex-col gap-3">
    <label class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Besides damage, this spell</span>
      <AppSelect
        :model-value="verdictValue"
        tone="filled"
        size="body"
        weight="normal"
        @update:model-value="setVerdict"
      >
        <option value="">Not said yet</option>
        <option value="no_condition">Does nothing a fight needs to know</option>
        <option value="condition">Imposes a condition</option>
        <option value="not_simple">Is too involved to state; rule it at the table</option>
      </AppSelect>
    </label>

    <p v-if="summary" class="text-body text-foreground">{{ summary }}</p>

    <template v-if="effect">
      <div class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground">Conditions</span>
        <div class="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          <AppCheckbox
            v-for="name in CONDITION_NAMES"
            :key="name"
            :model-value="effect.conditions"
            :value="name"
            :label="name"
            @update:model-value="setConditions"
          />
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground">Stops spellcasting</span>
        <SegmentedControl
          :model-value="effect.stops_casting ?? 'none'"
          :options="STOPS_OPTIONS"
          wrap
          @update:model-value="(v: string) => patch({ stops_casting: v === 'verbal' || v === 'all' ? v : null })"
        />
      </div>

      <AppCheckbox
        :model-value="effect.speed_zero"
        label="Their speed becomes 0"
        @update:model-value="(on: boolean) => patch({ speed_zero: on })"
      />

      <div class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground">It lands</span>
        <SegmentedControl
          :model-value="effect.applies ?? ''"
          :options="APPLIES_OPTIONS"
          wrap
          @update:model-value="setApplies"
        />
        <span v-if="effect.applies === 'failed_save' && spellAbility === null" class="text-caption text-muted-foreground">
          Set the saving throw above.
        </span>
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground">Who it reaches</span>
        <SegmentedControl
          :model-value="effect.targets?.kind ?? ''"
          :options="TARGET_OPTIONS"
          wrap
          @update:model-value="setTargetKind"
        />
        <div v-if="effect.targets && (effect.targets.kind === 'one' || effect.targets.kind === 'several')" class="flex flex-wrap items-center gap-3">
          <label v-if="effect.targets.kind === 'several'" class="flex items-center gap-2">
            <span class="text-caption text-muted-foreground">How many</span>
            <AppInput
              v-model.number="countModel"
              type="number"
              tone="filled"
              size="body"
              :block="false"
              class="w-20"
              aria-label="How many creatures"
            />
          </label>
          <label class="flex items-center gap-2">
            <span class="text-caption text-muted-foreground">More per slot above its level</span>
            <AppInput
              v-model.number="morePerSlotModel"
              type="number"
              tone="filled"
              size="body"
              :block="false"
              class="w-20"
              aria-label="More per slot above its level"
            />
          </label>
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground">
          Only these kinds of creature
          <span class="normal-case font-fell font-normal">(none ticked means any)</span>
        </span>
        <div class="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          <AppCheckbox
            v-for="kind in MONSTER_TYPES"
            :key="kind"
            :model-value="effect.only_kinds"
            :value="kind"
            :label="kind"
            label-class="capitalize"
            @update:model-value="setKinds"
          />
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground">How long</span>
        <SegmentedControl
          :model-value="effect.duration?.unit ?? ''"
          :options="DURATION_OPTIONS_LIST"
          wrap
          @update:model-value="setDurationUnit"
        />
        <label v-if="counted" class="flex items-center gap-2">
          <span class="text-caption text-muted-foreground">How many</span>
          <AppInput
            v-model.number="amountModel"
            type="number"
            tone="filled"
            size="body"
            :block="false"
            class="w-20"
            aria-label="Length of the duration"
          />
        </label>
      </div>

      <SpellConditionEndings :effect="effect" :save-ability="spellAbility" @patch="patch" />
    </template>

    <div v-if="findings.length" class="rounded-md border border-border bg-muted/40 p-3 flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Check against the spell's text</span>
      <ul class="list-disc pl-5 text-caption text-muted-foreground">
        <li v-for="f in findings" :key="f">{{ f }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * What a spell does to a creature besides damage, as the form a Dungeon Master fills in (#1021, row 5b). It edits the
 * entry a fight reads (`SpellConditionEffect`, documented in `curatedSpellConditions.ts`) in plain words, so a
 * homebrew Hold Person can impose Paralyzed. Two things are never asked because the spell already says them: the save
 * ability (the spell's own save) and concentration (the spell's own flag); both are copied in on every change and
 * when either changes. What the form states is checked against the spell's text and reported as advice, never blocked:
 * a DM's own spell is theirs to state.
 */
import { computed, watch } from "vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import SpellConditionEndings from "./SpellConditionEndings.vue";
import { ABILITIES, CONDITION_NAMES, conditionEffectFindings, type Ability } from "@/lib/spells/curatedSpellConditions";
import { conditionEffectText, plainFinding } from "@/lib/spells/conditionEffectText";
import { MONSTER_TYPES } from "@/types/monster.types";
import type { SpellConditionEffect } from "@/types/spell.types";

const model = defineModel<SpellConditionEffect | null>({ required: true });

const { saveAbility, concentration, description, higherLevels } = defineProps<{
  /** The spell's own save ability ("" when it has none). */
  saveAbility: string;
  /** The spell's own concentration flag. */
  concentration: boolean;
  /** The spell's description as plain text, what the entry is checked against. */
  description: string;
  higherLevels: string;
}>();

const STOPS_OPTIONS: SegmentedOption<string>[] = [
  { value: "none", label: "No" },
  { value: "verbal", label: "Spells with a spoken part" },
  { value: "all", label: "All spells" },
];
const APPLIES_OPTIONS: SegmentedOption<string>[] = [
  { value: "failed_save", label: "On a failed save" },
  { value: "hit", label: "On a hit" },
  { value: "automatic", label: "With no roll" },
];
const TARGET_OPTIONS: SegmentedOption<string>[] = [
  { value: "one", label: "One creature" },
  { value: "several", label: "Several creatures" },
  { value: "area", label: "Everyone in its area" },
  { value: "self", label: "The caster" },
];
const DURATION_OPTIONS_LIST: SegmentedOption<string>[] = [
  { value: "instant", label: "Instant" },
  { value: "round", label: "Rounds" },
  { value: "minute", label: "Minutes" },
  { value: "hour", label: "Hours" },
  { value: "until_dispelled", label: "Until dispelled" },
  { value: "special", label: "Something else" },
];

const spellAbility = computed<Ability | null>(() => ABILITIES.find((a) => a === saveAbility) ?? null);

/** The entry while it imposes a condition; the other verdicts have no fields. */
const effect = computed(() => (model.value !== null && model.value.verdict === "condition" ? model.value : null));
const verdictValue = computed(() => model.value?.verdict ?? "");
const summary = computed(() => conditionEffectText(model.value));
const counted = computed(() => {
  const unit = effect.value?.duration?.unit;
  return unit === "round" || unit === "minute" || unit === "hour";
});

// In the form's own words, never the data's field names; what the form cannot get wrong is not shown.
const findings = computed(() =>
  model.value === null
    ? []
    : conditionEffectFindings(model.value, { description, higher_levels: higherLevels || null, concentration })
        .map(plainFinding)
        .filter((line): line is string => line !== null),
);

function conditionStart(): SpellConditionEffect {
  return {
    verdict: "condition", conditions: [], stops_casting: null, speed_zero: false, applies: null, save_ability: null,
    targets: null, only_kinds: [], duration: null, repeat_save: null,
    leaves_play: false, ends_when_harmed: null, break_free: null, must_flee: false,
  };
}

/** The two fields the spell already states are copied in, so the entry and the spell cannot disagree. */
function settle(e: SpellConditionEffect): SpellConditionEffect {
  if (e.verdict !== "condition") return e;
  return {
    ...e,
    save_ability: e.applies === "failed_save" ? spellAbility.value : null,
    duration: e.duration === null ? null : { ...e.duration, concentration },
  };
}

function patch(p: Partial<SpellConditionEffect>) {
  const current = effect.value;
  if (current === null) return;
  model.value = settle({ ...current, ...p });
}

// The spell's save or concentration changed under an entry that was already stated: bring it back in line.
watch([spellAbility, () => concentration], () => {
  const current = effect.value;
  if (current === null) return;
  const next = settle(current);
  if (JSON.stringify(next) !== JSON.stringify(current)) model.value = next;
});

function setVerdict(value: string) {
  if (value === verdictValue.value) return;
  if (value === "condition") model.value = settle(conditionStart());
  else if (value === "no_condition" || value === "not_simple") {
    model.value = {
      verdict: value, conditions: [], stops_casting: null, speed_zero: false, applies: null, save_ability: null,
      targets: null, only_kinds: [], duration: null, repeat_save: null,
    };
  } else model.value = null;
}

function setConditions(picked: string[]) {
  patch({ conditions: CONDITION_NAMES.filter((n) => picked.includes(n)) });
}
function setKinds(picked: string[]) {
  patch({ only_kinds: MONSTER_TYPES.filter((k) => picked.includes(k)) });
}
function setApplies(value: string) {
  if (value === "failed_save" || value === "hit" || value === "automatic") patch({ applies: value });
}
function setTargetKind(kind: string) {
  const current = effect.value?.targets;
  const more = current?.more_per_slot_above ?? 0;
  if (kind === "one" || kind === "self") patch({ targets: { kind, count: 1, more_per_slot_above: kind === "one" ? more : 0 } });
  else if (kind === "several") patch({ targets: { kind, count: Math.max(2, current?.count ?? 2), more_per_slot_above: more } });
  else if (kind === "area") patch({ targets: { kind, count: null, more_per_slot_above: 0 } });
}
const countModel = computed<number | null>({ get: () => effect.value?.targets?.count ?? null, set: setCount });
const morePerSlotModel = computed<number | null>({ get: () => effect.value?.targets?.more_per_slot_above ?? 0, set: setMorePerSlot });
const amountModel = computed<number | null>({ get: () => effect.value?.duration?.amount ?? null, set: setDurationAmount });

function setCount(value: number | null) {
  const current = effect.value?.targets;
  if (!current || current.kind !== "several") return;
  // Several is two or more: a smaller number (or an emptied box) is a count of 2, never an entry the fight would refuse.
  patch({ targets: { ...current, count: Math.max(2, Math.floor(value ?? 2)) } });
}
function setMorePerSlot(value: number | null) {
  const current = effect.value?.targets;
  if (!current) return;
  patch({ targets: { ...current, more_per_slot_above: Math.max(0, Math.floor(value ?? 0)) } });
}
function setDurationUnit(unit: string) {
  if (unit !== "instant" && unit !== "round" && unit !== "minute" && unit !== "hour" && unit !== "until_dispelled" && unit !== "special") return;
  const isCounted = unit === "round" || unit === "minute" || unit === "hour";
  const kept = effect.value?.duration?.amount ?? null;
  patch({ duration: { unit, amount: isCounted ? (kept ?? 1) : null, concentration } });
}
function setDurationAmount(value: number | null) {
  const current = effect.value?.duration;
  if (!current) return;
  patch({ duration: { ...current, amount: Math.max(1, Math.floor(value ?? 1)) } });
}
</script>
