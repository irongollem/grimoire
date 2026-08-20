<script setup lang="ts">
import { computed } from "vue";
import FocalImage from "@/components/common/FocalImage.vue";
import { RISK_LABELS } from "@/data/downtimeActivities";
import type { DowntimeActivity } from "@/types/downtime.types";

const {
  activity,
  disabled = false,
  selected = false,
  interactive = true,
} = defineProps<{
  activity: DowntimeActivity;
  /** No draws left, or the DM is merely previewing. */
  disabled?: boolean;
  selected?: boolean;
  /** False renders a static card (DM prep panel) with no hover/press affordance. */
  interactive?: boolean;
}>();

const emit = defineEmits<{ select: [activity: DowntimeActivity] }>();

/** A procedural face until real art exists — no milestone waits on an asset. */
const faceStyle = computed(() => ({
  background: `radial-gradient(120% 100% at 50% 0%, ${activity.accent}cc 0%, ${activity.accent}55 45%, transparent 100%)`,
}));

const riskLabel = computed(() => RISK_LABELS[activity.risk]);

function onSelect() {
  if (disabled || !interactive) return;
  emit("select", activity);
}
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    :type="interactive ? 'button' : undefined"
    :disabled="interactive && disabled"
    :aria-pressed="interactive ? selected : undefined"
    class="group relative flex aspect-3/4 w-full flex-col overflow-hidden rounded-xl border text-left transition"
    :class="[
      selected ? 'border-primary ring-2 ring-primary' : 'border-border',
      interactive && !disabled
        ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary'
        : '',
      disabled ? 'cursor-not-allowed opacity-50' : '',
    ]"
    @click="onSelect"
  >
    <!-- Card face -->
    <div class="relative flex-1 overflow-hidden bg-card">
      <FocalImage
        v-if="activity.artUrl"
        :src="activity.artUrl"
        :alt="activity.title"
        format="portrait"
        class="absolute inset-0 h-full w-full object-cover"
      />
      <div v-else class="absolute inset-0" :style="faceStyle" aria-hidden="true" />
      <div
        v-if="!activity.artUrl"
        class="absolute inset-0 flex items-center justify-center text-6xl opacity-80"
        aria-hidden="true"
      >
        {{ activity.glyph }}
      </div>

      <!-- Risk dial -->
      <div
        class="absolute top-2 right-2 flex items-center gap-0.5 rounded-full bg-background/80 px-2 py-0.5"
        :title="`Risk: ${riskLabel}`"
      >
        <span
          v-for="pip in 3"
          :key="pip"
          class="size-1.5 rounded-full"
          :class="pip <= activity.risk ? 'bg-destructive' : 'bg-muted'"
        />
        <span class="sr-only">Risk: {{ riskLabel }}</span>
      </div>
    </div>

    <!-- Card foot -->
    <div class="shrink-0 border-t border-border bg-card p-3">
      <h3 class="font-cinzel text-sm font-semibold">{{ activity.title }}</h3>
      <p class="mt-1 line-clamp-2 text-caption-sm text-muted-foreground">{{ activity.hook }}</p>
    </div>
  </component>
</template>
