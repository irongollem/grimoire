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
      <p class="font-cinzel text-xs text-muted-foreground tracking-wider">{{ entityName }}</p>
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
      <button
        type="button"
        class="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        @click="emit('download')"
      >
        <IconDownload class="h-3.5 w-3.5" />
        Download PNG
      </button>
      <button
        v-if="canCopy"
        type="button"
        class="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 font-cinzel text-xs font-semibold text-muted-foreground tracking-wider hover:text-foreground hover:border-foreground/30 transition-colors"
        @click="emit('copy')"
      >
        <IconCopy class="h-3.5 w-3.5" />
        Copy
      </button>
    </div>

    <!-- VTT hint -->
    <div class="rounded-md bg-muted/40 border border-border px-3 py-2.5 flex gap-2.5 items-start">
      <IconInfo class="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <p class="font-fell text-xs text-muted-foreground leading-relaxed">
        Upload the PNG to your VTT — <strong>Roll20</strong>: My Library → Upload,
        <strong>Foundry VTT</strong>: Filepicker → Upload, <strong>Owlbear Rodeo</strong>: Image drop.
        280px is standard 1×1 grid size; use 512px for large/huge creatures.
      </p>
    </div>

    <!-- Add to print queue -->
    <button
      type="button"
      class="inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 font-cinzel text-xs font-semibold text-muted-foreground tracking-wider hover:text-foreground hover:border-foreground/30 transition-colors"
      @click="emit('add-to-queue')"
    >
      + Add to Print Sheet
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconCopy, IconDownload, IconInfo } from "@/lib/icons";
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
