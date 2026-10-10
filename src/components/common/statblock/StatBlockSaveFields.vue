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
  </div>
</template>

<script setup lang="ts">
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import StatBlockDamagePartsEditor from "@/components/common/statblock/StatBlockDamagePartsEditor.vue";
import { toInt } from "@/lib/statBlock/inputNumbers";
import { SAVE_ABILITIES, type SaveStructure, SRD_CONDITION_NAMES } from "@/types/statBlock.types";

/** The fields of one saving throw (#1017). Edits the roll editor's draft in place. */
const { save } = defineProps<{ save: SaveStructure }>();
</script>

<style scoped>
@reference "@/assets/main.css";

.field-label {
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
</style>
