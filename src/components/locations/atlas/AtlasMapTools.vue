<template>
  <!-- Four icon-only buttons, top right of a place's map (the maintainer's
       decision of 14 Nov 2026): Measure a route, Line up the grid, Place pins
       and the Map image menu. Every edit happens on the map itself. -->
  <div class="flex items-center gap-1.5">
    <AppButton
      variant="subtle"
      size="icon-xs"
      class="bg-background/85 backdrop-blur-sm"
      :icon="IconRuler"
      :active="tool === 'measure'"
      tooltip="Measure a route"
      @click="toggle('measure')"
    />
    <AppButton
      v-if="location.map_url"
      variant="subtle"
      size="icon-xs"
      class="bg-background/85 backdrop-blur-sm"
      :icon="IconHash"
      :active="tool === 'grid'"
      tooltip="Line up the grid"
      @click="toggle('grid')"
    />
    <AppButton
      variant="subtle"
      size="icon-xs"
      class="bg-background/85 backdrop-blur-sm"
      :icon="IconPin"
      :active="tool === 'pins'"
      tooltip="Place pins"
      @click="toggle('pins')"
    />

    <MenuPopover label="Map image">
      <template #trigger="{ toggle: toggleMenu, open }">
        <AppButton
          variant="subtle"
          size="icon-xs"
          class="bg-background/85 backdrop-blur-sm"
          :icon="IconFolder"
          :active="open"
          tooltip="Map image"
          aria-haspopup="menu"
          :aria-expanded="open"
          @click="toggleMenu"
        />
      </template>
      <template #default="{ close }">
        <AppButton
          variant="menu"
          size="md"
          block
          class="rounded-none"
          :icon="IconUpload"
          label="Replace image…"
          role="menuitem"
          :disabled="picture.busy.value"
          @click="chooseFile(close)"
        />
        <AppButton
          v-if="location.map_url"
          variant="menu"
          size="md"
          block
          class="rounded-none"
          tone="danger"
          :icon="IconDelete"
          label="Remove image"
          role="menuitem"
          :disabled="picture.busy.value"
          @click="removeImage(close)"
        />
        <p v-if="location.map_motion !== null" class="px-3 py-1.5 text-caption text-muted-foreground">
          A moving map: it plays on this device's screens. Players see the still.
        </p>
        <!-- The flag is a fact about the map as an image, so it stays reachable with no picture at all. -->
        <div class="px-3 py-1.5">
          <AppCheckbox
            :model-value="location.is_battle_map"
            size="sm"
            label="This is a battle map, not a region"
            hint="It keeps a battle map out of the Atlas's geography zoom."
            :disabled="picture.busy.value"
            @update:model-value="picture.setBattleMap"
          />
        </div>
      </template>
    </MenuPopover>

    <!-- Outside the menu's panel on purpose: closing the menu unmounts the
         panel, and a file input that is gone fires no `change`. -->
    <input
      ref="fileInput"
      type="file"
      :accept="PICTURE_ACCEPT"
      class="sr-only"
      aria-label="Choose a map file"
      @change="onFile"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import MenuPopover from "@/components/common/overlays/MenuPopover.vue";
import { usePlacePicture } from "@/composables/locations/usePlacePicture";
import { IconDelete, IconFolder, IconHash, IconPin, IconRuler, IconUpload } from "@/lib/icons";
import type { MapTool } from "@/lib/locations/mapTool";
import { PICTURE_ACCEPT } from "@/lib/mapImport/bringFile";
import type { Location } from "@/types/location.types";

const { location } = defineProps<{
  location: Pick<Location, "id" | "map_url" | "map_motion" | "is_battle_map">;
}>();

/** The tool that is on; clicking its own button turns it off. */
const tool = defineModel<MapTool | null>("tool", { required: true });

function toggle(next: MapTool): void {
  tool.value = tool.value === next ? null : next;
}

// ── The picture's writes: the same ones the site workbench makes ────────────
const picture = usePlacePicture(() => location);
const fileInput = ref<HTMLInputElement | null>(null);

function chooseFile(close: (refocus: boolean) => void): void {
  close(false);
  fileInput.value?.click();
}

function removeImage(close: (refocus: boolean) => void): void {
  close(false);
  void picture.removePicture();
}

function onFile(ev: Event): void {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) void picture.setPicture(file);
}
</script>
