<template>
  <div class="space-y-4">
    <p class="text-body text-muted-foreground">
      Bring your pages over from LegendKeeper, World Anvil or Obsidian. Each exported page becomes one record that you
      sort and check before anything is created.
    </p>
    <ul class="list-disc space-y-1 pl-5 text-caption text-muted-foreground">
      <li>No AI and no credits: your browser reads the files, nothing is sent to a model.</li>
      <li>Everything arrives for you only. Nothing is shared with players.</li>
      <li>Choose the export as a .zip, the Markdown or HTML files themselves, or an unzipped export folder.</li>
    </ul>

    <div class="flex flex-wrap items-center gap-2">
      <AppButton variant="outline" size="md" label="Choose files or a .zip" :icon="IconUpload" :loading="reading" @click="filesInput?.click()" />
      <AppButton variant="outline" size="md" label="Choose a folder" :icon="IconArchive" :disabled="reading" @click="folderInput?.click()" />
    </div>
    <input
      ref="filesInput"
      type="file"
      multiple
      accept=".zip,.md,.markdown,.html,.htm,.json"
      class="hidden"
      @change="onPicked"
    />
    <input ref="folderInput" type="file" webkitdirectory class="hidden" @change="onPicked" />

    <p v-if="error" class="text-caption text-destructive">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * The first step of a wiki-export import (#932): pick the export. It names the
 * apps it reads, says plainly that nothing is sent to a model, and hands the
 * picked `File`s up. Reading happens in the host so a refusal (too many pages,
 * an unreadable zip) shows here as `error`.
 */
import { ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconArchive, IconUpload } from "@/lib/icons";

defineProps<{ reading: boolean; error: string | null }>();
const emit = defineEmits<{ picked: [files: File[]] }>();

const filesInput = ref<HTMLInputElement | null>(null);
const folderInput = ref<HTMLInputElement | null>(null);

function onPicked(event: Event): void {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = ""; // allow picking the same selection again
  if (files.length > 0) emit("picked", files);
}
</script>
