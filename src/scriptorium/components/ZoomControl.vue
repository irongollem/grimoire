<template>
  <div class="inline-flex items-center gap-1" role="group" aria-label="Page zoom" data-testid="zoom-control">
    <AppButton variant="outline" size="icon-sm" :icon="IconMinus" aria-label="Zoom out" tooltip="Zoom out" :disabled="percentNow <= ZOOM_STEPS[0]" @click="step(-1)" />
    <MenuPopover label="Zoom">
      <template #trigger="{ toggle, open }">
        <!-- No tooltip: it would hover over the menu this button opens (the label already says what it is). -->
        <AppButton
          variant="outline"
          size="md"
          :aria-label="`Zoom: ${zoomLabel(zoom)}`"
          aria-haspopup="menu"
          :aria-expanded="open"
          data-testid="zoom-menu"
          @click="toggle"
        >
          {{ zoomLabel(zoom) }}
        </AppButton>
      </template>
      <template #default="{ close }">
        <AppButton
          v-for="entry in ENTRIES"
          :key="entry.label"
          variant="menu"
          size="md"
          block
          class="rounded-none"
          role="menuitemradio"
          :aria-checked="zoom === entry.choice"
          :label="entry.label"
          :data-testid="`zoom-${entry.choice}`"
          @click="pick(entry.choice, close)"
        >
          <span class="flex-1 text-left">{{ entry.label }}</span>
          <kbd v-if="entry.keys" class="text-caption text-muted-foreground">{{ entry.keys }}</kbd>
        </AppButton>
      </template>
    </MenuPopover>
    <AppButton variant="outline" size="icon-sm" :icon="IconAdd" aria-label="Zoom in" tooltip="Zoom in" :disabled="percentNow >= ZOOM_STEPS[ZOOM_STEPS.length - 1]!" @click="step(1)" />
  </div>
</template>

<script setup lang="ts">
/**
 * The page zoom in the editor's header (frame 07): minus and plus walk the
 * steps, the middle button says Fit or the percentage and opens Fit width,
 * Actual size (the printed size) and 150%. Command 0 and 1 do the first two
 * while a book is open. Spreads while writing is not here: Read as spreads
 * is how you see facing pages.
 */
import { computed } from "vue";
import { storeToRefs } from "pinia";
import AppButton from "@/components/common/controls/AppButton.vue";
import MenuPopover from "@/components/common/overlays/MenuPopover.vue";
import { formatCombo, isMacPlatform } from "@/lib/hotkeys";
import { useHotkeys } from "@/composables/useHotkeys";
import { IconMinus, IconAdd } from "@/lib/icons";
import { useScriptoriumUiStore } from "@/scriptorium/stores/ui";
import { stepZoom, zoomLabel, zoomPercent, ZOOM_STEPS, type ZoomChoice } from "@/scriptorium/lib/zoom";

const { scriptoriumZoom: zoom, scriptoriumDrawnScale: drawnScale } = storeToRefs(useScriptoriumUiStore());

const ENTRIES: { choice: ZoomChoice; label: string; keys?: string }[] = [
  { choice: "fit", label: "Fit width", keys: formatCombo("mod+0", isMacPlatform()) },
  { choice: 100, label: "Actual size", keys: formatCombo("mod+1", isMacPlatform()) },
  { choice: 150, label: "150%" },
];

const percentNow = computed(() => zoomPercent(zoom.value, drawnScale.value));

function step(direction: 1 | -1) {
  zoom.value = stepZoom(percentNow.value, direction);
}
function pick(choice: ZoomChoice, close: (refocus: boolean) => void) {
  zoom.value = choice;
  close(true);
}

// allowInTextEntry: the page is a text field, and the writer is usually in it.
useHotkeys([
  { combo: "mod+0", description: "Fit the page to the width", allowInTextEntry: true, handler: () => (zoom.value = "fit") },
  { combo: "mod+1", description: "Show the page at its printed size", allowInTextEntry: true, handler: () => (zoom.value = 100) },
]);
</script>
