<template>
  <div class="flex flex-col gap-4">
    <ul v-if="errors.length > 0" role="alert" class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-body text-destructive list-disc list-inside">
      <li v-for="e in errors" :key="e">{{ e }}</li>
    </ul>

    <MechField label="How it is used">
      <AppSelect :model-value="mechanics.activation ?? ''" tone="card" size="body" weight="normal" block @update:model-value="setActivation($event)">
        <option v-for="o in ACTIVATION_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </AppSelect>
    </MechField>

    <MechSection v-if="mechanics.spends" title="Using it spends" @remove="set('spends', undefined)">
      <UsesCostFields :cost="mechanics.spends" @update:cost="set('spends', $event)" />
    </MechSection>

    <MechSection v-if="mechanics.uses" title="Uses" hint="How many times it can be used, and when they come back." @remove="set('uses', undefined)">
      <UsesEditor :uses="mechanics.uses" @update:uses="set('uses', $event)" />
    </MechSection>

    <MechSection v-if="mechanics.scaling" title="Level table" hint="A value the class table prints, like Sneak Attack 3d6 or Rage Damage +2." @remove="set('scaling', undefined)">
      <MechField label="Column heading">
        <AppInput :model-value="mechanics.scaling.label" tone="card" size="body" placeholder="Sneak Attack" @update:model-value="set('scaling', { ...mechanics.scaling, label: String($event) })" />
      </MechField>
      <ByLevelTable :model-value="mechanics.scaling.values" value-label="Value, like 3d6" @update:model-value="set('scaling', { ...mechanics.scaling, values: $event })" />
    </MechSection>

    <MechSection v-if="mechanics.toggle" title="Switch on and off" hint="A state the player turns on, like Rage." @remove="set('toggle', undefined)">
      <ToggleFields :toggle="mechanics.toggle" @update:toggle="set('toggle', $event)" />
    </MechSection>

    <MechSection v-if="mechanics.riders" title="Extra damage" hint="Offered as a checkbox on the damage roll; the player ticks it when it applies." :removable="false">
      <ListEditor
        :items="mechanics.riders"
        item-label="Extra damage"
        add-label="Add another damage rider"
        @add="set('riders', [...mechanics.riders, newRider()])"
        @remove="(i) => set('riders', mechanics.riders?.filter((_, j) => j !== i))"
      >
        <template #default="{ item, index }">
          <RiderFields
            :rider="item"
            :toggle-key="mechanics.toggle?.key || null"
            :toggle-label="mechanics.toggle?.label"
            @update:rider="(r) => set('riders', mechanics.riders?.map((x, j) => (j === index ? r : x)))"
          />
        </template>
      </ListEditor>
    </MechSection>

    <MechSection v-if="mechanics.actions" title="Things it lets you do" hint="Each is listed under the action it takes, like Cunning Action's Dash." :removable="false">
      <ListEditor
        :items="mechanics.actions"
        item-label="Action"
        add-label="Add another"
        @add="set('actions', [...mechanics.actions, newSubAction()])"
        @remove="(i) => set('actions', mechanics.actions?.filter((_, j) => j !== i))"
      >
        <template #default="{ item, index }">
          <SubActionFields :action="item" @update:action="(a) => set('actions', mechanics.actions?.map((x, j) => (j === index ? a : x)))" />
        </template>
      </ListEditor>
    </MechSection>

    <MechSection v-if="mechanics.choices" title="Choices at level-up" hint="What the player is asked to pick when they gain this feature." :removable="false">
      <ListEditor
        :items="mechanics.choices"
        item-label="Choice"
        add-label="Add another choice"
        @add="set('choices', [...mechanics.choices, newChoice()])"
        @remove="(i) => set('choices', mechanics.choices?.filter((_, j) => j !== i))"
      >
        <template #default="{ item, index }">
          <ChoiceFields :choice="item" @update:choice="(c) => set('choices', mechanics.choices?.map((x, j) => (j === index ? c : x)))" />
        </template>
      </ListEditor>
    </MechSection>

    <MechSection v-if="mechanics.grants" title="Proficiencies granted" hint="Given outright when the feature is gained, with no choice." @remove="set('grants', undefined)">
      <GrantsFields :grants="mechanics.grants" @update:grants="set('grants', $event)" />
    </MechSection>

    <MechSection v-if="mechanics.replaces !== undefined" title="Replaces" hint="An optional feature a table can take instead of another of the same class." @remove="set('replaces', undefined)">
      <MechField label="Key of the feature it replaces">
        <AppInput :model-value="mechanics.replaces" tone="card" size="body" placeholder="natural-explorer" @update:model-value="set('replaces', String($event))" />
      </MechField>
    </MechSection>

    <div v-if="addable.length > 0" class="flex flex-wrap gap-2">
      <AppButton v-for="a in addable" :key="a.label" variant="outline" size="sm" :icon="IconAdd" icon-size="xs" :label="a.label" @click="a.add()" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconAdd } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import type { Activation, FeatureMechanics } from "@/rules/features/mechanics.types";
