<template>
  <div class="flex flex-col gap-3">
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <label class="block">
        <span class="field-label">Save</span>
        <AppSelect v-model="save.ability" tone="filled" size="body">
          <option v-for="a in SAVE_ABILITIES" :key="a" :value="a">{{ a.toUpperCase() }}</option>
        </AppSelect>
      </label>
      <label class="block">
        <span class="field-label">DC</span>
        <AppInput
          :model-value="save.dc"
          type="number"
          min="0"
          tone="filled"
          size="body"
          @update:model-value="(v) => (save.dc = toInt(v, 10))"
        />
      </label>
      <label class="block">
        <span class="field-label">On a success</span>
        <AppSelect v-model="save.success" tone="filled" size="body">
          <option value="half">Half damage</option>
          <option value="none">No damage</option>
        </AppSelect>
      </label>
    </div>
    <div>
      <span class="field-label">Damage on a failed save</span>
      <StatBlockDamagePartsEditor v-model="save.fail" label="Failed save" />
    </div>
    <div>
      <span class="field-label">Conditions on a failed save</span>
      <div class="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
        <AppCheckbox
          v-for="c in SRD_CONDITION_NAMES"
          :key="c"
          v-model="save.conditions"
          :value="c"
          :label="c"
          size="sm"
        />
      </div>
    </div>
    <div v-if="save.conditions.length > 0" class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <label class="col-span-2 block sm:col-span-3">
        <span class="field-label">The conditions end</span>
        <AppSelect v-model="endsChoice" tone="filled" size="body">
          <option v-for="o in ENDS_CHOICES" :key="o.value" :value="o.value">{{ o.label }}</option>
        </AppSelect>
      </label>
      <label v-if="save.ends?.kind === 'rounds'" class="block">
        <span class="field-label">Rounds</span>
        <AppInput
          :model-value="save.ends.remaining"
          type="number"
          min="1"
          tone="filled"
          size="body"
          @update:model-value="(v) => (save.ends = { kind: 'rounds', remaining: Math.max(1, toInt(v, 10)) })"
        />
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import StatBlockDamagePartsEditor from "@/components/common/statblock/StatBlockDamagePartsEditor.vue";
import { toInt } from "@/lib/statBlock/inputNumbers";
import { SAVE_ABILITIES, type SaveEnds, type SaveStructure, SRD_CONDITION_NAMES } from "@/types/statBlock.types";
import { computed, watch } from "vue";

/** The fields of one saving throw (#1017). Edits the roll editor's draft in place. */
const { save } = defineProps<{ save: SaveStructure }>();

/**
 * What ends the conditions (#1050), as one choice. A save-ends repeat is this save
 * again, so it names only the edge; its ability and DC are the fields above.
 */
type EndsChoice = "none" | "save-end" | "save-start" | "self-end" | "self-start" | "source-end" | "source-start" | "rounds";
const ENDS_CHOICES: Array<{ value: EndsChoice; label: string }> = [
  { value: "none", label: "When someone removes them" },
  { value: "save-end", label: "Save ends: repeated at the end of each of the target's turns" },
  { value: "save-start", label: "Save ends: repeated at the start of each of the target's turns" },
  { value: "self-end", label: "At the end of the target's next turn" },
  { value: "self-start", label: "At the start of the target's next turn" },
  { value: "source-end", label: "At the end of this creature's next turn" },
  { value: "source-start", label: "At the start of this creature's next turn" },
  { value: "rounds", label: "After a number of rounds" },
];

function choiceOf(ends: SaveEnds | undefined): EndsChoice {
  if (!ends) return "none";
  if (ends.kind === "rounds") return "rounds";
  if (ends.kind === "save") return `save-${ends.at}`;
  return `${ends.of}-${ends.at}`;
}

function endsOf(choice: EndsChoice): SaveEnds | undefined {
  if (choice === "none") return undefined;
  // A minute, the most common span, until the DM says otherwise.
  if (choice === "rounds") return save.ends?.kind === "rounds" ? save.ends : { kind: "rounds", remaining: 10 };
  const [what, at] = choice.split("-") as ["save" | "self" | "source", "start" | "end"];
  return what === "save" ? { kind: "save", at } : { kind: "turn", at, of: what };
}

const endsChoice = computed<EndsChoice>({
  get: () => choiceOf(save.ends),
  set: (choice) => {
    const ends = endsOf(choice);
    if (ends) save.ends = ends;
    else delete save.ends;
  },
});

// An end with nothing left to end would be carried along unseen.
watch(
  () => save.conditions.length,
  (n) => {
    if (n === 0) delete save.ends;
  },
);
</script>

<style scoped>
@reference "@/assets/main.css";

.field-label {
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
</style>
