<template>
  <div class="flex flex-col gap-3">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <MechField label="Heading at level-up">
        <AppInput :model-value="choice.label" tone="card" size="body" placeholder="Eldritch Invocations" @update:model-value="setLabel(String($event))" />
      </MechField>
      <MechField label="Key" hint="Where the picks are saved on the character.">
        <AppInput :model-value="choice.key" tone="card" size="body" placeholder="eldritch_invocations" @update:model-value="emit('update:choice', { ...choice, key: String($event) })" />
      </MechField>
    </div>

    <MechField label="The player picks">
      <AppSelect :model-value="choice.pick.kind" tone="card" size="body" weight="normal" block @update:model-value="setPickKind($event)">
        <option v-for="k in PICK_KINDS" :key="k.value" :value="k.value">{{ k.label }}</option>
      </AppSelect>
    </MechField>

    <MechField v-if="choice.pick.kind === 'option'" label="From the list of">
      <AppSelect :model-value="choice.pick.set" tone="card" size="body" weight="normal" block @update:model-value="setPick({ kind: 'option', set: $event })">
        <option v-for="s in OPTION_SETS" :key="s" :value="s">{{ OPTION_SET_LABELS[s] }}</option>
      </AppSelect>
    </MechField>

    <template v-else-if="choice.pick.kind === 'feat'">
      <AppCheckbox
        :model-value="choice.pick.categories === null"
        label="Any feat (2014 has no categories)"
        label-role="caption"
        @update:model-value="setPick({ kind: 'feat', categories: $event ? null : ['origin'] })"
      />
      <div v-if="choice.pick.categories !== null" class="flex flex-wrap gap-x-4 gap-y-2">
        <AppCheckbox
          v-for="c in FEAT_CATEGORIES"
          :key="c"
          :model-value="choice.pick.categories.includes(c)"
          :label="FEAT_CATEGORY_LABELS[c]"
          label-role="caption"
          @update:model-value="toggleCategory(c, $event)"
        />
      </div>
    </template>

    <AppCheckbox
      v-else-if="choice.pick.kind === 'expertise'"
      :model-value="choice.pick.thieves_tools"
      label="Thieves' Tools can take expertise too"
      label-role="caption"
      @update:model-value="setPick({ kind: 'expertise', thieves_tools: $event })"
    />

    <div v-else-if="choice.pick.kind === 'skill'" class="flex flex-col gap-2">
      <p class="text-caption text-muted-foreground">Tick the skills offered. Tick none to offer every skill.</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        <AppCheckbox
          v-for="s in SKILLS"
          :key="s.key"
          :model-value="choice.pick.from.includes(s.key)"
          :label="s.label"
          label-role="caption"
          @update:model-value="toggleSkill(s.key, $event)"
        />
      </div>
    </div>

    <div v-else-if="choice.pick.kind === 'spell'" class="flex flex-col gap-3">
      <div class="flex flex-col gap-2">
        <p class="text-caption text-muted-foreground">
          Spell lists to draw from. With several, a feat's variant (like Magic Initiate (Wizard)) picks one; otherwise the player may choose from all of them.
        </p>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
          <AppCheckbox
            v-for="l in spellListChoices(choice.pick.lists)"
            :key="l"
            :model-value="choice.pick.lists.includes(l)"
            :label="l"
            label-role="caption"
            @update:model-value="setPick(toggleSpellList(spellPick(), l, $event))"
          />
        </div>
        <div class="flex items-center gap-2">
          <AppInput v-model="newList" tone="card" size="body" placeholder="Another class, like a homebrew one" @keydown.enter.prevent="addList" />
          <AppButton class="shrink-0" variant="outline" size="sm" :icon="IconAdd" icon-size="xs" label="Add list" :disabled="newList.trim() === ''" @click="addList" />
        </div>
      </div>
      <MechField label="Spell level">
        <AppSelect :model-value="choice.pick.level" tone="card" size="body" weight="normal" block @update:model-value="setPick(setSpellLevel(spellPick(), Number($event)))">
          <option v-for="o in SPELL_LEVEL_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </AppSelect>
      </MechField>
      <AppCheckbox
        v-if="choice.pick.level > 0"
        :model-value="choice.pick.free_cast"
        label="Castable once per long rest without a spell slot"
        label-role="caption"
        @update:model-value="setPick({ ...spellPick(), free_cast: $event })"
      />
    </div>

    <MechField v-else-if="choice.pick.kind === 'custom'" label="Options">
      <TagInput :model-value="choice.pick.options" placeholder="Add an option…" @update:model-value="setPick({ kind: 'custom', options: $event })" />
    </MechField>

    <MechField label="How many">
      <AppSelect :model-value="choice.count.kind" tone="card" size="body" weight="normal" block @update:model-value="setCountKind($event)">
        <option v-for="k in COUNT_KINDS" :key="k.value" :value="k.value">{{ k.label }}</option>
      </AppSelect>
    </MechField>
    <MechField v-if="choice.count.kind === 'per_grant'" label="Picks each time">
      <AppInput :model-value="choice.count.amount" type="number" tone="card" size="body" min="1" @update:model-value="emit('update:choice', { ...choice, count: { kind: 'per_grant', amount: Number($event) } })" />
    </MechField>
    <template v-else>
      <p class="text-caption text-muted-foreground">The total known at each level; level-up asks for the difference.</p>
      <ByLevelTable
        :model-value="stringsFromNumbers(choice.count.values)"
        numeric
        value-label="Total known"
        @update:model-value="emit('update:choice', { ...choice, count: { kind: 'known', values: numbersFromStrings($event) } })"
      />
    </template>

    <AppCheckbox
      :model-value="choice.replace_on_level_up"
      label="At a level that grants it, one earlier pick may be swapped"
      label-role="caption"
      @update:model-value="emit('update:choice', { ...choice, replace_on_level_up: $event })"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconAdd } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import TagInput from "@/components/common/TagInput.vue";
