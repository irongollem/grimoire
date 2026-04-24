<template>
  <div>
    <PageHeader
      title="Illuminator"
      description="Apply torn-edge and fade treatments to images for use in Scriptorium."
    />

    <div class="px-4 pb-4 md:px-6">
      <div class="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">

        <!-- ── Preview ──────────────────────────────────────────────────── -->
        <div class="flex flex-col gap-3">

          <!-- Drop zone -->
          <div
            v-if="!sourceImage"
            class="relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border bg-card transition-colors min-h-80 cursor-pointer"
            :class="isDragging ? 'border-primary bg-primary/5' : 'hover:border-primary/50'"
            @click="fileInput?.click()"
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="onDrop"
          >
            <ImageIcon class="h-10 w-10 text-muted-foreground/40" />
            <div class="text-center">
              <p class="font-cinzel text-sm font-semibold text-foreground">Drop an image here</p>
              <p class="font-fell text-sm text-muted-foreground mt-0.5">or click to browse — PNG, JPG, WebP</p>
            </div>
            <input
              ref="fileInput"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              class="sr-only"
              @change="onFileChange"
            />
          </div>

          <!-- Canvas preview -->
          <template v-else>
            <div
              class="relative rounded-xl overflow-hidden"
              style="background: repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%) 0 0 / 20px 20px;"
            >
              <canvas ref="previewCanvas" class="block max-w-full mx-auto" />
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="font-cinzel text-xs tracking-wider text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                @click="clearImage"
              >Replace image</button>
              <span class="text-muted-foreground/40 text-xs">·</span>
              <span class="font-fell text-xs text-muted-foreground">
                {{ sourceFilename }} · {{ sourceImage.naturalWidth }}×{{ sourceImage.naturalHeight }}
              </span>
            </div>
          </template>
        </div>

        <!-- ── Controls ──────────────────────────────────────────────────── -->
        <div class="flex flex-col rounded-xl border border-border bg-card overflow-hidden">

          <!-- Per-edge sections -->
          <div
            v-for="(edge, idx) in EDGE_KEYS"
            :key="edge"
            :class="idx > 0 ? 'border-t border-border' : ''"
          >
            <!-- Edge header: toggle switch + label -->
            <button
              type="button"
              class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
              @click="opts[edge].enabled = !opts[edge].enabled"
            >
              <span
                class="font-cinzel text-xs font-bold tracking-widest uppercase transition-colors"
                :class="opts[edge].enabled ? 'text-foreground' : 'text-muted-foreground'"
              >{{ edge }}</span>
              <!-- Toggle pill -->
              <span
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
                :class="opts[edge].enabled ? 'bg-primary' : 'bg-muted-foreground/30'"
              >
                <span
                  class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform"
                  :class="opts[edge].enabled ? 'translate-x-4.5' : 'translate-x-0.5'"
                />
              </span>
            </button>

            <!-- Sliders — dimmed when disabled, still adjustable -->
            <div
              class="px-4 pb-4 flex flex-col gap-3 transition-opacity"
              :class="opts[edge].enabled ? 'opacity-100' : 'opacity-35'"
            >
              <div v-for="slider in SLIDERS" :key="slider.key">
                <div class="flex items-center justify-between mb-1">
                  <label class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">
                    {{ slider.label }}
                  </label>
                  <span class="font-fell text-xs text-muted-foreground tabular-nums">
                    {{ sliderDisplay(edge, slider.key) }}
                  </span>
                </div>
                <input
                  type="range"
                  :min="slider.min"
                  :max="slider.max"
                  :step="slider.step"
                  :value="opts[edge][slider.key]"
                  class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
                  @input="(e) => setSlider(edge, slider.key, parseFloat((e.target as HTMLInputElement).value))"
                />
              </div>
            </div>
          </div>

          <!-- Footer: reset + export -->
          <div class="border-t border-border p-4 flex flex-col gap-2">
            <button
              type="button"
              class="font-cinzel text-[10px] tracking-wider text-muted-foreground hover:text-foreground transition-colors text-right mb-1"
              @click="resetDefaults"
            >Reset all to defaults</button>

            <button
              type="button"
              :disabled="!sourceImage || isExporting"
              class="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold tracking-wider text-primary-foreground transition-opacity disabled:opacity-40"
              @click="downloadPng"
            >
              <DownloadIcon class="h-3.5 w-3.5 shrink-0" />
              {{ isExporting ? 'Processing…' : 'Download PNG' }}
            </button>

            <button
              type="button"
              :disabled="!sourceImage || isExporting || !clipboardSupported"
              class="flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 font-cinzel text-xs font-semibold tracking-wider text-foreground transition-colors hover:bg-muted disabled:opacity-40"
              @click="copyToClipboard"
            >
              <component :is="copySuccess ? CheckIcon : ClipboardIcon" class="h-3.5 w-3.5 shrink-0" />
              {{ copySuccess ? 'Copied!' : 'Copy to clipboard' }}
            </button>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from "vue";
