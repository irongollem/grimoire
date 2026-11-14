<template>
  <div role="radiogroup" :aria-label="label" class="space-y-1">
    <label v-for="(way, index) in ways" :key="index" class="flex cursor-pointer items-start gap-2 text-caption text-foreground">
      <input v-model="picked" type="radio" :name="groupName" :value="index" class="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary" />
      <span class="min-w-0">{{ way }}</span>
    </label>
  </div>
</template>

<script setup lang="ts">
import { useId } from "vue";

/**
 * Which way the party came, when more than one leads there (#1194). The player's
 * quest log is told in the order of the beats a move fills in, so the way is the
 * DM's to name and nothing is picked until they do: a default would be a silent guess.
 */
defineProps<{
  /** One line per way, naming the beats it passes. */
  ways: string[];
  label: string;
}>();
const picked = defineModel<number | null>({ default: null });
const groupName = useId();
</script>
