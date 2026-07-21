<template>
  <div class="flex items-center gap-1.5">
    <input
      :value="model ?? ''"
      type="number"
      step="5"
      min="0"
      placeholder="0"
      class="flex-1 min-w-0 bg-card border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      @input="onInput"
    />
    <span class="font-cinzel text-xs text-muted-foreground shrink-0">ft.</span>
  </div>
</template>

<script setup lang="ts">
const model = defineModel<number | null>({ required: true });

function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  model.value = raw === "" ? null : parseInt(raw, 10);
}
</script>