import { SKILLS } from "@/types/party.types";
import type { SkillKey } from "@/data/classSkillChoices";
import {
  FEAT_CATEGORIES,
  OPTION_SETS,
  type ChoiceCount,
  type ChoicePick,
  type FeatCategory,
  type FeatureChoice,
  type OptionSet,
} from "@/rules/features/mechanics.types";
import { FEAT_CATEGORY_LABELS } from "@/types/feature.types";
import {
  COUNT_KINDS,
  PICK_KINDS,
  SPELL_LEVEL_OPTIONS,
  addSpellList,
  countOfKind,
  pickOfKind,
  setSpellLevel,
  spellListChoices,
  toggleSpellList,
} from "./mechanicsDraft";
import { numbersFromStrings, stringsFromNumbers } from "./byLevelRows";
import ByLevelTable from "./ByLevelTable.vue";
import MechField from "./MechField.vue";

const { choice } = defineProps<{ choice: FeatureChoice }>();
const emit = defineEmits<{ "update:choice": [value: FeatureChoice] }>();

const OPTION_SET_LABELS: Record<OptionSet, string> = {
  fighting_style: "Fighting Styles",
  eldritch_invocation: "Eldritch Invocations",
  maneuver: "Battle Master Maneuvers",
  metamagic: "Metamagic options",
  pact_boon: "Pact Boons",
  favored_enemy: "Favored Enemies",
  favored_terrain: "Favored Terrains",
  weapon_mastery: "Weapon Mastery",
  wild_shape_form: "Wild Shape forms",
  artificer_infusion: "Artificer Infusions",
};

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function setLabel(label: string) {
  const followed = choice.key === "" || choice.key === slug(choice.label);
  emit("update:choice", { ...choice, label, key: followed ? slug(label) : choice.key });
}

function setPick(pick: ChoicePick) {
  emit("update:choice", { ...choice, pick });
}

function setPickKind(kind: ChoicePick["kind"]) {
  if (kind !== choice.pick.kind) setPick(pickOfKind(kind));
}

function setCountKind(kind: ChoiceCount["kind"]) {
  if (kind !== choice.count.kind) emit("update:choice", { ...choice, count: countOfKind(kind) });
}

function toggleCategory(category: FeatCategory, on: boolean) {
  if (choice.pick.kind !== "feat" || choice.pick.categories === null) return;
  const rest = choice.pick.categories.filter((c) => c !== category);
  const next = on ? [...rest, category] : rest;
  // Unticking the last one would offer no feats at all.
  if (next.length > 0) setPick({ kind: "feat", categories: next });
}

const newList = ref("");

/** The pick narrowed to spells; the spell sub-form only renders for one. */
function spellPick(): Extract<ChoicePick, { kind: "spell" }> {
  if (choice.pick.kind !== "spell") throw new Error("not a spell pick");
  return choice.pick;
}

function addList() {
  setPick(addSpellList(spellPick(), newList.value));
  newList.value = "";
}

function toggleSkill(skill: SkillKey, on: boolean) {
  if (choice.pick.kind !== "skill") return;
  const rest = choice.pick.from.filter((s) => s !== skill);
  setPick({ kind: "skill", from: on ? [...rest, skill] : rest });
}
</script>
