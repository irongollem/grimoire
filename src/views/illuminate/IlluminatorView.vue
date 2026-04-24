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
              <canvas
                ref="previewCanvas"
                class="block max-w-full mx-auto"
                :class="dofEnabled ? 'cursor-crosshair' : ''"
                @click="onCanvasClick"
              />
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

          <!-- ── Colour Grading section ──────────────────────────────────── -->
          <div>
            <!-- Header: toggle + label + reset link -->
            <button
              type="button"
              class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
              @click="gradingEnabled = !gradingEnabled"
            >
              <span
                class="font-cinzel text-xs font-bold tracking-widest uppercase transition-colors"
                :class="gradingEnabled ? 'text-foreground' : 'text-muted-foreground'"
              >Colour Grading</span>
              <!-- Toggle pill -->
              <span
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
                :class="gradingEnabled ? 'bg-primary' : 'bg-muted-foreground/30'"
              >
                <span
                  class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform"
                  :class="gradingEnabled ? 'translate-x-4.5' : 'translate-x-0.5'"
                />
              </span>
            </button>

            <!-- Body: presets + sliders — dimmed when disabled -->
            <div
              class="px-4 pb-4 flex flex-col gap-3 transition-opacity"
              :class="gradingEnabled ? 'opacity-100' : 'opacity-35'"
            >
              <!-- Preset buttons -->
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase mr-1">Presets</span>
                <button
                  v-for="preset in GRADING_PRESETS"
                  :key="preset.label"
                  type="button"
                  class="font-cinzel text-[10px] tracking-wider px-2 py-0.5 rounded border border-border hover:border-primary hover:text-primary transition-colors"
                  @click="applyPreset(preset.values)"
                >{{ preset.label }}</button>
                <button
                  type="button"
                  class="font-cinzel text-[10px] tracking-wider text-muted-foreground hover:text-foreground transition-colors ml-auto"
                  @click="resetGrading"
                >Reset</button>
              </div>

              <!-- Grading sliders -->
              <div v-for="gs in GRADING_SLIDERS" :key="gs.key">
                <div class="flex items-center justify-between mb-1">
                  <label class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">
                    {{ gs.label }}
                  </label>
                  <span class="font-fell text-xs text-muted-foreground tabular-nums">
                    {{ gradingDisplay(gs.key) }}
                  </span>
                </div>
                <input
                  type="range"
                  :min="gs.min"
                  :max="gs.max"
                  :step="gs.step"
                  :value="grading[gs.key]"
                  class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
                  @input="(e) => setGradingSlider(gs.key, parseFloat((e.target as HTMLInputElement).value))"
                />
              </div>
            </div>
          </div>

          <!-- ── Vignette section ───────────────────────────────────────── -->
          <div class="border-t border-border">
            <!-- Header: toggle + label -->
            <button
              type="button"
              class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
              @click="vignetteEnabled = !vignetteEnabled"
            >
              <span
                class="font-cinzel text-xs font-bold tracking-widest uppercase transition-colors"
                :class="vignetteEnabled ? 'text-foreground' : 'text-muted-foreground'"
              >Vignette</span>
              <span
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
                :class="vignetteEnabled ? 'bg-primary' : 'bg-muted-foreground/30'"
              >
                <span
                  class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform"
                  :class="vignetteEnabled ? 'translate-x-4.5' : 'translate-x-0.5'"
                />
              </span>
            </button>

            <!-- Body: mode + colour + sliders -->
            <div
              class="px-4 pb-4 flex flex-col gap-3 transition-opacity"
              :class="vignetteEnabled ? 'opacity-100' : 'opacity-35'"
            >
              <!-- Mode pill buttons -->
              <div class="flex items-center gap-1.5">
                <span class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase mr-1">Mode</span>
                <button
                  v-for="mode in (['transparent', 'colour'] as VignetteMode[])"
                  :key="mode"
                  type="button"
                  class="font-cinzel text-[10px] tracking-wider px-2 py-0.5 rounded border transition-colors"
                  :class="vignette.mode === mode
                    ? 'border-primary text-primary'
                    : 'border-border hover:border-primary/60 hover:text-foreground text-muted-foreground'"
                  @click="vignette.mode = mode"
                >{{ mode }}</button>
              </div>

              <!-- Colour picker — only in colour mode -->
              <div v-if="vignette.mode === 'colour'" class="flex items-center gap-2">
                <span class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Colour</span>
                <input
                  type="color"
                  :value="vignette.colour"
                  class="h-6 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
                  @input="(e) => { vignette.colour = (e.target as HTMLInputElement).value; }"
                />
                <span class="font-fell text-xs text-muted-foreground">{{ vignette.colour }}</span>
              </div>

              <!-- Strength slider -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Strength</label>
                  <span class="font-fell text-xs text-muted-foreground tabular-nums">{{ Math.round(vignette.strength * 100) }}</span>
                </div>
                <input
                  type="range" min="0" max="1" step="0.01"
                  :value="vignette.strength"
                  class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
                  @input="(e) => { vignette.strength = parseFloat((e.target as HTMLInputElement).value); }"
                />
              </div>

              <!-- Softness slider -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Softness</label>
                  <span class="font-fell text-xs text-muted-foreground tabular-nums">{{ Math.round(vignette.softness * 100) }}</span>
                </div>
                <input
                  type="range" min="0" max="1" step="0.01"
                  :value="vignette.softness"
                  class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
                  @input="(e) => { vignette.softness = parseFloat((e.target as HTMLInputElement).value); }"
                />
              </div>
            </div>
          </div>

          <!-- ── Depth of Field section ─────────────────────────────────── -->
          <div class="border-t border-border">
            <button
              type="button"
              class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
              @click="dofEnabled = !dofEnabled"
            >
              <span
                class="font-cinzel text-xs font-bold tracking-widest uppercase transition-colors"
                :class="dofEnabled ? 'text-foreground' : 'text-muted-foreground'"
              >Depth of Field</span>
              <span
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
                :class="dofEnabled ? 'bg-primary' : 'bg-muted-foreground/30'"
              >
                <span
                  class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform"
                  :class="dofEnabled ? 'translate-x-4.5' : 'translate-x-0.5'"
                />
              </span>
            </button>

            <div
              class="px-4 pb-4 flex flex-col gap-3 transition-opacity"
              :class="dofEnabled ? 'opacity-100' : 'opacity-35'"
            >
              <!-- Hint when enabled -->
              <p v-if="dofEnabled && sourceImage" class="font-fell text-[11px] text-muted-foreground italic">
                Click the image to set the focal point
              </p>

              <!-- Falloff curve pills -->
              <div class="flex items-center gap-1.5">
                <span class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase mr-1">Falloff</span>
                <button
                  v-for="curve in (['linear', 'quadratic', 'cubic'] as FalloffCurve[])"
                  :key="curve"
                  type="button"
                  class="font-cinzel text-[10px] tracking-wider px-2 py-0.5 rounded border transition-colors"
                  :class="dof.falloff === curve
                    ? 'border-primary text-primary'
                    : 'border-border hover:border-primary/60 hover:text-foreground text-muted-foreground'"
                  @click="dof.falloff = curve"
                >{{ curve }}</button>
              </div>

              <!-- Focus radius -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Focus radius</label>
                  <span class="font-fell text-xs text-muted-foreground tabular-nums">{{ Math.round(dof.focusRadius * 100) }}</span>
                </div>
                <input
                  type="range" min="0" max="1" step="0.01"
                  :value="dof.focusRadius"
                  class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
                  @input="(e) => { dof.focusRadius = parseFloat((e.target as HTMLInputElement).value); }"
                />
              </div>

              <!-- Blur strength -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Blur</label>
                  <span class="font-fell text-xs text-muted-foreground tabular-nums">{{ Math.round(dof.blurStrength * 100) }}</span>
                </div>
                <input
                  type="range" min="0" max="1" step="0.01"
                  :value="dof.blurStrength"
                  class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
                  @input="(e) => { dof.blurStrength = parseFloat((e.target as HTMLInputElement).value); }"
                />
              </div>

              <!-- Desaturation -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Desaturation</label>
                  <span class="font-fell text-xs text-muted-foreground tabular-nums">{{ Math.round(dof.desaturation * 100) }}</span>
                </div>
                <input
                  type="range" min="0" max="1" step="0.01"
                  :value="dof.desaturation"
                  class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
                  @input="(e) => { dof.desaturation = parseFloat((e.target as HTMLInputElement).value); }"
                />
              </div>
            </div>
          </div>

          <!-- Per-edge sections -->
          <div
            v-for="edge in EDGE_KEYS"
            :key="edge"
            class="border-t border-border"
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
  processImage,
  DEFAULT_EDGE_TREATMENT,
  type EdgeTreatmentOptions,
  type EdgeOptions,
} from "@/lib/edgeTreatment";
import {
  applyColourGrading,
  DEFAULT_COLOUR_GRADING,
  GRADING_PRESETS,
  type ColourGradingOptions,
} from "@/lib/colourGrading";
import {
  applyVignette,
  DEFAULT_VIGNETTE,
  type VignetteOptions,
  type VignetteMode,
} from "@/lib/vignette";
import {
  applyDofBlur,
  drawFocalCrosshair,
  DEFAULT_DOF_BLUR,
  type DofBlurOptions,
  type FalloffCurve,
} from "@/lib/dofBlur";

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

