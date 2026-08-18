<template>
  <!--
    The "what" half of a reveal, for entities that answer it with a list of
    fields. Generic over `fields`, so an entity that grows a field list does not
    grow a bespoke panel with it.

    This used to be a bordered card sitting at the top of the NPC edit form,
    with its own `v-if="visibleTo.length"` gate and native checkboxes. It now
    renders inside `RevealBody`'s `#what` slot, which already supplies the
    frame, the heading position and the dimming while nothing is shared — so the
    card chrome and the gate came off rather than being drawn twice.
  -->
  <div class="flex flex-col gap-1">
    <RevealOption
      v-for="field in fields"
      :key="field.key"
      :label="field.label"
      :checked="modelValue.includes(field.key)"
      @toggle="toggleField(field.key)"
    />
  </div>
</template>

<script setup lang="ts">
import RevealOption from "@/components/common/RevealOption.vue";

export interface RevealableField {
  key: string;
  label: string;
}

const { modelValue } = defineProps<{
  modelValue: string[];
  fields: ReadonlyArray<RevealableField>;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string[]): void;
}>();

function toggleField(key: string) {
  const set = new Set(modelValue);
  if (set.has(key)) set.delete(key);
  else set.add(key);
  emit("update:modelValue", Array.from(set));
}
</script>
