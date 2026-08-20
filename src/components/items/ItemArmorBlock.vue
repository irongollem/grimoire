<template>
  <div class="rounded-lg border border-border bg-card/50 p-4 flex flex-col gap-3">
    <h3 class="text-label-lg font-bold text-muted-foreground uppercase">
      Defense
    </h3>
    <label class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Armor Class</span>
      <AppInput
        :model-value="armorClass"
        tone="filled"
        size="body"
        placeholder="e.g. 13 + DEX modifier (max 2)"
        @update:model-value="emit('update:armorClass', $event)"
      />
    </label>
  </div>
</template>

<script setup lang="ts">
import AppInput from "@/components/common/AppInput.vue";

const { armorClass = "" } = defineProps<{
  armorClass?: string;
}>();

const emit = defineEmits<{
  "update:armorClass": [value: string];
}>();
</script>
