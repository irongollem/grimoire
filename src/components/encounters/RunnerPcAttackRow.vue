<template>
  <div v-if="compact" class="flex flex-col gap-1" data-testid="pc-attack-row">
    <!-- Frame 10: "Greataxe +7 · 1d12+4" with a small Roll. The dice open the damage panel (riders). -->
    <div class="flex items-center justify-between gap-2">
      <p class="min-w-0 truncate text-body text-foreground">
        <strong>{{ name }}</strong>
        <span v-if="attackBonus !== null" class="ml-1">{{ signed(attackBonus) }}</span>
        <template v-if="damageLabel">
          · <AppButton variant="link" size="inline" :label="damageLabel" :tooltip="`Roll ${name} damage`" @click.stop="emit('damage')" />
        </template>
      </p>
      <div class="flex shrink-0 items-center gap-1.5">
        <slot name="note" />
        <AppButton
          variant="tinted"
          tone="primary"
          emphasis="outline"
          size="xs"
          label="Roll"
          :disabled="attackDisabled"
          :tooltip="attackDisabled ? attackTitle : `Roll ${name}`"
          @click.stop="attackBonus !== null ? emit('attack') : emit('damage')"
        />
      </div>
    </div>
    <slot name="below" />
  </div>

  <div v-else class="flex flex-col gap-0.5" data-testid="pc-attack-row">
    <div class="flex items-start justify-between gap-2">
      <strong class="text-label font-bold text-foreground">{{ name }}.</strong>
      <div class="flex flex-wrap items-center justify-end gap-1">
        <AppButton
          v-if="attackBonus !== null"
          variant="tinted"
          tone="primary"
          emphasis="soft"
          size="xs"
          :icon="attackIcon"
          :label="signed(attackBonus)"
          :disabled="attackDisabled"
          :tooltip="attackDisabled ? attackTitle : undefined"
          @click.stop="emit('attack')"
        />
        <AppButton
          v-if="damageLabel"
          variant="tinted"
          tone="danger"
          emphasis="soft"
          size="xs"
          :icon="IconDice"
          :label="damageLabel"
          @click.stop="emit('damage')"
        />
        <slot name="note" />
      </div>
    </div>
    <span v-if="description" class="text-caption leading-relaxed text-muted-foreground">{{ description }}</span>
    <slot name="below" />
  </div>
</template>

<script setup lang="ts">
import type { Component } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconDice, IconSword } from "@/lib/icons";

/**
 * One attack of a character: its attack bonus and damage as buttons, in the full sheet's list or, `compact`, as the
 * Play turn card's one-line row with a Roll (#1125 frame 10). The glyph says what kind of attack it is.
 */
const {
  name,
  attackBonus,
  damageLabel = null,
  attackIcon = IconSword,
  description = null,
  compact = false,
  attackDisabled = false,
  attackTitle = undefined,
} = defineProps<{
  name: string;
  /** Null for a custom attack with damage only. */
  attackBonus: number | null;
  damageLabel?: string | null;
  attackIcon?: Component;
  description?: string | null;
  compact?: boolean;
  attackDisabled?: boolean;
  /** Why the attack is disabled. */
  attackTitle?: string;
}>();

const emit = defineEmits<{ attack: []; damage: [] }>();

const signed = (n: number) => `${n >= 0 ? "+" : ""}${n}`;
</script>
