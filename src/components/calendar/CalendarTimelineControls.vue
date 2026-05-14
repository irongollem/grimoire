<template>
  <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
    <!-- Year/month navigation -->
    <div class="flex items-center gap-2">
      <button
        class="rounded-md border border-border px-2.5 py-1 font-fell text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        @click="emit('shift-back')"
      >
        ←
      </button>
      <div class="text-center min-w-36">
        <p class="font-cinzel text-sm font-semibold text-foreground">
          {{ rangeLabel }}
        </p>
      </div>
      <button
        class="rounded-md border border-border px-2.5 py-1 font-fell text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        @click="emit('shift-forward')"
      >
        →
      </button>
    </div>

    <!-- Zoom selector -->
    <div class="flex items-center gap-1">
      <span class="font-cinzel text-xs text-muted-foreground tracking-wider mr-1">ZOOM</span>
      <button
        v-for="z in zoomPresets"
        :key="z.value"
        class="rounded border px-2 py-0.5 font-cinzel text-xs font-semibold tracking-wider transition-colors"
        :class="
          zoomYears === z.value
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:text-foreground'
        "
        @click="emit('set-zoom', z.value)"
      >
        {{ z.label }}
      </button>
    </div>

    <!-- Jump to year -->
    <form class="flex items-center gap-1.5" @submit.prevent="emit('jump-to-year', localJumpYear)">
      <input
        v-model.number="localJumpYear"
        type="number"
        placeholder="Jump to year…"
        class="w-32 bg-muted border border-border rounded-md px-2 py-1 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <button
        type="submit"
        class="rounded-md border border-border px-2.5 py-1 font-cinzel text-xs font-semibold text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        Go
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

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
