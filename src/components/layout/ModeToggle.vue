<template>
  <div
    data-tour="mode-toggle"
    :class="cn('flex items-center justify-between gap-3 px-3 py-2', className)"
  >
    <span class="text-caption text-muted-foreground">Mode</span>
    <SegmentedControl
      v-model="modeValue"
      size="xs"
      :disabled="switching"
      :options="MODE_OPTIONS"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The user-level DM/Player lens switch (#729) — shared between the DM
 * sidebar's account popover and the player hamburger menu, the two places a
 * user reaches for it. Switching goes through useModeSwitch() alone: it
 * swaps the per-mode active campaign, clears stale membership and navigates,
 * so this component only renders the control and disables it for that
 * round trip.
 */
import { ref, computed, type HTMLAttributes } from "vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import { useUiStore } from "@/stores/ui";
import { useModeSwitch } from "@/composables/useModeSwitch";
import { cn } from "@/lib/utils";

const { class: className } = defineProps<{ class?: HTMLAttributes["class"] }>();

const ui = useUiStore();
const { switchMode } = useModeSwitch();

const switching = ref(false);

const MODE_OPTIONS = [
  { value: "dm", label: "DM" },
  { value: "player", label: "Player" },
] as const;

// SegmentedControl needs modelValue and options to share one generic type;
// widening to plain string (as CampaignScopeField's scopeValue does) lets
// ui.userMode's "" (no mode chosen yet) pass through as "neither selected"
// without also having to declare "" as a selectable option.
const modeValue = computed<string>({
  get: () => ui.userMode,
  set: (target) => {
    if (target !== "dm" && target !== "player") return;
    void applySwitch(target);
  },
});

async function applySwitch(target: "dm" | "player") {
  switching.value = true;
  try {
    await switchMode(target);
  } finally {
    switching.value = false;
  }
}
</script>