import {
  Image as ImageIcon,
  Download as DownloadIcon,
  Clipboard as ClipboardIcon,
  Check as CheckIcon,
} from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import {
  applyEdgeTreatmentToCtx,
  applyEdgeTreatment,
  DEFAULT_EDGE_TREATMENT,
  type EdgeTreatmentOptions,
  type EdgeOptions,
} from "@/lib/edgeTreatment";

// ─── State ────────────────────────────────────────────────────────────────────

const fileInput      = ref<HTMLInputElement | null>(null);
const previewCanvas  = ref<HTMLCanvasElement | null>(null);
const sourceImage    = ref<HTMLImageElement | null>(null);
const sourceFilename = ref("image");
const isDragging     = ref(false);
const isExporting    = ref(false);
const copySuccess    = ref(false);

const clipboardSupported =
  typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;

const opts = reactive<EdgeTreatmentOptions>(structuredClone(DEFAULT_EDGE_TREATMENT));

// ─── Config ───────────────────────────────────────────────────────────────────

const EDGE_KEYS = ["top", "right", "bottom", "left"] as const;
type EdgeKey   = typeof EDGE_KEYS[number];
type SliderKey = "roughness" | "fadeWidth" | "tearDepth" | "passes" | "variation";

const SLIDERS: Array<{ key: SliderKey; label: string; min: number; max: number; step: number }> = [
  { key: "roughness",  label: "Roughness",  min: 0,  max: 1,  step: 0.01 },
  { key: "fadeWidth",  label: "Fade width", min: 0,  max: 1,  step: 0.01 },
  { key: "tearDepth",  label: "Tear depth", min: 0,  max: 1,  step: 0.01 },
  { key: "passes",     label: "Passes",     min: 1,  max: 12, step: 1    },
  { key: "variation",  label: "Variation",  min: 0,  max: 1,  step: 0.01 },
];

function sliderDisplay(edge: EdgeKey, key: SliderKey): string {
  const v = opts[edge][key];
  return key === "passes" ? String(Math.round(v)) : String(Math.round(v * 100));
}

function setSlider(edge: EdgeKey, key: SliderKey, value: number): void {
  (opts[edge] as EdgeOptions)[key] = value;
}

// ─── Image loading ────────────────────────────────────────────────────────────

function loadFile(file: File) {
  if (!file.type.startsWith("image/")) return;
  sourceFilename.value = file.name.replace(/\.[^.]+$/, "");
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    if (sourceImage.value) URL.revokeObjectURL(sourceImage.value.src);
    sourceImage.value = img;
  };
  img.src = url;
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) loadFile(file);
}

function onDrop(e: DragEvent) {
  isDragging.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) loadFile(file);
}

function clearImage() {
  if (sourceImage.value) URL.revokeObjectURL(sourceImage.value.src);
  sourceImage.value = null;
  if (fileInput.value) fileInput.value.value = "";
}

// ─── Render ───────────────────────────────────────────────────────────────────

const MAX_PREVIEW = 900;

function renderPreview() {
  const img    = sourceImage.value;
  const canvas = previewCanvas.value;
  if (!img || !canvas) return;

  const scale = Math.min(1, MAX_PREVIEW / Math.max(img.naturalWidth, img.naturalHeight));
  const pw = Math.round(img.naturalWidth  * scale);
  const ph = Math.round(img.naturalHeight * scale);

  canvas.width  = pw;
  canvas.height = ph;

  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, pw, ph);
  ctx.drawImage(img, 0, 0, pw, ph);
  applyEdgeTreatmentToCtx(ctx, pw, ph, opts);
}

let renderTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, 60);
}

watch(opts, scheduleRender, { deep: true });
watch(sourceImage, () => { renderTimer = setTimeout(renderPreview, 0); });

// ─── Export ───────────────────────────────────────────────────────────────────

async function downloadPng() {
  if (!sourceImage.value || isExporting.value) return;
  isExporting.value = true;
  try {
    const blob = await applyEdgeTreatment(sourceImage.value, opts);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${sourceFilename.value}-illuminated.png`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    isExporting.value = false;
  }
}

async function copyToClipboard() {
  if (!sourceImage.value || isExporting.value || !clipboardSupported) return;
  isExporting.value = true;
  try {
    const blob = await applyEdgeTreatment(sourceImage.value, opts);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    copySuccess.value = true;
    setTimeout(() => { copySuccess.value = false; }, 2000);
  } finally {
    isExporting.value = false;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resetDefaults() {
  Object.assign(opts, structuredClone(DEFAULT_EDGE_TREATMENT));
}
</script>
