<template>
  <div v-if="rows.length > 0" class="mt-1 flex flex-col gap-1" data-testid="subclass-variant-control">
    <label v-for="row in rows" :key="row.id" class="flex items-center gap-1.5">
      <span class="text-label text-muted-foreground">{{ row.label }}</span>
      <AppSelect
        :model-value="row.variant ?? ''"
        tone="muted"
        size="body-xs"
        weight="normal"
        :disabled="isPending"
        :aria-label="`${row.label} for ${row.subclassName}`"
        @update:model-value="change(row.id, $event)"
      >
        <option v-if="row.variant === null" value="" disabled>Choose…</option>
        <option v-for="option in row.options" :key="option" :value="option">{{ option }}</option>
      </AppSelect>
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import AppSelect from "@/components/common/AppSelect.vue";
import { useCharacterClasses, useUpdateCharacterClass } from "@/composables/party/useCharacterClasses";
import { useAllCustomSubclasses } from "@/composables/rules/useCustomSubclasses";
import { useToast } from "@/composables/useToast";
import { subclassVariantLabel, subclassVariantOptions } from "@/levelup/subclassSpells";

/**
 * The option a subclass's grants depend on (Circle of the Land's terrain or
 * land type), shown on the sheet beside the class line and changeable by whoever
 * may edit the character. The server regrants the subclass's spells when the
 * class row changes. A 2024 land type is re-chosen after a long rest; in 2014 a
 * change is a correction.
 */
const props = defineProps<{ memberId: string }>();

const toast = useToast();
const queryClient = useQueryClient();
const { data: classes } = useCharacterClasses(computed(() => props.memberId));
const { data: subclasses } = useAllCustomSubclasses();
const { mutateAsync: updateClass, isPending } = useUpdateCharacterClass();

const rows = computed(() =>
  (classes.value ?? []).flatMap((row) => {
    const subclass = (subclasses.value ?? []).find((s) => s.id === row.subclass_definition_id);
    const options = subclassVariantOptions(subclass);
    if (!subclass || options.length === 0) return [];
    return [{
      id: row.id,
      subclassName: subclass.subclass_name,
      label: subclassVariantLabel(subclass),
      options,
      variant: row.subclass_variant,
    }];
  }),
);

async function change(classRowId: string, variant: string) {
  try {
    await updateClass({ id: classRowId, update: { subclass_variant: variant } });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["characterSpells", props.memberId] }),
      queryClient.invalidateQueries({ queryKey: ["characterSpellsDetails", props.memberId] }),
    ]);
  } catch (e) {
    toast.error(toast.fromError(e, "Could not change the choice."));
  }
}
</script>