// Colour grading state
const gradingEnabled = ref(false);
const grading = reactive<ColourGradingOptions>(structuredClone(DEFAULT_COLOUR_GRADING));

// Vignette state
const vignetteEnabled = ref(false);
const vignette = reactive<VignetteOptions>(structuredClone(DEFAULT_VIGNETTE));

// DOF state
const dofEnabled = ref(false);
const dof = reactive<DofBlurOptions>(structuredClone(DEFAULT_DOF_BLUR));

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

type GradingSliderKey = keyof ColourGradingOptions;
const GRADING_SLIDERS: Array<{
  key: GradingSliderKey;
  label: string;
  min: number;
  max: number;
  step: number;
  isHue: boolean;
}> = [
  { key: "brightness",  label: "Brightness", min: -1,   max: 1,   step: 0.01, isHue: false },
  { key: "contrast",    label: "Contrast",   min: -1,   max: 1,   step: 0.01, isHue: false },
  { key: "saturation",  label: "Saturation", min: -1,   max: 1,   step: 0.01, isHue: false },
  { key: "temperature", label: "Temp",       min: -1,   max: 1,   step: 0.01, isHue: false },
  { key: "hue",         label: "Hue",        min: -180, max: 180, step: 1,    isHue: true  },
];

function sliderDisplay(edge: EdgeKey, key: SliderKey): string {
  const v = opts[edge][key];
  return key === "passes" ? String(Math.round(v)) : String(Math.round(v * 100));
}

