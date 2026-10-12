<template>
  <div class="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
    <button
      type="button"
      class="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted disabled:cursor-default"
      :disabled="!canPreview"
      :aria-label="`Preview ${mini.label ?? 'mini'}`"
      @click="previewOpen = true"
    >
      <img v-if="thumbSrc" :src="thumbSrc" :alt="mini.label ?? 'Mini'" class="h-full w-full object-cover" />
      <VitruvianIcon v-else class="text-xl opacity-30" />
    </button>

    <div class="min-w-0 flex-1">
      <p class="truncate text-heading-xs font-bold text-foreground">{{ mini.label ?? "Untitled mini" }}</p>
      <p class="text-label text-muted-foreground">
        {{ MINI_FORMAT_LABELS[mini.format] }}
        <template v-if="mini.status !== 'ready'"> · {{ MINI_STATUS_LABELS[mini.status] }}</template>
        · {{ new Date(mini.created_at).toLocaleDateString() }}
      </p>
    </div>

    <MiniControls v-model:preview-open="previewOpen" :mini="mini" class="shrink-0 justify-end" />
  </div>
</template>

<script setup lang="ts">
/**
 * A mini as one line, the rows counterpart to `MiniCard`: thumbnail, label,
 * format / status / date, and the same controls. A mini has no page of its own
 * (its preview is a viewer), so the row is not a link.
 */
import { ref } from "vue";
import VitruvianIcon from "@/components/common/media/VitruvianIcon.vue";
import MiniControls from "@/components/simulacrum/MiniControls.vue";
import { useMiniFiles } from "@/composables/simulacrum/useMiniFiles";
import { MINI_FORMAT_LABELS, MINI_STATUS_LABELS } from "@/types/mini.types";
import type { Mini } from "@/types/mini.types";

const { mini } = defineProps<{ mini: Mini }>();

const previewOpen = ref(false);
const { thumbSrc, canPreview } = useMiniFiles(() => mini);
</script>
