<template>
  <WizardStepCard title="Choose Subclass">
    <p class="text-body text-muted-foreground">
      At level {{ nextLevel }}, {{ className }} characters choose their specialisation.
    </p>
    <AppSelect
      v-if="subclassOptions.length > 0"
      :model-value="selectedId"
      size="body"
      weight="normal"
      block
      aria-label="Subclass"
      @update:model-value="selectSubclass"
    >
      <option value="" disabled>Select subclass…</option>
      <option v-for="sc in subclassOptions" :key="sc.id" :value="sc.id">{{ sc.name }}</option>
    </AppSelect>
    <p v-else class="text-body text-muted-foreground">
      This table has no subclasses for {{ className }} yet. One can be added in the Codex and chosen the next time this character levels up.
    </p>
  </WizardStepCard>
</template>

<script setup lang="ts">
import AppSelect from "@/components/common/AppSelect.vue";
import WizardStepCard from "@/components/common/WizardStepCard.vue";

const props = defineProps<{
  selectedId: string;
  nextLevel: number;
  className: string;
  subclassOptions: { id: string; name: string }[];
}>();

// The name travels with the id so the payload builder can keep a name out of
// the stored choices whenever it has no definition behind it.
const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:selectedId": [value: string];
}>();

function selectSubclass(id: string) {
  emit("update:selectedId", id);
  emit("update:modelValue", props.subclassOptions.find(option => option.id === id)?.name ?? "");
}
</script>
