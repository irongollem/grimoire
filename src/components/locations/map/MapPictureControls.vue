<template>
  <!-- The Base image's own controls (canvas frame 07): the workbench's Base image tab,
       so a base image is edited the same way wherever it lives. They only report what the DM chose; the host writes. -->
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center gap-1.5">
      <input
        ref="fileInput"
        type="file"
        :accept="PICTURE_ACCEPT"
        class="sr-only"
        aria-label="Choose a map file"
        @change="onFile"
      />
      <AppButton
        variant="primary"
        size="sm"
        :icon="IconUpload"
        :label="hasPicture ? 'Replace' : 'Upload'"
        :loading="busy"
        @click="fileInput?.click()"
      />
      <AppButton
        v-if="hasPicture"
        variant="outline"
        size="sm"
        :icon="IconGrid"
        label="Line up the grid"
        :disabled="busy"
        @click="emit('line-up')"
      />
      <AppButton
        v-if="hasPicture"
        variant="ghost"
        fill="muted"
        size="sm"
        :icon="IconDelete"
        label="Remove"
        :disabled="busy"
        @click="emit('remove')"
      />
    </div>

    <p v-if="moving" class="text-caption text-muted-foreground">
      A moving map: it plays on this device's screens. Players see the still.
    </p>

    <!-- The flag is a fact about the map as an image, so it stays reachable with no picture at all: a place can be
         flagged with nothing under it, and unflagging it is the way back into the Atlas's geography zoom. -->
    <AppCheckbox
      :model-value="battleMap"
      size="sm"
      label="This is a battle map, not a region"
      hint="It no longer decides whether a map can be played, but it keeps a battle map out of the Atlas's geography zoom."
      @update:model-value="emit('update:battleMap', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import { IconDelete, IconGrid, IconUpload } from "@/lib/icons";
import { PICTURE_ACCEPT } from "@/lib/mapImport/bringFile";

defineProps<{
  hasPicture: boolean;
  /** The base image is a moving map kept on this device. */
  moving: boolean;
  battleMap: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{
  upload: [file: File];
  remove: [];
  "line-up": [];
  "update:battleMap": [value: boolean];
}>();

const fileInput = ref<HTMLInputElement | null>(null);

function onFile(ev: Event): void {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) emit("upload", file);
}
</script>
