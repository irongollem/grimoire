<template>
  <header class="flex h-12 shrink-0 items-center gap-2 overflow-x-auto rounded-lg border border-border bg-card px-2">
    <!-- The workbench's one bar: 3rem, so the map is what the screen is for. The host
         fills the two ends (a way back and the map's name; whatever else it still owns);
         what belongs to the map itself sits between them, and everything that is a setting
         rather than a stroke is behind the Map menu (canvas frame 07). -->
    <slot name="start" />
    <slot name="layer" />

    <span class="ml-auto flex shrink-0 items-center gap-1 text-caption text-muted-foreground" aria-live="polite">
      <IconCheck v-if="saved" class="size-3.5 text-tone-success" aria-hidden="true" />
      <span>{{ saveState }}</span>
    </span>

    <AppButton
      variant="ghost"
      fill="muted"
      size="icon-sm"
      class="shrink-0"
      :disabled="!canUndo"
      tooltip="Undo (Ctrl+Z)"
      aria-label="Undo"
      :icon="IconUndo"
      @click="emit('undo')"
    />
    <AppButton
      variant="ghost"
      fill="muted"
      size="icon-sm"
      class="shrink-0"
      :disabled="!canRedo"
      tooltip="Redo (Ctrl+Shift+Z)"
      aria-label="Redo"
      :icon="IconRedo"
      @click="emit('redo')"
    />

    <CartographerPopover label="Map menu" width-class="w-80">
      <template #trigger="{ open, toggle }">
        <AppButton
          variant="subtle"
          size="sm"
          class="shrink-0"
          :active="open"
          :icon-right="IconChevronDown"
          aria-haspopup="dialog"
          :aria-expanded="open"
          label="Map"
          tooltip="Light, spaces and the rest of the map's settings"
          @click="toggle"
        />
      </template>
      <template #default="{ close }">
        <CartographerMapMenu
          :darkness="darkness"
          :campaign-id="campaignId"
          :space-count="spaceCount"
          :spaces-open="spacesOpen"
          :reference-available="referenceAvailable"
          :show-reference="showReference"
          :menu-actions="menuActions"
          :review-count="reviewCount"
          @update:darkness="emit('update:darkness', $event)"
          @update:campaign-id="emit('update:campaignId', $event)"
          @update:show-reference="emit('update:showReference', $event)"
          @toggle-spaces="emit('toggleSpaces')"
          @menu-action="emit('menuAction', $event)"
          @done="close"
        />
      </template>
    </CartographerPopover>

    <AppButton v-if="showReady" variant="primary" size="sm" class="shrink-0" label="Ready" @click="emit('ready')" />

    <slot name="end" />
  </header>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import CartographerMapMenu from "@/components/cartographer/CartographerMapMenu.vue";
import CartographerPopover from "@/components/cartographer/CartographerPopover.vue";
import { IconCheck, IconChevronDown, IconRedo, IconUndo } from "@/lib/icons";
import type { MapMenuAction } from "@/cartographer/tools";
import type { DarknessLevel } from "@/types/dungeonMap.types";

const { saveState } = defineProps<{
  darkness: DarknessLevel;
  campaignId: string | null;
  spaceCount: number;
  spacesOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** The host's save state ("Saving…", "Unsaved changes", "Saved"); absent says nothing. */
  saveState?: string;
  /** Whether the site's Picture can go underneath, and whether it does. */
  referenceAvailable: boolean;
  showReference: boolean;
  /** The host's own actions in the Map menu; only the ones it handles are drawn. */
  menuActions: readonly MapMenuAction[];
  /** Site changes waiting for review, as a chip on that menu row when above zero. */
  reviewCount?: number;
  /** The primary "Ready" button: the host decides whether it has a finish to offer. */
  showReady: boolean;
}>();

const emit = defineEmits<{
  "update:darkness": [level: DarknessLevel];
  "update:campaignId": [id: string | null];
  "update:showReference": [show: boolean];
  toggleSpaces: [];
  menuAction: [id: MapMenuAction];
  undo: [];
  redo: [];
  ready: [];
}>();

// A tick only beside the word that says the work is safe, never beside "Saving…".
const saved = computed(() => saveState === "Saved");
</script>
