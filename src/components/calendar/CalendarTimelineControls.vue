<template>
  <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
    <!-- Year/month navigation -->
    <div class="flex items-center gap-2">
      <AppButton variant="outline" size="body" label="←" @click="emit('shift-back')" />
      <div class="text-center min-w-36">
        <p class="font-cinzel text-sm font-semibold text-foreground">
          {{ rangeLabel }}
        </p>
      </div>
      <AppButton variant="outline" size="body" label="→" @click="emit('shift-forward')" />
    </div>

    <!-- Zoom selector -->
    <div class="flex items-center gap-1">
      <span class="text-label-lg text-muted-foreground mr-1">ZOOM</span>
      <AppButton
        v-for="z in zoomPresets"
        :key="z.value"
        variant="subtle"
        size="xs"
        :active="zoomYears === z.value"
        :label="z.label"
        @click="emit('set-zoom', z.value)"
      />
    </div>

    <!-- Jump to year -->
    <form class="flex items-center gap-1.5" @submit.prevent="emit('jump-to-year', localJumpYear)">
      <AppInput
        v-model.number="localJumpYear"
        type="number"
        placeholder="Jump to year…"
        tone="filled"
        size="body"
        class="w-32"
      />
      <AppButton type="submit" variant="outline" size="sm" label="Go" />
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";

const { rangeLabel, zoomYears, zoomPresets, initialYear } = defineProps<{
  rangeLabel: string;
  zoomYears: number;
  zoomPresets: { value: number; label: string }[];
  initialYear: number;
}>();

const emit = defineEmits<{
  "shift-back": [];
  "shift-forward": [];
  "set-zoom": [value: number];
  "jump-to-year": [year: number];
}>();

const localJumpYear = ref(initialYear);

watch(
  () => initialYear,
  (y) => { localJumpYear.value = y; },
);
</script>
