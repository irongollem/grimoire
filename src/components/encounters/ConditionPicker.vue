<template>
  <div ref="triggerRef" class="condition-picker-wrap">
    <AppButton
      variant="subtle"
      size="icon-2xs"
      shape="pill"
      :active="open"
      class="border-dashed"
      :tooltip="open ? 'Close condition picker' : 'Add or remove conditions'"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click.stop="open = !open"
    >+</AppButton>
  </div>

  <!-- Teleported: the runner's panels clip anything absolute inside them. -->
  <Teleport to="body">
    <div
      v-if="open"
      ref="floatingRef"
      :style="floatingStyle"
      data-slip
      class="picker-popover"
      role="dialog"
      aria-label="Conditions"
      @click.stop
    >
      <div class="picker-grid">
        <AppButton
          v-for="cond in CONDITIONS"
          :key="cond"
          :variant="isActive(cond) ? 'tinted' : 'subtle'"
          tone="caution"
          :emphasis="isActive(cond) ? 'strong' : 'soft'"
          size="xs"
          :tooltip="getConditionShort(cond, ruleset)"
          :label="cond"
          class="picker-chip"
          @click.stop="emit('pick', cond)"
        />
      </div>
      <AppButton
        variant="menu"
        tone="arcane"
        size="xs"
        block
        class="mt-1"
        label="Custom…"
        tooltip="A condition of your own, or one with a duration, a source or ongoing damage"
        @click.stop="onCustom"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { CONDITIONS, getExhaustionLevel, getConditionShort, hasCondition } from "@/rules/conditions";
import type { ConditionName } from "@/rules/conditions";
import type { AppliedCondition } from "@/types/condition.types";

const props = defineProps<{
  /** Current conditions on this combatant. */
  conditions: AppliedCondition[];
}>();

const emit = defineEmits<{
  pick: [name: ConditionName];
  /** Open the editor for a new, named condition, anchored to `anchor`. */
  custom: [anchor: Element | null];
}>();

const { ruleset } = useTableRuleset();
const open = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const { floatingRef, floatingStyle } = useAnchoredPopover(triggerRef, open, () => { open.value = false; });

function isActive(cond: ConditionName): boolean {
  if (cond === "Exhaustion") return getExhaustionLevel(props.conditions) > 0;
  return hasCondition(props.conditions, cond);
}

function onCustom() {
  open.value = false;
  emit("custom", triggerRef.value);
}

/** Called from parent to close the picker (e.g. after a pick is handled). */
function close() { open.value = false; }

defineExpose({ close });
</script>

<style scoped>
@reference "@/assets/main.css";

.condition-picker-wrap {
  display: inline-flex;
}

.picker-popover {
  z-index: 300;
  min-width: 14rem;
  @apply bg-card border border-border rounded-lg shadow-xl p-2;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.25rem;
}

.picker-chip {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
