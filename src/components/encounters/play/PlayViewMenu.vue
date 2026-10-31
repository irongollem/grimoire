<template>
  <MenuPopover label="View" data-testid="play-view-menu">
    <template #trigger="{ toggle, open }">
      <AppButton
        variant="outline"
        size="sm"
        :icon="IconLayers"
        :icon-right="IconChevronDown"
        label="View"
        aria-haspopup="menu"
        :aria-expanded="open"
        @click="toggle"
      />
    </template>

    <template #default="{ close }">
      <AppButton
        v-for="entry in ENTRIES"
        :key="entry.key"
        variant="menu"
        size="md"
        block
        class="rounded-none"
        role="menuitemcheckbox"
        :aria-checked="view[entry.key]"
        :aria-label="entry.label"
        @click="view = { ...view, [entry.key]: !view[entry.key] }"
      >
        <span class="flex w-full items-center gap-2">
          <IconCheck class="size-4 shrink-0" :class="view[entry.key] ? '' : 'invisible'" aria-hidden="true" />
          <span>{{ entry.label }}</span>
        </span>
      </AppButton>
      <AppButton
        variant="menu"
        size="md"
        block
        class="mt-1 rounded-none border-t border-border"
        role="menuitem"
        :icon="IconReset"
        label="Reset view"
        @click="onReset(close)"
      />
    </template>
  </MenuPopover>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import MenuPopover from "@/components/common/overlays/MenuPopover.vue";
import { IconCheck, IconChevronDown, IconLayers, IconReset } from "@/lib/icons";
import type { PlayViewState } from "./playTypes";

/** The toggles that sat on the old battle map toolbar, behind one button (#1125 frame 10). */
const view = defineModel<PlayViewState>({ required: true });
const emit = defineEmits<{ "reset-view": [] }>();

const ENTRIES: { key: keyof PlayViewState; label: string }[] = [
  { key: "asPlayer", label: "As players see it" },
  { key: "showGrid", label: "Grid" },
  { key: "showZones", label: "Zones" },
  { key: "showTokens", label: "Tokens" },
  { key: "showFog", label: "Fog" },
  { key: "followTurn", label: "Follow the turn" },
];

function onReset(close: (refocus: boolean) => void) {
  close(true);
  emit("reset-view");
}
</script>
