<script setup lang="ts">
import { ref } from "vue";
import {
  CheckIcon,
  UploadIcon,
  AlertCircleIcon,
  Loader2Icon,
  Trash2Icon,
  CrosshairIcon,
} from "@lucide/vue";
import FocalImage from "@/components/common/FocalImage.vue";
import FocalPointPicker from "@/components/common/FocalPointPicker.vue";
import AppButton from "@/components/common/AppButton.vue";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LibraryEntityEntry {
  entry_id: string;
  name: string;
  subtitle: string;
  source: string;
  image_url: string | null;
  portrait_focal_point: { x: number; y: number } | null;
  has_user_art: boolean;
}

type RowStatus = "idle" | "uploading" | "done" | "error";

// ── Props & emits ─────────────────────────────────────────────────────────────

const {
  entity,
  status = "idle",
  errorMsg = "",
  dragging = false,
  expanded = false,
  focalPoint = null,
  uploadedUrl = null,
} = defineProps<{
  entity: LibraryEntityEntry;
  status?: RowStatus;
  errorMsg?: string;
  dragging?: boolean;
  expanded?: boolean;
  focalPoint?: { x: number; y: number } | null;
  uploadedUrl?: string | null;
}>();

const emit = defineEmits<{
  upload: [file: File];
  clear: [];
  "toggle-focal": [];
  "set-focal": [fp: { x: number; y: number } | null];
  "preview": [];
  "drag-enter": [event: DragEvent];
  "drag-over": [event: DragEvent];
  "drag-leave": [event: DragEvent];
  "drop": [event: DragEvent];
}>();

// ── File input ref ────────────────────────────────────────────────────────────

const fileInputEl = ref<HTMLInputElement | null>(null);

function triggerUpload() {
  fileInputEl.value?.click();
}

function handleInputChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) emit("upload", file);
  // reset so same file can be re-selected
  if (fileInputEl.value) fileInputEl.value.value = "";
}

// ── Derived helpers ───────────────────────────────────────────────────────────

function canExpandFocal() {
  return !!(uploadedUrl ?? (entity.has_user_art ? entity.image_url : null));
}

function resolvedFocalPoint() {
  return focalPoint !== undefined ? focalPoint : entity.portrait_focal_point;
}
</script>

<template>
  <div
    class="relative transition-colors"
    :class="dragging ? 'bg-primary/10' : 'bg-card'"
    @dragenter="emit('drag-enter', $event)"
    @dragover="emit('drag-over', $event)"
    @dragleave="emit('drag-leave', $event)"
    @drop="emit('drop', $event)"
  >
    <input
      ref="fileInputEl"
      type="file"
      accept="image/*"
      class="sr-only"
      @change="handleInputChange"
    />

    <div
      v-if="dragging"
      class="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
    >
      <span class="font-cinzel text-2xs text-primary tracking-wide">Drop to upload</span>
    </div>

    <!-- main row -->
    <div
      class="flex items-center gap-3 px-3 py-2"
      :class="status !== 'uploading' ? 'cursor-copy' : ''"
    >
      <!-- thumbnail -->
      <button
        type="button"
        class="w-10 h-10 shrink-0 rounded overflow-hidden bg-muted relative group/thumb"
        :class="
          canExpandFocal()
            ? 'cursor-pointer ring-1 ring-transparent hover:ring-primary/60 transition-all'
            : 'cursor-copy'
        "
        @click.stop="canExpandFocal() ? emit('toggle-focal') : undefined"
      >
        <FocalImage
          :src="entity.image_url"
          :alt="entity.name"
          format="portrait"
          placeholder="/assets/placeholders/monster.webp"
        />
        <div
          v-if="canExpandFocal()"
          class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
        >
          <CrosshairIcon class="h-4 w-4 text-white" />
        </div>
      </button>

      <div class="flex-1 min-w-0">
        <button
          type="button"
          class="font-cinzel text-xs font-semibold text-foreground truncate block text-left hover:text-primary hover:underline transition-colors w-full"
          @click.stop="emit('preview')"
        >{{ entity.name }}</button>
        <span class="text-caption-sm text-muted-foreground capitalize">{{ entity.subtitle }}</span>
      </div>

      <span
        v-if="errorMsg"
        class="text-caption-sm text-destructive truncate max-w-30"
        :title="errorMsg"
      >
        {{ errorMsg }}
      </span>

      <div class="shrink-0 flex items-center gap-1">
        <Loader2Icon
          v-if="status === 'uploading'"
          class="h-4 w-4 animate-spin text-muted-foreground"
        />
        <template v-else>
          <AppButton
            :variant="status === 'error' ? 'destructive' : 'outline'"
            size="xs"
            tone="primary"
            :fill="status === 'error' ? 'none' : 'muted'"
            :active="status !== 'error' && dragging"
            :label="status === 'error' ? 'Retry' : (status === 'done' || entity.has_user_art) ? 'Replace' : 'Upload'"
            @click.stop="triggerUpload()"
          >
            <template #icon>
              <AlertCircleIcon v-if="status === 'error'" class="h-3 w-3 shrink-0" />
              <CheckIcon
                v-else-if="status === 'done' || entity.has_user_art"
                class="h-3 w-3 shrink-0 text-green-500"
              />
              <UploadIcon v-else class="h-3 w-3 shrink-0" />
            </template>
          </AppButton>

          <!-- Clear art — only when there is art to clear -->
          <AppButton
            v-if="entity.image_url || entity.has_user_art || status === 'done'"
            variant="subtle"
            size="icon-xs"
            icon-size="xs"
            tone="danger"
            tooltip="Clear art"
            :icon="Trash2Icon"
            @click.stop="emit('clear')"
          />
        </template>
      </div>
    </div>

    <!-- inline focal picker -->
    <div
      v-if="expanded && canExpandFocal()"
      class="px-3 pb-3 ml-13"
    >
      <FocalPointPicker
        :src="uploadedUrl ?? entity.image_url ?? ''"
        :model-value="resolvedFocalPoint()"
        class="max-w-36"
        @update:model-value="(fp) => emit('set-focal', fp)"
      />
    </div>
  </div>
</template>
