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
          Brushes you make appear here. Tune one and save it as a new brush, or import a brush file.
        </p>
        <template v-for="sub in subsections(s)" :key="sub.name ?? ''">
          <h4 v-if="sub.name !== null" class="px-3 pb-0.5 pt-2 text-caption text-muted-foreground" data-testid="brush-set-name">{{ sub.name }}</h4>
          <div v-for="b in sub.brushes" :key="b.id" class="flex items-center gap-1 pr-1">
            <AppButton
              variant="ghost"
              block
              :active="b.id === selectedId"
              :aria-pressed="b.id === selectedId"
              class="mx-0 h-auto min-w-0 flex-1 justify-start gap-3 px-3 py-1.5 text-left"
              :data-testid="`brush-${b.id}`"
              @click="emit('select', b.id)"
            >
              <span class="shrink-0 overflow-hidden rounded-sm border border-border" :style="paperStyle">
                <PaintPreviewCanvas :pixels="tipOf(b)" :scale="2" />
              </span>
              <span class="flex min-w-0 flex-1 flex-col items-start">
                <AppInput
                  v-if="renamingId === b.id"
                  v-model="renameDraft"
                  size="xs"
                  aria-label="Brush name"
                  data-testid="brush-rename-input"
                  @click.stop
                  @keydown.enter.stop.prevent="commitRename(b)"
                  @keydown.escape.stop.prevent="renamingId = null"
                  @keydown.space.stop
                  @blur="commitRename(b)"
                />
                <span v-else class="flex max-w-full items-center gap-1.5">
                  <span
                    class="min-w-0 truncate text-label-lg font-semibold text-foreground"
                    @dblclick.stop="s.group === 'yours' && startRename(b)"
                  >{{ b.name }}</span>
                  <AiGeneratedBadge v-if="aiMade.has(b.id)" variant="inline" :provenance="AI_BRUSH" data-testid="brush-ai-made" />
                </span>
                <span class="overflow-hidden rounded-sm" :style="paperStyle">
                  <PaintPreviewCanvas :pixels="strokeOf(b)" :scale="2" />
                </span>
              </span>
            </AppButton>
            <OverflowMenu
              v-if="s.group === 'yours'"
              :label="`More actions for ${b.name}`"
              :items="MENU"
              variant="ghost"
              @select="(key) => onMenu(b, key)"
            />
          </div>
        </template>
      </section>
    </div>

    <div class="flex flex-col gap-2 border-t border-border p-3">
      <AppButton variant="subtle" size="sm" block :icon="IconAdd" label="New brush…" @click="emit('new')" />
      <AppButton variant="subtle" size="sm" block :icon="IconUpload" label="Import brushes…" :loading="importing" data-testid="brush-import" @click="picker?.click()" />
      <input ref="picker" type="file" accept=".abr,.brush,.brushset" class="hidden" data-testid="brush-import-file" @change="onPicked" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AiGeneratedBadge from "@/components/common/ai/AiGeneratedBadge.vue";
import OverflowMenu, { type OverflowMenuEntry } from "@/components/common/overlays/OverflowMenu.vue";
import { IconAdd, IconUpload } from "@/lib/icons";
import type { BrushPreset, PaintAssets } from "../engine/types";
import { renderBrushPreview, renderTipPreview } from "../render/brushPreview";
import { groupBrushes, type BrushSection } from "./brushLibrary";
import { PREVIEW_INK, PREVIEW_PAPER } from "./previewPaper";
import PaintPreviewCanvas from "./PaintPreviewCanvas.vue";

/**
 * The brush library (#1181): brushes grouped Basic to Yours, each shown as its tip on paper and the stroke the
 * engine really paints with it. The previews go through the engine's own renderer, so they cannot drift from the
 * canvas. A brush in Yours can be renamed (double-click, or from its menu) and deleted; an imported set sits
 * under its own name.
 */
// Only the provider is known for a brush: the tips come from the platform's image model.
const AI_BRUSH = { provider: "openai" };
const { brushes, selectedId, assets, setNames = {}, importing = false, aiMade = new Set<string>() } = defineProps<{
  brushes: BrushPreset[];
  selectedId: string;
  assets: PaintAssets;
  /** The set each Yours brush came in, by brush id; absent or null for one the painter made. */
  setNames?: Readonly<Record<string, string | null>>;
  importing?: boolean;
  /** The brushes whose tip an image model made, by id; they carry the AI-made chip beside their name. */
  aiMade?: ReadonlySet<string>;
}>();
const emit = defineEmits<{ select: [id: string]; new: []; import: [file: File]; rename: [id: string, name: string]; remove: [id: string] }>();

// A local ref on purpose: this filters the list on screen, but the panel lives inside the Illuminator's modal
// workbench, which opens fresh each time, so a stale query surviving a reopen would be the bug (the dialog-scoped
// search exemption, not a Filter State Pattern list).
const query = ref("");

const sections = computed(() => groupBrushes(brushes, query.value, setNames));
const paperStyle = { backgroundColor: PREVIEW_PAPER };
const subsections = (s: BrushSection) => (s.group === "yours" ? s.sets : [{ name: null, brushes: s.brushes }]);

const MENU: readonly OverflowMenuEntry[] = [
  { key: "rename", label: "Rename" },
  { key: "delete", label: "Delete", danger: true },
];

const renamingId = ref<string | null>(null);
const renameDraft = ref("");
function startRename(b: BrushPreset) {
  renamingId.value = b.id;
  renameDraft.value = b.name;
}
function commitRename(b: BrushPreset) {
  if (renamingId.value !== b.id) return; // Escape already closed it; the blur that follows must not commit.
  renamingId.value = null;
  const name = renameDraft.value.trim();
  if (name !== "" && name !== b.name) emit("rename", b.id, name);
}
function onMenu(b: BrushPreset, key: string) {
  if (key === "rename") startRename(b);
  else if (key === "delete") emit("remove", b.id);
}

const picker = ref<HTMLInputElement | null>(null);
function onPicked(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  // Cleared so picking the same file again still fires.
  input.value = "";
  if (file) emit("import", file);
}

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
