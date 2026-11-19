<template>
  <div class="flex flex-col gap-3">
    <span class="text-eyebrow text-muted-foreground">It can end early when</span>

    <div class="flex flex-col gap-2">
      <AppCheckbox
        :model-value="effect.repeat_save !== null"
        label="They save again"
        @update:model-value="toggleRepeat"
      />
      <div v-if="effect.repeat_save !== null" class="flex flex-wrap gap-2 pl-6">
        <AppSelect
          :model-value="effect.repeat_save.when"
          tone="filled"
          size="body"
          weight="normal"
          aria-label="When they save again"
          @update:model-value="setRepeatWhen"
        >
          <option v-for="o in REPEAT_WHEN" :key="o.value" :value="o.value">{{ o.label }}</option>
        </AppSelect>
        <AppSelect
          :model-value="effect.repeat_save.ability"
          tone="filled"
          size="body"
          weight="normal"
          aria-label="Ability of the repeated save"
          @update:model-value="setRepeatAbility"
        >
          <option v-for="a in ABILITIES" :key="a" :value="a">{{ ABILITY_NAMES[a] }}</option>
        </AppSelect>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <AppCheckbox
        :model-value="harmed !== null"
        label="They are harmed"
        @update:model-value="(on: boolean) => emit('patch', { ends_when_harmed: on ? 'by_casters_side' : null })"
      />
      <div v-if="harmed !== null" class="pl-6">
        <AppSelect
          :model-value="harmed"
          tone="filled"
          size="body"
          weight="normal"
          aria-label="Who harms them"
          @update:model-value="setHarmed"
        >
          <option value="by_casters_side">by the caster or its allies</option>
          <option value="by_anyone">by anyone</option>
        </AppSelect>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <AppCheckbox
        :model-value="breakFree !== null"
        label="They break free with an ability check"
        hint="Costs their action; against the spell save DC."
        @update:model-value="toggleBreakFree"
      />
      <div v-if="breakFree !== null" class="flex flex-col gap-2 pl-6">
        <div class="flex flex-wrap gap-x-4 gap-y-1">
          <AppCheckbox
            v-for="a in ABILITIES"
            :key="a"
            :model-value="breakFree.abilities"
            :value="a"
            :label="ABILITY_NAMES[a]"
            @update:model-value="setBreakAbilities"
          />
        </div>
        <AppSelect
          :model-value="breakFree.skill ?? ''"
          tone="filled"
          size="body"
          weight="normal"
          aria-label="Skill for the check"
          @update:model-value="setBreakSkill"
        >
          <option value="">No particular skill</option>
          <option value="athletics">Athletics</option>
          <option value="acrobatics">Acrobatics</option>
        </AppSelect>
      </div>
    </div>

    <AppCheckbox
      :model-value="effect.must_flee === true"
      label="While it lasts they must flee the caster"
      @update:model-value="(on: boolean) => emit('patch', { must_flee: on })"
    />
    <AppCheckbox
      :model-value="effect.leaves_play === true"
      label="It takes them out of the fight until it ends"
      @update:model-value="(on: boolean) => emit('patch', { leaves_play: on })"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The "how it ends" half of the spell editor's condition form (#1021, row 5b): a later save, harm, a check to break
 * free, fleeing and leaving the fight. A sub-part of `SpellConditionEffectFields`, which owns the entry and merges
 * every patch this emits.
 */
import { computed } from "vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { ABILITIES, type Ability } from "@/lib/spells/curatedSpellConditions";
import { ABILITY_NAMES } from "@/lib/spells/conditionEffectText";
import type { SpellConditionEffect } from "@/types/spell.types";

const REPEAT_WHEN = [
  { value: "end_of_its_turn", label: "at the end of each of their turns" },
  { value: "start_of_its_turn", label: "at the start of each of their turns" },
  { value: "when_damaged", label: "whenever they take damage" },
  { value: "as_an_action", label: "by spending their action" },
] as const;

type Repeat = NonNullable<SpellConditionEffect["repeat_save"]>;
type Harmed = NonNullable<SpellConditionEffect["ends_when_harmed"]>;
type BreakFree = NonNullable<SpellConditionEffect["break_free"]>;

const { effect, saveAbility } = defineProps<{
  effect: SpellConditionEffect;
  /** The spell's own save ability, the default for a repeated save; null when it has none. */
  saveAbility: Ability | null;
}>();
const emit = defineEmits<{ patch: [patch: Partial<SpellConditionEffect>] }>();

const harmed = computed(() => effect.ends_when_harmed ?? null);
const breakFree = computed(() => effect.break_free ?? null);

function toggleRepeat(on: boolean) {
  emit("patch", { repeat_save: on ? { when: "end_of_its_turn", ability: saveAbility ?? "WIS" } : null });
}
function setRepeatWhen(when: string) {
  const current = effect.repeat_save;
  const known = REPEAT_WHEN.find((o) => o.value === when);
  if (current && known) emit("patch", { repeat_save: { ...current, when: known.value } satisfies Repeat });
}
function setRepeatAbility(ability: string) {
  const current = effect.repeat_save;
  const known = ABILITIES.find((a) => a === ability);
  if (current && known) emit("patch", { repeat_save: { ...current, ability: known } });
}
function setHarmed(value: string) {
  if (value === "by_casters_side" || value === "by_anyone") emit("patch", { ends_when_harmed: value satisfies Harmed });
}
function toggleBreakFree(on: boolean) {
  emit("patch", { break_free: on ? { abilities: ["STR"], skill: null } : null });
}
function setBreakAbilities(picked: string[]) {
  const current = breakFree.value;
  // At least one ability stays ticked: a check with no ability to make it with cannot be made.
  const abilities = ABILITIES.filter((a) => picked.includes(a));
  if (current && abilities.length > 0) emit("patch", { break_free: { ...current, abilities } satisfies BreakFree });
}
function setBreakSkill(skill: string) {
  const current = breakFree.value;
  if (!current) return;
  const next = skill === "athletics" || skill === "acrobatics" ? skill : null;
  emit("patch", { break_free: { ...current, skill: next } });
}
</script>
