<template>
  <section class="resolve" :aria-label="`Resolve ${entry.name}`" data-testid="resolve-panel">
    <header class="resolve-head">
      <h4 class="resolve-title">{{ entry.name }}</h4>
      <AppButton variant="ghost" size="sm" label="Done" data-testid="resolve-done" @click="emit('close')" />
    </header>
    <RunnerAttackFlow
      v-if="attack"
      :attacker="attacker"
      :entry="entry"
      :attack="attack"
      :resolution="resolution"
      :dm-mode="dmMode"
      :silent="silent"
      @first-roll="emit('first-roll')"
    />
    <RunnerSaveFlow
      v-else-if="save"
      :attacker="attacker"
      :entry="entry"
      :save="save"
      :resolution="resolution"
      :silent="silent"
      @first-roll="emit('first-roll')"
    />
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import RunnerAttackFlow from "@/components/encounters/RunnerAttackFlow.vue";
import RunnerSaveFlow from "@/components/encounters/RunnerSaveFlow.vue";
import { useActionResolution } from "@/composables/encounters/useActionResolution";
import { useCompanions } from "@/composables/encounters/useCompanions";
import type { RollMode } from "@/lib/dice/dice";
import type { RunCombatant } from "@/types/encounter.types";
import type { StatBlockEntry } from "@/types/statBlock.types";

/**
 * Rolls one stat-block action at its targets, inline under the entry (#1017).
 * `entry` is already the thing to roll: for an "options" entry the list passes a
 * synthetic attack or save entry for the chosen option.
 */
const { attacker, entry } = defineProps<{
  attacker: RunCombatant;
  entry: StatBlockEntry;
  dmMode: RollMode;
  silent: boolean;
}>();

const emit = defineEmits<{
  /** The first roll was made: a limited action is spent now, not when the panel opened. */
  "first-roll": [];
  close: [];
}>();

const { data: companions } = useCompanions();
const resolution = useActionResolution({ companions: () => (companions.value ? companions.value : []) });

const attack = computed(() => (entry.structured.kind === "attack" ? entry.structured.attack : undefined));
const save = computed(() => (entry.structured.kind === "save" ? entry.structured.save : undefined));
</script>

<style scoped>
@reference "@/assets/main.css";

.resolve {
  @apply mt-1 flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-2;
}

.resolve-head {
  @apply flex items-center justify-between gap-2;
}

.resolve-title {
  @apply text-label-lg font-semibold text-foreground;
}
</style>
