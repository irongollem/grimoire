<template>
  <!-- "Roll with": the advantage/disadvantage choice, in plain sight. It applies
       to the next d20 roll anywhere on the sheet and then returns to Normal; a
       condition that imposes disadvantage is already in every affected roll,
       and the sentence beneath says so in words. -->
  <div class="rounded-lg border border-border bg-card px-3 py-2.5 space-y-2">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span class="text-label text-muted-foreground">Roll with</span>
      <SegmentedControl
        :model-value="nextRollMode"
        :options="MODE_OPTIONS"
        variant="subtle"
        size="md"
        :block="isPhone"
        class="max-sm:w-full"
        @update:model-value="setNextRollMode"
      />
    </div>
    <p v-if="note" class="text-caption text-ink-caution leading-snug">{{ note }}</p>
    <p v-if="note && nextRollMode === 'advantage'" class="text-caption text-muted-foreground leading-snug">
      Advantage and disadvantage cancel out: those rolls will be normal.
    </p>
    <div v-if="showHint" class="flex items-start justify-between gap-2">
      <p class="text-caption text-muted-foreground leading-snug">Tip: press and hold any roll to pick advantage.</p>
      <AppButton variant="link" size="inline-caption" class="shrink-0 max-md:min-h-11" label="Got it" @click="dismissHint" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { useBelow } from "@/composables/useBreakpoint";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import {
  markRollModeHintSeen,
  nextRollMode,
  rollModeHintSeen,
  setNextRollMode,
} from "@/composables/dice/useNextRollMode";
import { disadvantageNote, type DisadvantageTarget } from "@/rules/rollModeNotes";
import type { RollMode } from "@/lib/dice/roller";

const { conditions, shown } = defineProps<{
  conditions: string[];
  /** The kinds of roll this surface makes, so the sentence names only what applies here. */
  shown: readonly DisadvantageTarget[];
}>();

const MODE_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "advantage", label: "Advantage" },
  { value: "disadvantage", label: "Disadvantage" },
] as const satisfies ReadonlyArray<{ value: RollMode; label: string }>;

const isPhone = useBelow("sm");
const { ruleset } = useTableRuleset();
const note = computed(() => disadvantageNote(conditions, ruleset.value, shown));

const showHint = ref(!rollModeHintSeen());
function dismissHint() {
  markRollModeHintSeen();
  showHint.value = false;
}
</script>
