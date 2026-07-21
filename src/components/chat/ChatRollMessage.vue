<template>
  <!-- Hidden roll (dm_roll) — only visible to the DM -->
  <div
    v-if="isDmRoll"
    class="max-w-[90%] rounded-lg px-3 py-2 border border-dashed border-purple-500/50 bg-purple-500/8"
  >
    <!-- DM-only badge -->
    <div class="flex items-center gap-1 mb-1.5">
      <IconHide class="h-3 w-3 text-purple-500 dark:text-purple-400 shrink-0" />
      <span class="font-cinzel text-2xs text-purple-500 dark:text-purple-400 tracking-widest">HIDDEN ROLL</span>
    </div>
    <!-- Sender row -->
    <p class="text-label text-foreground/60 mb-1">
      <span class="font-semibold text-purple-600 dark:text-purple-300">{{ senderName }}</span>
      {{ " " }}rolled <span class="text-purple-600/70 dark:text-purple-400">{{ roll.label }}</span>
    </p>
    <!-- Flavor line -->
    <p
      v-if="flavorSkillLabel || flavorText"
      class="text-body text-foreground/85 italic leading-snug mb-2"
    >
      <span
        v-if="flavorSkillLabel"
        class="text-label font-semibold text-purple-600 dark:text-purple-400 not-italic"
      >
        {{ flavorSkillLabel }}:
      </span>
      {{ flavorText }}
    </p>
    <!-- Total + breakdown -->
    <div class="flex items-center gap-3">
      <div
        class="shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-lg border"
        :class="
          roll.isCrit
            ? 'border-amber-400/50 bg-amber-400/10'
            : roll.isFumble
              ? 'border-destructive/50 bg-destructive/10'
              : 'border-purple-500/50 bg-purple-500/10'
        "
      >
        <span
          class="font-cinzel text-2xl font-bold leading-none"
          :class="
            roll.isCrit
              ? 'text-amber-400'
              : roll.isFumble
                ? 'text-destructive'
                : 'text-purple-800 dark:text-purple-100'
          "
        >{{ roll.total ?? "?" }}</span>
        <span v-if="roll.isCrit" class="font-cinzel text-2xs text-amber-400 tracking-widest mt-0.5">CRIT</span>
        <span v-else-if="roll.isFumble" class="font-cinzel text-2xs text-destructive tracking-widest mt-0.5">FAIL</span>
      </div>
      <div class="flex-1 min-w-0">
        <div v-if="roll.breakdown?.length" class="flex flex-wrap gap-1 mb-1">
          <span
            v-for="(d, i) in roll.breakdown"
            :key="i"
            class="font-cinzel text-2xs px-1.5 py-0.5 rounded"
            :class="d.dropped ? 'line-through text-muted-foreground/30 bg-muted/30' : 'bg-purple-500/20 text-purple-800 dark:text-purple-100'"
          >{{ d.val }}</span>
          <span
            v-if="roll.modifier !== 0"
            class="font-cinzel text-2xs text-purple-600 dark:text-purple-400 px-1"
          >{{ roll.modifier > 0 ? `+${roll.modifier}` : roll.modifier }}</span>
        </div>
        <p class="text-caption-sm text-muted-foreground/50">{{ timeLabel }}</p>
      </div>
    </div>
  </div>

  <!-- Regular roll -->
  <div
    v-else
    class="max-w-[90%] rounded-lg px-3 py-2"
    :class="
      isOwn
        ? 'bg-primary/15 border border-primary/20'
        : 'bg-muted/60 border border-border'
    "
  >
    <!-- Sender row -->
    <p class="text-label text-muted-foreground mb-1.5">
      <span class="font-semibold text-primary">{{ senderName }}</span>
      <span v-if="isWhisper" class="text-amber-400"> whispers</span>
      {{ " " }}rolled <span class="text-primary/70">{{ roll.label }}</span>
    </p>
    <!-- Horizontal layout: total left, breakdown right -->
    <div class="flex items-center gap-3">
      <!-- Big total -->
      <div
        class="shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-lg border"
        :class="
          roll.isCrit
            ? 'border-amber-400/50 bg-amber-400/10'
            : roll.isFumble
              ? 'border-destructive/50 bg-destructive/10'
              : isOwn
                ? 'border-primary/30 bg-primary/10'
                : 'border-border bg-muted/40'
        "
      >
        <span
          class="font-cinzel text-2xl font-bold leading-none"
          :class="
            roll.isCrit
              ? 'text-amber-400'
              : roll.isFumble
                ? 'text-destructive'
                : 'text-foreground'
          "
        >{{ roll.total ?? "?" }}</span>
        <span
          v-if="roll.isCrit"
          class="font-cinzel text-2xs text-amber-400 tracking-widest mt-0.5"
        >CRIT</span>
        <span
          v-else-if="roll.isFumble"
          class="font-cinzel text-2xs text-destructive tracking-widest mt-0.5"
        >FAIL</span>
      </div>
      <!-- Breakdown + meta -->
      <div class="flex-1 min-w-0">
        <div
          v-if="roll.breakdown?.length"
          class="flex flex-wrap gap-1 mb-1"
        >
          <span
            v-for="(d, i) in roll.breakdown"
            :key="i"
            class="font-cinzel text-2xs px-1.5 py-0.5 rounded"
            :class="
              d.dropped
                ? 'line-through text-muted-foreground/30 bg-muted/30'
                : 'bg-muted text-foreground'
            "
          >{{ d.val }}</span>
          <span
            v-if="roll.modifier !== 0"
            class="font-cinzel text-2xs text-primary px-1"
          >
            {{
              roll.modifier > 0
                ? `+${roll.modifier}`
                : roll.modifier
            }}
          </span>
        </div>
        <p class="text-caption-sm text-muted-foreground/50">
          {{ timeLabel }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconHide } from '@/lib/icons';
import type { RollMetadata } from '@/types/chat.types';

const {
  isDmRoll = false,
  isOwn = false,
  isWhisper = false,
  senderName,
  roll,
  flavorSkillLabel = null,
  flavorText = null,
  timeLabel,
} = defineProps<{
  isDmRoll?: boolean;
  isOwn?: boolean;
  isWhisper?: boolean;
  senderName: string | null;
  roll: RollMetadata;
  /** For dm_roll: skill label from the preceding system/flavor message. */
  flavorSkillLabel?: string | null;
  /** For dm_roll: body text from the preceding system/flavor message. */
  flavorText?: string | null;
  timeLabel: string;
}>();
</script>
