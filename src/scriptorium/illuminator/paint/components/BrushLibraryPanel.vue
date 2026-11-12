<template>
  <div class="flex h-full min-h-0 flex-col bg-card">
    <div class="border-b border-border p-3">
      <AppInput v-model="query" type="search" size="sm" placeholder="Find a brush" aria-label="Find a brush" />
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <p v-if="sections.length === 0" class="p-4 text-caption text-muted-foreground">No brush is called that.</p>
      <section v-for="s in sections" :key="s.group" class="border-b border-border pb-1">
        <h3 class="px-3 pb-1 pt-3 text-eyebrow uppercase text-muted-foreground">{{ s.label }}</h3>
        <p v-if="s.brushes.length === 0" class="px-3 pb-2 text-caption text-muted-foreground">
          Brushes you make appear here. Tune one and save it as a new brush.
        </p>
        <AppButton
          v-for="b in s.brushes"
          :key="b.id"
          variant="ghost"
          block
          :active="b.id === selectedId"
          :aria-pressed="b.id === selectedId"
          class="mx-0 h-auto justify-start gap-3 px-3 py-1.5 text-left"
          @click="emit('select', b.id)"
        >
          <span class="shrink-0 overflow-hidden rounded-sm border border-border" :style="paperStyle">
            <PaintPreviewCanvas :pixels="tipOf(b)" :scale="2" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col items-start">
            <span class="max-w-full truncate text-label-lg font-semibold text-foreground">{{ b.name }}</span>
            <span class="overflow-hidden rounded-sm" :style="paperStyle">
              <PaintPreviewCanvas :pixels="strokeOf(b)" :scale="2" />
            </span>
          </span>
        </AppButton>
      </section>
    </div>

    <div class="border-t border-border p-3">
      <AppButton variant="subtle" block :icon="IconAdd" label="New brush…" @click="emit('new')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { IconAdd } from "@/lib/icons";
import type { BrushPreset, PaintAssets } from "../engine/types";
import { renderBrushPreview, renderTipPreview } from "../render/brushPreview";
import { groupBrushes } from "./brushLibrary";
import { PREVIEW_INK, PREVIEW_PAPER } from "./previewPaper";
import PaintPreviewCanvas from "./PaintPreviewCanvas.vue";

/**
 * The brush library (#1181): brushes grouped Basic to Yours, each shown as its tip on paper and the stroke the
 * engine really paints with it. The previews go through the engine's own renderer, so they cannot drift from the
 * canvas.
 */
const { brushes, selectedId, assets } = defineProps<{ brushes: BrushPreset[]; selectedId: string; assets: PaintAssets }>();
const emit = defineEmits<{ select: [id: string]; new: [] }>();

// A local ref on purpose: this filters the list on screen, but the panel lives inside the Illuminator's modal
// workbench, which opens fresh each time, so a stale query surviving a reopen would be the bug (the dialog-scoped
// search exemption, not a Filter State Pattern list).
const query = ref("");

const sections = computed(() => groupBrushes(brushes, query.value));
const paperStyle = { backgroundColor: PREVIEW_PAPER };

const TIP_BOX = 40 * 2;
const STROKE_W = 144 * 2;
const STROKE_H = 28 * 2;

function tipOf(b: BrushPreset) {
  return renderTipPreview(b, assets, { width: TIP_BOX, height: TIP_BOX, colour: PREVIEW_INK });
}
function strokeOf(b: BrushPreset) {
  return renderBrushPreview(b, assets, { width: STROKE_W, height: STROKE_H, colour: PREVIEW_INK });
}
</script>
