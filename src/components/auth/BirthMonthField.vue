<template>
  <fieldset class="space-y-1.5">
    <legend class="text-label text-foreground">{{ legend }}</legend>
    <div class="flex gap-2">
      <AppSelect v-model="month" block tone="card" weight="normal" aria-label="Birth month">
        <option :value="null" disabled>Month</option>
        <option v-for="(name, index) in MONTHS" :key="name" :value="index + 1">{{ name }}</option>
      </AppSelect>
      <AppSelect v-model="year" block tone="card" weight="normal" aria-label="Birth year">
        <option :value="null" disabled>Year</option>
        <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
      </AppSelect>
    </div>
  </fieldset>
</template>

<script setup lang="ts">
/**
 * The age question every account-creating form asks (#919), and the Terms gate.
 *
 * Neutral on purpose: both fields start empty, nothing hints at a "right"
 * answer, and there is no "I am 16 or older" checkbox, which is not neutral at
 * all. Month and year only, never a day: that is all the gate needs, and the
 * server keeps even less (`child_accounts.adult_on`, and nothing for adults).
 */
import { computed } from "vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";

const { legend = "When were you born?" } = defineProps<{ legend?: string }>();

const month = defineModel<number | null>("month", { required: true });
const year = defineModel<number | null>("year", { required: true });

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const years = computed(() => {
  const thisYear = new Date().getUTCFullYear();
  return Array.from({ length: 101 }, (_, i) => thisYear - i);
});
</script>
