<template>
  <div class="lg:col-span-2 flex flex-col gap-4">

    <!-- Token preview card -->
    <div class="rounded-lg border border-border bg-card p-6 flex flex-col items-center gap-3">
      <canvas
        ref="canvasEl"
        :width="canvasSize"
        :height="canvasSize"
        class="rounded-full shadow-lg"
        style="width: 220px; height: 220px;"
      />
      <p class="text-label-lg text-muted-foreground">{{ entityName }}</p>
    </div>

    <!-- Settings panel -->
    <TokenForgeTokenSettings
      :ring-color="ringColor"
      :ring-width="ringWidth"
      :show-name="showName"
      :export-size="exportSize"
      @update:ring-color="emit('update:ringColor', $event)"
      @update:ring-width="emit('update:ringWidth', $event)"
      @update:show-name="emit('update:showName', $event)"
      @update:export-size="emit('update:exportSize', $event)"
    />

    <!-- Export buttons -->
    <div class="flex gap-2">
      <AppButton
        variant="primary"
        size="md"
        class="flex-1"
        :icon="IconDownload"
        label="Download PNG"
        @click="emit('download')"
      />
      <AppButton
        v-if="canCopy"
        variant="subtle"
        size="md"
        :icon="IconCopy"
        label="Copy"
        @click="emit('copy')"
      />
    </div>

    <!-- VTT hint -->
    <div class="rounded-md bg-muted/40 border border-border px-3 py-2.5 flex gap-2.5 items-start">
      <IconInfo class="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <p class="text-caption text-muted-foreground leading-relaxed">
        Upload the PNG to your VTT — <strong>Roll20</strong>: My Library → Upload,
        <strong>Foundry VTT</strong>: Filepicker → Upload, <strong>Owlbear Rodeo</strong>: Image drop.
        280px is standard 1×1 grid size; use 512px for large/huge creatures.
      </p>
    </div>

    <!-- Add to print queue -->
    <AppButton
      variant="subtle"
      size="md"
      label="+ Add to Print Sheet"
      @click="emit('add-to-queue')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconCopy, IconDownload, IconInfo } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import TokenForgeTokenSettings from "@/components/tokenforge/TokenForgeTokenSettings.vue";

const {
  entityName,
  canvasSize,
  canCopy,
  ringColor,
  ringWidth,
  showName,
  exportSize,
} = defineProps<{
  entityName: string;
  canvasSize: number;
  canCopy: boolean;
  ringColor: string;
  ringWidth: number;
  showName: boolean;
  exportSize: number;
}>();

const emit = defineEmits<{
  download: [];
  copy: [];
  'add-to-queue': [];
  'update:ringColor': [value: string];
  'update:ringWidth': [value: number];
  'update:showName': [value: boolean];
  'update:exportSize': [value: number];
}>();

const canvasEl = ref<HTMLCanvasElement | null>(null);

defineExpose({ canvasEl });
</script>
