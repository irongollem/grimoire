<template>
  <ConnectionSlip :name="row.name" :image="image" :meta="row.meta" :to="`/canon/species?species=${row.speciesId}`" class="pb-3" data-testid="habitat-species">
    <template v-if="row.forms.length > 1" #footer>
      <ul class="m-0 mt-1 flex list-none flex-col gap-1.5 p-0" data-testid="habitat-forms">
        <li v-for="form in row.forms" :key="form.lifeId" class="flex items-center justify-between gap-2">
          <span class="flex min-w-0 flex-wrap items-center gap-x-2 text-caption text-muted-foreground">
            {{ form.label }}
            <EntityMentionChip v-if="form.readable && form.recordId !== null" entity-type="monster" :id="form.recordId" :editable="false" />
            <span v-else-if="form.name !== null">{{ form.name }}</span>
          </span>
          <span class="flex shrink-0 items-center gap-1">
            <AppInput v-model.lazy.number="shareOf[form.lifeId].value" type="number" size="sm" align="right" :block="false" class="w-20" :placeholder="String(form.worked)" :aria-label="`Share of ${row.name}, ${form.label}, percent`" />
            <span class="w-4 text-caption text-muted-foreground" aria-hidden="true">%</span>
          </span>
        </li>
      </ul>
    </template>

    <template #actions>
      <div class="flex flex-col items-end gap-1.5 sm:flex-row sm:items-center">
        <AppSelect :model-value="row.abundance" size="sm" class="w-36" :aria-label="`How common ${row.name} is here`" @update:model-value="emit('abundance', $event)">
          <option :value="null">How common?</option>
          <option v-for="a in ABUNDANCES" :key="a" :value="a">{{ ABUNDANCE_LABEL[a] }}</option>
        </AppSelect>
        <span class="flex w-25 shrink-0 items-center justify-end gap-1">
          <template v-if="row.forms.length === 1">
            <AppInput v-model.lazy.number="shareOf[row.forms[0].lifeId].value" type="number" size="sm" align="right" :block="false" class="w-20" :placeholder="String(row.forms[0].worked)" :aria-label="`Share of ${row.name}, percent`" />
            <span class="w-4 text-caption text-muted-foreground" aria-hidden="true">%</span>
          </template>
          <span v-else-if="row.total !== null" class="text-body tabular-nums text-foreground" data-testid="species-total">{{ row.total }}<span class="inline-block w-4 pl-1 text-caption text-muted-foreground" aria-hidden="true">%</span></span>
        </span>
        <AppButton variant="ghost" size="icon-sm" :icon="IconClose" :aria-label="`Remove ${row.name}`" @click="emit('remove')" />
      </div>
    </template>
  </ConnectionSlip>
</template>

<script setup lang="ts">
/**
 * One species living in a habitat, as a slip (#1283, frames U02 and U04): its picture and name over the words that say how
 * it lives, and at the right, in fixed columns so every share lines up, how common it is here and its share of the
 * roll. The share's grey placeholder is what the code works out; the ink number is the DM's own, and clearing it
 * goes back to the placeholder. A species with several forms on the roll shows their sum, and each form its own field
 * under the name. The refusals (a total past 100) are the parent's: this only says what was typed.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import ConnectionSlip from "@/components/common/entity/ConnectionSlip.vue";
import EntityMentionChip from "@/components/tiptap/EntityMentionChip.vue";
import { IconClose } from "@/lib/icons";
import { ABUNDANCE_LABEL } from "@/lib/canon/ecology";
import { ABUNDANCES, type Abundance } from "@/lib/canon/ecologyTypes";
import type { SpeciesRow } from "@/lib/canon/habitatRows";

const { row, image = null } = defineProps<{ row: SpeciesRow; image?: string | null }>();
const emit = defineEmits<{ abundance: [value: Abundance | null]; share: [lifeId: string, percent: number | null]; remove: [] }>();

// A writable ref per form, so the field commits through `v-model.lazy.number` (an emptied field is null, never 0).
const shareOf = computed(() =>
  Object.fromEntries(
    row.forms.map((f) => [f.lifeId, { get value() { return f.typed; }, set value(next: number | null) { emit("share", f.lifeId, next); } }]),
  ),
);
</script>
