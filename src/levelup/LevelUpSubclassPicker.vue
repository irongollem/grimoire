<template>
  <WizardStepCard title="Choose Subclass">
    <p class="font-fell text-sm text-muted-foreground">
      At level {{ nextLevel }}, {{ className }} characters choose their specialisation.
    </p>
    <select
      v-if="subclassOptions.length > 0"
      :value="modelValue"
      class="w-full rounded border border-border bg-muted/40 px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option value="" disabled>Select subclass…</option>
      <option v-for="sc in subclassOptions" :key="sc" :value="sc">{{ sc }}</option>
    </select>
    <input
      v-else
      :value="modelValue"
      type="text"
      placeholder="e.g. Circle of the Moon"
      class="w-full rounded border border-border bg-muted/40 px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </WizardStepCard>
</template>

<script setup lang="ts">
import WizardStepCard from "@/components/common/WizardStepCard.vue";

const { modelValue, nextLevel, className, subclassOptions } = defineProps<{
  modelValue: string;
  nextLevel: number;
  className: string;
  subclassOptions: string[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();
</script>
