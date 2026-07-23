<template>
  <NodeViewWrapper class="pending-image-wrapper" contenteditable="false">
    <div
      class="pending-image-card"
      :class="isFailed ? 'pending-image-card--failed' : 'pending-image-card--pending'"
    >
      <template v-if="!isFailed">
        <IconGenerate class="pending-image-icon animate-pulse" />
        <div class="pending-image-body">
          <p class="font-cinzel text-xs font-semibold tracking-wide text-primary">
            Generating scene illustration…
          </p>
          <p class="pending-image-prompt text-caption text-muted-foreground">{{ truncatedPrompt }}</p>
        </div>
        <span class="pending-image-elapsed text-caption tabular-nums text-muted-foreground/60">{{ elapsedLabel }}</span>
      </template>
      <template v-else>
        <IconWarning class="pending-image-icon text-destructive" />
        <p class="pending-image-error-text text-caption text-destructive">Image generation failed</p>
        <button
          v-if="isEditable"
          type="button"
          class="pending-image-remove-btn"
          @click="props.deleteNode()"
        >
          <IconDelete class="h-3 w-3" />
          Remove
        </button>
      </template>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import { nodeViewProps, NodeViewWrapper } from "@tiptap/vue-3";
import { IconGenerate, IconWarning, IconDelete } from '@/lib/icons';

const props = defineProps({ ...nodeViewProps });

const isEditable = computed(() => props.editor.isEditable);
const isFailed   = computed(() => props.node.attrs.status === "failed");
const prompt     = computed(() => (props.node.attrs.prompt as string) || "");
const truncatedPrompt = computed(() => {
  const p = prompt.value;
  return p.length > 90 ? p.slice(0, 87) + "…" : p;
});

// Elapsed-time readout — ticks every second while generation is pending.
const startedAt = (props.node.attrs.startedAt as number | null) ?? Date.now();
const elapsed = ref(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  timer = setInterval(() => {
    if (isFailed.value) return;
    elapsed.value = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  }, 1000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

const elapsedLabel = computed(() => {
  const m = Math.floor(elapsed.value / 60);
  const s = elapsed.value % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
});
</script>

<style scoped>
@reference "@/assets/main.css";

.pending-image-wrapper {
  display: block;
  margin: 0.75rem 0;
}

.pending-image-card {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  max-width: 26rem;
  padding: 0.625rem 0.875rem;
  border-radius: 0.5rem;
  border: 1px solid;
}

.pending-image-card--pending {
  border-color: theme(colors.primary / 30%);
  background: theme(colors.primary / 5%);
}

.pending-image-card--failed {
  border-color: theme(colors.destructive / 40%);
  background: theme(colors.destructive / 6%);
}

.pending-image-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}

.pending-image-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.pending-image-prompt {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pending-image-elapsed {
  flex-shrink: 0;
}

.pending-image-error-text {
  flex: 1;
  min-width: 0;
}

.pending-image-remove-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
  padding: 0.2rem 0.5rem;
  border-radius: 0.375rem;
  border: 1px solid theme(colors.border);
  font-size: 0.7rem;
  font-weight: 600;
  color: theme(colors.muted-foreground);
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}
.pending-image-remove-btn:hover {
  color: theme(colors.destructive);
  border-color: theme(colors.destructive / 50%);
  background: theme(colors.destructive / 8%);
}
</style>
