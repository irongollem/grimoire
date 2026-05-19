<template>
  <div class="la-tracker">
    <span class="la-label">Legendary Actions</span>
    <div class="la-pips">
      <span
        v-for="i in cap"
        :key="i"
        class="la-pip"
        :class="i <= remaining ? 'la-pip-on' : 'la-pip-off'"
      />
    </div>
    <span class="la-count">{{ remaining }} / {{ cap }}</span>
    <button
      type="button"
      class="la-spend-btn"
      :disabled="!remaining"
      @click="emit('spend', 1)"
    >Use 1</button>
  </div>
</template>

<script setup lang="ts">
const { cap, remaining } = defineProps<{
  cap: number;
  remaining: number;
}>();

const emit = defineEmits<{
  spend: [amount: number];
}>();
</script>

<style scoped>
@reference "@/assets/main.css";

.la-tracker {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: theme(colors.muted / 15%);
  border-radius: 0.375rem;
}
.la-label {
  font-family: var(--font-cinzel, serif);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: theme(colors.muted-foreground / 100%);
  flex-shrink: 0;
}
.la-pips {
  display: flex;
  gap: 3px;
  align-items: center;
}
.la-pip {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid;
  flex-shrink: 0;
}
.la-pip-on {
  background: theme(colors.purple.500 / 80%);
  border-color: theme(colors.purple.400 / 100%);
}
.la-pip-off {
  background: transparent;
  border-color: theme(colors.border / 100%);
}
.la-count {
  font-family: var(--font-cinzel, serif);
  font-size: 10px;
  color: theme(colors.muted-foreground / 100%);
  flex-shrink: 0;
}
.la-spend-btn {
  margin-left: auto;
  font-family: var(--font-cinzel, serif);
  font-size: 9px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 3px;
  border: 1px solid theme(colors.purple.500 / 50%);
  color: theme(colors.purple.400 / 100%);
  background: transparent;
  cursor: pointer;
  transition: all 0.15s;
}
.la-spend-btn:hover:not(:disabled) {
  background: theme(colors.purple.500 / 15%);
}
.la-spend-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
