<template>
  <div data-slip class="absolute right-0 top-full z-10 mt-1 flex w-64 flex-col gap-1 p-2" data-testid="save-as-menu">
    <p class="px-1 pb-1 text-caption text-muted-foreground">The picture in the book stays as it is.</p>
    <AppButton variant="ghost" size="sm" class="justify-start" :icon="IconDownload" label="Download as WebP" data-testid="download-webp" @click="emit('webp')" />
    <AppButton
      variant="ghost"
      size="sm"
      class="justify-start"
      :icon="IconDownload"
      label="Download as PNG"
      :disabled="!isPro"
      :tooltip="isPro ? undefined : 'PNG downloads come with Pro'"
      data-testid="download-png"
      @click="emit('png')"
    />
    <AppButton
      variant="ghost"
      size="sm"
      class="justify-start"
      :icon="copied ? IconCheck : IconClipboard"
      :label="copied ? 'Copied' : 'Copy to the clipboard'"
      :disabled="!clipboardSupported"
      @click="emit('copy')"
    />
    <AppButton variant="ghost" size="sm" class="justify-start" :icon="IconImage" label="Add to my pictures" @click="emit('add')" />
  </div>
</template>

<script setup lang="ts">
/**
 * The Illuminator's "Save as a new picture" menu. Everyone downloads WebP; PNG downloads are a Pro extra that
 * Free sees greyed out with the reason (maintainer, 12 Nov 2026). The clipboard copy stays open to every plan:
 * browsers only take a PNG on the clipboard, and a paste is not a file export.
 */
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconCheck, IconClipboard, IconDownload, IconImage } from "@/lib/icons";

const { isPro, copied, clipboardSupported } = defineProps<{
  isPro: boolean;
  copied: boolean;
  clipboardSupported: boolean;
}>();

const emit = defineEmits<{ webp: []; png: []; copy: []; add: [] }>();
</script>