function setSlider(edge: EdgeKey, key: SliderKey, value: number): void {
  (opts[edge] as EdgeOptions)[key] = value;
}

function gradingDisplay(key: GradingSliderKey): string {
  const v = grading[key];
  if (key === "hue") {
    const deg = Math.round(v);
    return deg >= 0 ? `+${deg}°` : `${deg}°`;
  }
  const pct = Math.round(v * 100);
  return pct >= 0 ? `+${pct}` : String(pct);
}

function setGradingSlider(key: GradingSliderKey, value: number): void {
  (grading as ColourGradingOptions)[key] = value;
}

function applyPreset(values: ColourGradingOptions): void {
  Object.assign(grading, values);
  if (!gradingEnabled.value) gradingEnabled.value = true;
}

function resetGrading(): void {
  Object.assign(grading, structuredClone(DEFAULT_COLOUR_GRADING));
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

  if (gradingEnabled.value) applyColourGrading(ctx, pw, ph, grading);
  if (dofEnabled.value) applyDofBlur(ctx, pw, ph, { ...dof, enabled: true });
  if (vignetteEnabled.value) applyVignette(ctx, pw, ph, { ...vignette, enabled: true });
  applyEdgeTreatmentToCtx(ctx, pw, ph, opts);

  // Crosshair drawn last — visible in preview only, not in export
  if (dofEnabled.value) drawFocalCrosshair(ctx, pw, ph, dof.focalX, dof.focalY);
}

let renderTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, 60);
}

watch(opts, scheduleRender, { deep: true });
watch(grading, scheduleRender, { deep: true });
watch(gradingEnabled, scheduleRender);
watch(vignette, scheduleRender, { deep: true });
watch(vignetteEnabled, scheduleRender);
watch(dof, scheduleRender, { deep: true });
watch(dofEnabled, scheduleRender);
watch(sourceImage, () => { renderTimer = setTimeout(renderPreview, 0); });

// ─── Canvas interaction ───────────────────────────────────────────────────────

function onCanvasClick(e: MouseEvent) {
  if (!dofEnabled.value) return;
  const canvas = previewCanvas.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  dof.focalX = Math.max(0, Math.min(1, (e.clientX - rect.left)  / rect.width));
  dof.focalY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
}

// ─── Export ───────────────────────────────────────────────────────────────────

function buildGradingFn(): ((ctx: CanvasRenderingContext2D, w: number, h: number) => void) | undefined {
  if (!gradingEnabled.value) return undefined;
  const snapshot = { ...grading };
  return (ctx, w, h) => applyColourGrading(ctx, w, h, snapshot);
}

function buildDofFn(): ((ctx: CanvasRenderingContext2D, w: number, h: number) => void) | undefined {
  if (!dofEnabled.value) return undefined;
  const snapshot = { ...dof, enabled: true };
  return (ctx, w, h) => applyDofBlur(ctx, w, h, snapshot);
}

function buildVignetteFn(): ((ctx: CanvasRenderingContext2D, w: number, h: number) => void) | undefined {
  if (!vignetteEnabled.value) return undefined;
  const snapshot = { ...vignette, enabled: true };
  return (ctx, w, h) => applyVignette(ctx, w, h, snapshot);
}

async function downloadPng() {
  if (!sourceImage.value || isExporting.value) return;
  isExporting.value = true;
  try {
    const blob = await processImage(sourceImage.value, opts, buildGradingFn(), buildDofFn(), buildVignetteFn());
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
    const blob = await processImage(sourceImage.value, opts, buildGradingFn(), buildDofFn(), buildVignetteFn());
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
  resetGrading();
  gradingEnabled.value = false;
  Object.assign(vignette, structuredClone(DEFAULT_VIGNETTE));
  vignetteEnabled.value = false;
  Object.assign(dof, structuredClone(DEFAULT_DOF_BLUR));
  dofEnabled.value = false;
}
</script>
