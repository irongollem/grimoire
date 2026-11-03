<template>
  <div
    class="gap-1.5"
    :class="layout === 'grid' ? 'grid grid-cols-2' : layout === 'column' ? 'flex flex-col' : 'flex items-stretch'"
    role="toolbar"
    aria-label="Pad tools"
  >
    <AppButton
      v-for="entry in shown"
      :key="entry.tool"
      variant="outline"
      size="xs"
      :active="tool === entry.tool"
      :aria-pressed="lockedTool === entry.tool"
      :aria-label="`${entry.label}${showKeys ? `, key ${entry.key}` : ''}`"
      :tooltip="entry.hint"
      class="relative min-h-11 flex-col gap-0.5"
      :class="layout === 'row' ? 'min-w-0 flex-1' : 'h-14'"
      @pointerdown="handlers[entry.tool].begin()"
      @pointerup="handlers[entry.tool].end()"
      @pointercancel="handlers[entry.tool].end()"
      @pointerleave="handlers[entry.tool].end()"
      @contextmenu.prevent
      @click="handlers[entry.tool].onClick($event)"
    >
      <component :is="entry.icon" class="h-4 w-4" aria-hidden="true" />
      <span class="text-label font-semibold">{{ entry.label }}</span>
      <span
        v-if="showKeys"
        class="pointer-events-none absolute end-1 top-0.5 text-2xs font-bold opacity-60"
        aria-hidden="true"
      >{{ entry.key }}</span>
    </AppButton>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, type Component } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import {
  IconEdit,
  IconFade,
  IconPadLevel,
  IconPlay,
  IconRepeat,
  IconSolo,
  IconStop,
} from "@/lib/icons";
import { DECK_TOOLS, SIMPLE_TOOLS, type DeckControls, type DeckPhase, type DeckTool } from "@/lib/audio/deck/deckSurface";
import { createTapOrHold } from "./tapOrHold";

/**
 * The tool strip (#1136): Play is the default and the rest change what a press
 * does. Tap a tool to lock it on; hold it to borrow it while the finger stays
 * down. `tool` is what is in force (a held tool wins), `lockedTool` the tapped
 * one, which is why a borrowed tool lights without the lock changing.
 */

const { tool, lockedTool, controls, layout, showKeys } = defineProps<{
  tool: DeckTool;
  lockedTool: DeckTool;
  controls: DeckControls;
  /**
   * `column`: one tool under another beside the deck, as a Launchpad's tools
   * run down its side. `grid`: two columns, where the deck is too short for
   * one (the docked deck at Deck size). `row`: along a phone's bottom.
   */
  layout: "column" | "grid" | "row";
  /** Show the key letter on each tool (a keyboard is present). */
  showKeys: boolean;
}>();

const emit = defineEmits<{
  tool: [payload: { tool: DeckTool; phase: DeckPhase }];
}>();

interface ToolEntry {
  tool: DeckTool;
  label: string;
  key: string;
  icon: Component;
  hint: string;
}

const ENTRIES: Record<DeckTool, ToolEntry> = {
  play: { tool: "play", label: "Play", key: "P", icon: IconPlay, hint: "A press plays the pad" },
  loop: { tool: "loop", label: "Loop", key: "L", icon: IconRepeat, hint: "A press turns looping on or off" },
  stop: { tool: "stop", label: "Stop", key: "S", icon: IconStop, hint: "A press stops the pad" },
  fade: { tool: "fade", label: "Fade", key: "F", icon: IconFade, hint: "A press fades the pad out or in" },
  solo: { tool: "solo", label: "Solo", key: "O", icon: IconSolo, hint: "A press solos the pad; the others drop back" },
  volume: { tool: "volume", label: "Volume", key: "V", icon: IconPadLevel, hint: "Drag on a pad to set its level" },
  edit: { tool: "edit", label: "Edit", key: "E", icon: IconEdit, hint: "A press opens the pad's editor" },
};

// Simple shows play, loop and stop only; the rest are Full's.
const shown = computed(() => (controls === "simple" ? SIMPLE_TOOLS : DECK_TOOLS).map((t) => ENTRIES[t]));

// One gesture per tool, so a hold on Loop cannot be ended by a release on Stop.
const handlers = Object.fromEntries(
  DECK_TOOLS.map((t) => [t, createTapOrHold((phase) => emit("tool", { tool: t, phase }))]),
) as Record<DeckTool, ReturnType<typeof createTapOrHold>>;
onBeforeUnmount(() => Object.values(handlers).forEach((h) => h.dispose()));
</script>