import {
  ACTIVATION_OPTIONS,
  newChoice,
  newGrants,
  newRider,
  newSubAction,
  newToggle,
  newUses,
  tidyMechanics,
  withPart,
} from "./mechanicsDraft";
import ByLevelTable from "./ByLevelTable.vue";
import ChoiceFields from "./ChoiceFields.vue";
import GrantsFields from "./GrantsFields.vue";
import ListEditor from "./ListEditor.vue";
import MechField from "./MechField.vue";
import MechSection from "./MechSection.vue";
import RiderFields from "./RiderFields.vue";
import SubActionFields from "./SubActionFields.vue";
import ToggleFields from "./ToggleFields.vue";
import UsesCostFields from "./UsesCostFields.vue";
import UsesEditor from "./UsesEditor.vue";

/**
 * Every part of `FeatureMechanics` as fields (#976). A part shows once it is
 * added, so a plain passive feature is one select and a row of "Add…" buttons.
 * `errors` are `parseMechanics`' messages, computed by the owner of the draft.
 */
const { mechanics, errors = [] } = defineProps<{ mechanics: FeatureMechanics; errors?: readonly string[] }>();
const emit = defineEmits<{ "update:mechanics": [value: FeatureMechanics] }>();

function set<K extends keyof FeatureMechanics>(key: K, value: FeatureMechanics[K] | undefined) {
  const next = withPart(mechanics, key, value);
  const tidy = tidyMechanics(next);
  // An empty grants part stays while it is being edited (it is what "Proficiencies
  // granted" adds); whoever saves the draft tidies it away.
  if (next.grants) tidy.grants = next.grants;
  emit("update:mechanics", tidy);
}

function setActivation(value: Activation | "") {
  set("activation", value === "" ? undefined : value);
}

const addable = computed(() => {
  const out: Array<{ label: string; add: () => void }> = [];
  if (!mechanics.uses) out.push({ label: "Add uses", add: () => set("uses", newUses()) });
  if (!mechanics.spends) out.push({ label: "Spends uses from a pool", add: () => set("spends", { key: "", amount: 1 }) });
  if (!mechanics.scaling) out.push({ label: "Add a level table", add: () => set("scaling", { label: "", values: { "1": "" } }) });
  if (!mechanics.toggle) out.push({ label: "Add a toggle", add: () => set("toggle", newToggle()) });
  if (!mechanics.riders) out.push({ label: "Add a damage rider", add: () => set("riders", [newRider()]) });
  if (!mechanics.actions) out.push({ label: "Add actions it allows", add: () => set("actions", [newSubAction()]) });
  if (!mechanics.choices) out.push({ label: "Add a choice", add: () => set("choices", [newChoice()]) });
  if (!mechanics.grants) out.push({ label: "Proficiencies granted", add: () => set("grants", newGrants()) });
  if (mechanics.replaces === undefined) out.push({ label: "Replaces another feature", add: () => set("replaces", "") });
  return out;
});
</script>
