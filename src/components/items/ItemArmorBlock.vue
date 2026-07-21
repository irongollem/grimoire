<template>
  <div class="rounded-lg border border-border bg-card/50 p-4 flex flex-col gap-3">
    <h3 class="text-label-lg font-bold text-muted-foreground uppercase">
      Defense
    </h3>
    <label class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Armor Class</span>
      <input
        :value="armorClass"
        placeholder="e.g. 13 + DEX modifier (max 2)"
        class="bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="emit('update:armorClass', ($event.target as HTMLInputElement).value)"
      />
    </label>
  </div>
</template>

<script setup lang="ts">
const { armorClass = "" } = defineProps<{
  armorClass?: string;
}>();

const emit = defineEmits<{
  "update:armorClass": [value: string];
}>();
</script>
