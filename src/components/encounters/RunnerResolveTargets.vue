<template>
  <div class="targets" role="group" :aria-label="label">
    <p class="targets-label">{{ label }}</p>
    <div class="targets-grid">
      <AppButton
        v-for="c in candidates"
        :key="c.instance_id"
        variant="subtle"
        size="sm"
        class="target"
        :active="selected.includes(c.instance_id)"
        :disabled="disabled"
        :data-testid="`target-${c.instance_id}`"
        @click="toggle(c.instance_id)"
      >
        <span class="target-chip" :title="c.name">
          <span class="target-name">{{ c.name }}</span>
          <span class="target-detail">{{ detail(c) }}<template v-if="isAlly(c)"> · ally</template></span>
        </span>
      </AppButton>
    </div>
    <p v-if="candidates.length === 0" class="targets-empty">Nobody else is in the fight.</p>
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import type { RunCombatant } from "@/types/encounter.types";

const selected = defineModel<string[]>({ required: true });

const { attacker, candidates, multiple, detail, label, disabled = false } = defineProps<{
  attacker: RunCombatant;
  candidates: RunCombatant[];
  multiple: boolean;
  /** The line under each name: AC for an attack, the save bonus for a save. */
  detail: (c: RunCombatant) => string;
  label: string;
  disabled?: boolean;
}>();

function isAlly(c: RunCombatant): boolean {
  return c.faction_id === attacker.faction_id;
}

function toggle(id: string) {
  if (!multiple) {
    selected.value = [id];
    return;
  }
  selected.value = selected.value.includes(id) ? selected.value.filter((x) => x !== id) : [...selected.value, id];
}
</script>

<style scoped>
@reference "@/assets/main.css";

.targets {
  @apply flex flex-col gap-1;
}

.targets-label {
  @apply text-caption text-muted-foreground;
}

/* Two compact columns, one line per target, so a full party still leaves the
   roll button in reach on a tablet at the table. */
.targets-grid {
  @apply grid grid-cols-2 gap-1 overflow-y-auto;
  max-height: 11rem;
}

.target {
  @apply w-full min-w-0 justify-start;
}

/* The button face sets small caps; a target list is read at a glance, so names
   stay in plain case. */
.target-chip {
  @apply flex w-full min-w-0 flex-col items-start text-left leading-tight normal-case [font-variant-caps:normal];
}

.target-name {
  @apply w-full truncate text-label font-semibold;
}

.target-detail {
  @apply text-caption text-muted-foreground font-normal;
}

.targets-empty {
  @apply text-caption text-muted-foreground italic;
}
</style>
