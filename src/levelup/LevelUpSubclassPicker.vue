<template>
  <WizardStepCard title="Choose Subclass">
    <p class="text-body text-muted-foreground">
      At level {{ nextLevel }}, {{ className }} characters choose their specialisation.
    </p>
    <select
      v-if="subclassOptions.length > 0"
      :value="selectedId"
      class="w-full rounded border border-border bg-muted/40 px-3 py-2 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      @change="selectSubclass(($event.target as HTMLSelectElement).value)"
    >
      <option value="" disabled>Select subclass…</option>
      <option v-for="sc in subclassOptions" :key="sc.id" :value="sc.id">{{ sc.label }}</option>
    </select>
    <input
      v-else
      :value="modelValue"
      type="text"
      placeholder="e.g. Circle of the Moon"
      class="w-full rounded border border-border bg-muted/40 px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </WizardStepCard>
</template>

<script setup lang="ts">
import WizardStepCard from "@/components/common/WizardStepCard.vue";

const props = defineProps<{
  modelValue: string;
  selectedId: string;
  nextLevel: number;
  className: string;
  subclassOptions: { id: string; name: string; label: string }[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:selectedId": [value: string];
}>();

function selectSubclass(id: string) {
  emit("update:selectedId", id);
  emit("update:modelValue", props.subclassOptions.find(option => option.id === id)?.name ?? "");
}
</script>
