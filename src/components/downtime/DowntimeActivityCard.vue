<script setup lang="ts">
import { computed } from "vue";
import FocalImage from "@/components/common/FocalImage.vue";
import { cardTurnStyle } from "@/lib/motion";
import { RISK_LABELS } from "@/data/downtimeActivities";
import type { DowntimeActivity } from "@/types/downtime.types";

const {
  activity,
  disabled = false,
  selected = false,
  interactive = true,
  pendingCount = 0,
} = defineProps<{
  activity: DowntimeActivity;
  /** No draws left, or the DM is merely previewing. */
  disabled?: boolean;
  selected?: boolean;
  /** False renders a static card (DM prep panel) with no hover/press affordance. */
  interactive?: boolean;
  /**
   * How many draws on this activity are with the DM. Above zero the card sits
   * face-down: the turn is the confirmation that the tap did something, and the
   * resting back is what "awaiting the DM" looks like on the board itself.
   */
  pendingCount?: number;
}>();

const emit = defineEmits<{ select: [activity: DowntimeActivity] }>();

const turned = computed(() => pendingCount > 0);
const turnStyle = computed(() => cardTurnStyle(turned.value));

/** A procedural face until real art exists — no milestone waits on an asset. */
const faceStyle = computed(() => ({
  background: `radial-gradient(120% 100% at 50% 0%, ${activity.accent}cc 0%, ${activity.accent}55 45%, transparent 100%)`,
}));

/** The back is the same card in shadow — tinted by the deck it came from. */
const backStyle = computed(() => ({
  background: `radial-gradient(90% 70% at 50% 40%, ${activity.accent}44 0%, ${activity.accent}18 55%, transparent 100%)`,
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
    :aria-pressed="interactive ? selected || turned : undefined"
    class="group relative block aspect-3/4 w-full rounded-xl text-left transition perspective-distant"
    :class="[
      interactive && !disabled
        ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary'
        : '',
      // A played card is not an unavailable one: it keeps its colour and simply
      // shows its back, so the board reads as 'one is in play' rather than
      // 'the whole deck went grey'.
      disabled && !turned ? 'cursor-not-allowed opacity-50' : '',
    ]"
    @click="onSelect"
  >
    <div class="relative h-full w-full transform-3d transition-transform ease-in-out" :style="turnStyle">
      <!-- Front. Hidden from the a11y tree when turned: backface-visibility
           hides a face visually but leaves its text readable to a screen
           reader, so both would be announced at once. -->
      <div
        class="absolute inset-0 flex flex-col overflow-hidden rounded-xl border backface-hidden"
        :class="selected ? 'border-primary ring-2 ring-primary' : 'border-border'"
        :aria-hidden="turned ? 'true' : undefined"
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
      </div>

      <!-- Back — what the card looks like once it has been played. -->
      <div
        class="absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-border bg-card p-3 text-center backface-hidden rotate-y-180"
        :aria-hidden="turned ? undefined : 'true'"
      >
        <div class="absolute inset-0" :style="backStyle" aria-hidden="true" />
        <span class="relative text-4xl opacity-70" aria-hidden="true">{{ activity.glyph }}</span>
        <p class="relative font-cinzel text-sm font-semibold">{{ activity.title }}</p>
        <p class="relative text-caption-sm text-muted-foreground">In your DM's hands</p>
        <span
          v-if="pendingCount > 1"
          class="relative rounded-full border border-border px-2 py-0.5 text-2xs text-muted-foreground"
        >
          ×{{ pendingCount }}
        </span>
      </div>
    </div>
  </component>
</template>
