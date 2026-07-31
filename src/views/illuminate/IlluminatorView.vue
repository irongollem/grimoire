<template>
  <!-- On desktop the view fills main's flex height; controls scroll independently. -->
  <div class="flex flex-col lg:flex-1 lg:min-h-0 lg:overflow-hidden">
    <PageHeader
      title="Illuminator"
      description="Apply torn-edge and fade treatments to images for use in Scriptorium."
    >
      <template #title-suffix>
        <ManualHelpLink page="illuminator-image-effects" />
      </template>
    </PageHeader>

    <div class="px-4 pb-4 md:px-6 lg:flex-1 lg:min-h-0 lg:overflow-hidden">
      <div class="grid grid-cols-1 lg:grid-cols-[1fr_18.75rem] gap-6 lg:h-full">

        <!-- ── Preview column ───────────────────────────────────────────── -->
        <IlluminatePreviewPanel
          ref="previewPanel"
          :has-image="!!sourceImage"
          :filename="sourceFilename"
          :image-width="sourceImage?.naturalWidth ?? 0"
          :image-height="sourceImage?.naturalHeight ?? 0"
          :cursor-class="canvasCursorClass"
          :brush-mode="mode === 'brush'"
          :brush-cursor-visible="brushCursorVisible"
          :brush-cursor-client-x="brushCursorClientX"
          :brush-cursor-client-y="brushCursorClientY"
          :brush-cursor-diameter="brushCursorDiameter"
          @pick="fileInput?.click()"
          @replace="clearImage"
          @drop="onDrop"
          @canvas-click="onCanvasClick"
          @brush-pointer-down="onBrushPointerDown"
          @brush-pointer-move="onBrushPointerMove"
          @brush-pointer-up="onBrushPointerUp"
          @brush-pointer-enter="onBrushPointerEnter"
          @brush-pointer-leave="onBrushPointerLeave"
        />

        <!-- ── Controls column — scrolls independently on desktop ────────── -->
        <IlluminateControlsPanel
          :mode="mode"
          :has-image="!!sourceImage"
          :has-strokes="brushController.hasStrokes"
          :brush="brush"
          :brush-open="brushOpen"
          :grading="grading"
          :grading-enabled="gradingEnabled"
          :grading-open="gradingOpen"
          :vignette="vignette"
          :vignette-enabled="vignetteEnabled"
          :vignette-open="vignetteOpen"
          :texture="texture"
          :texture-enabled="textureEnabled"
          :texture-open="textureOpen"
          :texture-has-image="!!textureImage"
          :texture-filename="textureFilename"
          :dof="dof"
          :dof-enabled="dofEnabled"
          :dof-open="dofOpen"
          :opts="opts"
          :edges-open="edgesOpen"
          :edge-open="edgeOpen"
          :return-doc-id="returnDocId"
          :is-exporting="isExporting"
          :is-saving-back="isSavingBack"
          :clipboard-supported="clipboardSupported"
          :copy-success="copySuccess"
          @update:mode="mode = $event"
          @toggle-brush="brushOpen = !brushOpen"
          @update:brush="Object.assign(brush, $event)"
          @brush-undo="onBrushUndo"
          @brush-clear="brushController.clear(); scheduleRender()"
          @toggle-grading="gradingOpen = !gradingOpen"
          @update:grading-enabled="gradingEnabled = $event"
          @grading-slider="(key, value) => { (grading as ColourGradingOptions)[key] = value; }"
          @grading-preset="applyPreset"
          @grading-reset="resetGrading"
          @toggle-vignette="vignetteOpen = !vignetteOpen"
          @update:vignette-enabled="vignetteEnabled = $event"
          @vignette-mode="vignette.mode = $event"
          @vignette-colour="vignette.colour = $event"
          @vignette-field="(key, value) => { (vignette as unknown as Record<string, number>)[key] = value; }"
          @toggle-texture="textureOpen = !textureOpen"
          @update:texture-enabled="textureEnabled = $event"
          @texture-pick="textureFileInput?.click()"
          @texture-drop="onTextureDrop"
          @texture-clear="clearTexture"
          @texture-blend-mode="texture.blendMode = $event as typeof texture.blendMode"
          @texture-field="(key, value) => { (texture as unknown as Record<string, number>)[key] = value; }"
          @toggle-dof="dofOpen = !dofOpen"
          @update:dof-enabled="dofEnabled = $event"
          @dof-falloff="dof.falloff = $event as typeof dof.falloff"
          @dof-field="(key, value) => { (dof as unknown as Record<string, number>)[key] = value; }"
          @toggle-edges="edgesOpen = !edgesOpen"
          @toggle-edge="(edge) => { edgeOpen[edge] = !edgeOpen[edge]; }"
          @edge-enabled="(edge, value) => { (opts as unknown as Record<string, EdgeOptions>)[edge].enabled = value; }"
          @edge-slider="(edge, key, value) => { ((opts as unknown as Record<string, EdgeOptions>)[edge] as unknown as Record<string, number>)[key] = value; }"
          @reset="resetDefaults"
          @save-scriptorium="saveToScriptorium"
          @download="downloadPng"
          @copy="copyToClipboard"
        >
          <template #texture-input>
            <input
              ref="textureFileInput"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              class="sr-only"
              @change="onTextureFileChange"
            />
          </template>
        </IlluminateControlsPanel>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, reactive, computed, watch, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/components/common/PageHeader.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import IlluminatePreviewPanel from "@/components/illuminate/IlluminatePreviewPanel.vue";
import IlluminateControlsPanel from "@/components/illuminate/IlluminateControlsPanel.vue";
import { getCurrentUser } from "@/lib/supabase";
import { toWebP } from "@/lib/mediaConvert";
import { uploadToBucket } from "@/lib/storage";
import {
  applyEdgeTreatmentToCtx,
  processImage,
  DEFAULT_EDGE_TREATMENT,
  type EdgeTreatmentOptions,
  type EdgeOptions,
} from "@/lib/illuminate/edgeTreatment";
import {
  applyColourGrading,
  DEFAULT_COLOUR_GRADING,
  type ColourGradingOptions,
} from "@/lib/illuminate/colourGrading";
import {
  applyVignette,
  DEFAULT_VIGNETTE,
  type VignetteOptions,
} from "@/lib/illuminate/vignette";
import {
  applyDofBlur,
  drawFocalCrosshair,
  DEFAULT_DOF_BLUR,
  type DofBlurOptions,
} from "@/lib/illuminate/dofBlur";
import {
  applyTextureOverlay,
  DEFAULT_TEXTURE_OVERLAY,
  type TextureOverlayOptions,
} from "@/lib/illuminate/textureOverlay";
import {
  createBrushMaskController,
  DEFAULT_BRUSH_STATE,
  type BrushState,
} from "@/lib/illuminate/brushMask";

// ─── State ────────────────────────────────────────────────────────────────────

const fileInput      = ref<HTMLInputElement | null>(null);
const previewPanel   = ref<InstanceType<typeof IlluminatePreviewPanel> | null>(null);
const previewCanvas  = computed(() => previewPanel.value?.canvasEl ?? null);
const sourceImage    = ref<HTMLImageElement | null>(null);
const sourceFilename = ref("image");
const isExporting    = ref(false);
const copySuccess    = ref(false);
const isSavingBack   = ref(false);

const clipboardSupported =
  typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;

// ─── Scriptorium round-trip ───────────────────────────────────────────────────

const route     = useRoute();
const router    = useRouter();
const returnDocId = typeof route.query.returnTo === "string" ? route.query.returnTo : null;
const returnOldSrc = typeof route.query.oldSrc === "string" ? decodeURIComponent(route.query.oldSrc) : null;

function isValidAssetImageUrl(url: string): boolean {
  const base = (import.meta.env.VITE_SUPABASE_URL as string) + "/storage/v1/object/public/asset-images/";
  return url.startsWith(base);
}

onMounted(() => {
  window.addEventListener("keydown", onKeyDown);

  const srcParam = typeof route.query.src === "string" ? route.query.src : null;
  if (!srcParam) return;
  const decoded = decodeURIComponent(srcParam);
  if (!isValidAssetImageUrl(decoded)) return;

  const stem = decoded.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "image";
  sourceFilename.value = stem;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => { sourceImage.value = img; };
  img.src = decoded;
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown);
});

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

// Texture overlay state
const textureEnabled   = ref(false);
const textureImage     = shallowRef<HTMLImageElement | null>(null);
const textureFilename  = ref("");
const textureFileInput = ref<HTMLInputElement | null>(null);
const texture = reactive<Omit<TextureOverlayOptions, "enabled">>(
  structuredClone({ blendMode: DEFAULT_TEXTURE_OVERLAY.blendMode, opacity: DEFAULT_TEXTURE_OVERLAY.opacity, scale: DEFAULT_TEXTURE_OVERLAY.scale }),
);

// Accordion open state — each section collapses independently from its enable toggle
const gradingOpen  = ref(false);
const vignetteOpen = ref(false);
const textureOpen  = ref(false);
const dofOpen      = ref(false);
const edgesOpen    = ref(false);
const edgeOpen     = reactive<Record<string, boolean>>({ top: false, right: false, bottom: false, left: false });

// ─── Brush mode ───────────────────────────────────────────────────────────────

type IlluminatorMode = 'auto' | 'brush';
const mode = ref<IlluminatorMode>('auto');
const brush = reactive<BrushState>(structuredClone(DEFAULT_BRUSH_STATE));
const brushOpen = ref(true);
const brushController = createBrushMaskController();

// Brush cursor overlay state
const brushCursorVisible  = ref(false);
const brushCursorClientX  = ref(0);
const brushCursorClientY  = ref(0);
const brushCursorDiameter = ref(0);
const isErasing           = ref(true);

const canvasCursorClass = computed(() => {
  if (mode.value === 'brush') return 'cursor-none';
  if (dofEnabled.value) return 'cursor-crosshair';
  return '';
});

watch(mode, (m) => {
  if (m !== 'brush') brushCursorVisible.value = false;
  else brushOpen.value = true;
});

// ─── Colour grading helpers ───────────────────────────────────────────────────

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


function onDrop(e: DragEvent) {
  const file = e.dataTransfer?.files[0];
  if (file) loadFile(file);
}

function clearImage() {
  if (sourceImage.value) URL.revokeObjectURL(sourceImage.value.src);
  sourceImage.value = null;
  if (fileInput.value) fileInput.value.value = "";
}

function loadTextureFile(file: File) {
  if (!file.type.startsWith("image/")) return;
  textureFilename.value = file.name.replace(/\.[^.]+$/, "");
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    if (textureImage.value) URL.revokeObjectURL(textureImage.value.src);
    textureImage.value = img;
    textureEnabled.value = true;
  };
  img.src = url;
}

function onTextureFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) loadTextureFile(file);
}

function onTextureDrop(e: DragEvent) {
  const file = e.dataTransfer?.files[0];
  if (file) loadTextureFile(file);
}

function clearTexture() {
  if (textureImage.value) URL.revokeObjectURL(textureImage.value.src);
  textureImage.value = null;
  textureFilename.value = "";
  textureEnabled.value = false;
  if (textureFileInput.value) textureFileInput.value.value = "";
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

  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.clearRect(0, 0, pw, ph);
  ctx.drawImage(img, 0, 0, pw, ph);

  if (gradingEnabled.value) applyColourGrading(ctx, pw, ph, grading);
  if (dofEnabled.value) applyDofBlur(ctx, pw, ph, { ...dof, enabled: true });
  if (textureEnabled.value && textureImage.value) {
    applyTextureOverlay(ctx, pw, ph, { ...texture, enabled: true }, textureImage.value);
  }
  if (vignetteEnabled.value) applyVignette(ctx, pw, ph, { ...vignette, enabled: true });
  applyEdgeTreatmentToCtx(ctx, pw, ph, opts);
  brushController.applyToCtx(ctx, pw, ph);

  // Crosshair drawn last — visible in preview only, not in export
  if (dofEnabled.value) drawFocalCrosshair(ctx, pw, ph, dof.focalX, dof.focalY);
}

let renderTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, 60);
}

// rAF-based render for brush strokes — fires on next frame instead of debouncing,
// so erased pixels appear immediately as you paint.
let brushRafId: number | null = null;
function scheduleBrushRender(): void {
  if (brushRafId !== null) return;
  brushRafId = requestAnimationFrame(() => {
    brushRafId = null;
    renderPreview();
  });
}

watch(opts, scheduleRender, { deep: true });
watch(grading, scheduleRender, { deep: true });
watch(gradingEnabled, scheduleRender);
watch(vignette, scheduleRender, { deep: true });
watch(vignetteEnabled, scheduleRender);
watch(dof, scheduleRender, { deep: true });
watch(dofEnabled, scheduleRender);
watch(texture, scheduleRender, { deep: true });
watch(textureEnabled, scheduleRender);
watch(textureImage, scheduleRender);
watch(sourceImage, (img) => {
  if (img) {
    const scale = Math.min(1, MAX_PREVIEW / Math.max(img.naturalWidth, img.naturalHeight));
    brushController.resize(
      Math.round(img.naturalWidth  * scale),
      Math.round(img.naturalHeight * scale),
    );
  } else {
    brushController.clear();
  }
  renderTimer = setTimeout(renderPreview, 0);
});

// ─── Canvas interaction ───────────────────────────────────────────────────────

function onCanvasClick(e: MouseEvent) {
  if (!dofEnabled.value || mode.value === 'brush') return;
  const canvas = previewCanvas.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  dof.focalX = Math.max(0, Math.min(1, (e.clientX - rect.left)  / rect.width));
  dof.focalY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
}

// ─── Brush pointer handlers ───────────────────────────────────────────────────

function onBrushPointerDown(e: PointerEvent) {
  if (mode.value !== 'brush') return;
  e.preventDefault();
  const canvas = previewCanvas.value;
  if (!canvas || !sourceImage.value) return;
  canvas.setPointerCapture(e.pointerId);
  const erasing = e.button !== 2;
  isErasing.value = erasing;
  const rect = canvas.getBoundingClientRect();
  brushController.onPointerDown(e, rect, canvas.width, canvas.height, rect.width, rect.height, erasing, brush);
  scheduleBrushRender();
}

function onBrushPointerMove(e: PointerEvent) {
  if (mode.value !== 'brush' || !sourceImage.value) return;
  const canvas = previewCanvas.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  brushCursorClientX.value = e.clientX;
  brushCursorClientY.value = e.clientY;
  brushCursorDiameter.value = brush.size * 2 * (rect.width / canvas.width);
  if (e.buttons > 0) {
    brushController.onPointerMove(e, rect, canvas.width, canvas.height, rect.width, rect.height, isErasing.value, brush);
    scheduleBrushRender();
  }
}

function onBrushPointerUp() {
  brushController.onPointerUp();
}

function onBrushPointerEnter() {
  if (mode.value === 'brush') brushCursorVisible.value = true;
}

function onBrushPointerLeave() {
  brushCursorVisible.value = false;
}

function onBrushUndo() {
  if (brushController.undo()) scheduleRender();
}

function onKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && mode.value === 'brush') {
    e.preventDefault();
    onBrushUndo();
  }
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

function buildTextureFn(): ((ctx: CanvasRenderingContext2D, w: number, h: number) => void) | undefined {
  if (!textureEnabled.value || !textureImage.value) return undefined;
  const snapshot = { ...texture, enabled: true };
  const img = textureImage.value;
  return (ctx, w, h) => applyTextureOverlay(ctx, w, h, snapshot, img);
}

function buildBrushMaskFn(): ((ctx: CanvasRenderingContext2D, w: number, h: number) => void) | undefined {
  if (!brushController.hasStrokes) return undefined;
  const maskCanvas = brushController.maskCanvas;
  return (ctx, w, h) => {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(maskCanvas, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  };
}

async function downloadPng() {
  if (!sourceImage.value || isExporting.value) return;
  isExporting.value = true;
  try {
    const blob = await processImage(sourceImage.value, opts, buildGradingFn(), buildDofFn(), buildVignetteFn(), buildTextureFn(), buildBrushMaskFn());
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
    const blob = await processImage(sourceImage.value, opts, buildGradingFn(), buildDofFn(), buildVignetteFn(), buildTextureFn(), buildBrushMaskFn());
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    copySuccess.value = true;
    setTimeout(() => { copySuccess.value = false; }, 2000);
  } finally {
    isExporting.value = false;
  }
}

async function saveToScriptorium() {
  if (!sourceImage.value || isExporting.value || !returnDocId) return;
  isExporting.value = true;
  isSavingBack.value = true;
  try {
    const user = getCurrentUser();
    if (!user) return;
    const blob = await processImage(sourceImage.value, opts, buildGradingFn(), buildDofFn(), buildVignetteFn(), buildTextureFn(), buildBrushMaskFn());
    const stem = sourceFilename.value.replace(/\.[^.]+$/, "");
    const file = new File([blob], `${stem}-illuminated-${Date.now()}.png`, { type: "image/png" });
    const webpFile = await toWebP(file);
    const ext = webpFile.type === "image/jpeg" ? "jpeg" : "webp";
    const url = await uploadToBucket({
      bucket: "assetImages",
      blob: webpFile,
      path: `${user.id}/rte-${Date.now()}.${ext}`,
      contentType: webpFile.type,
    });
    if (!url) throw new Error("Upload failed");
    const params = new URLSearchParams({ updatedSrc: url });
    if (returnOldSrc) params.set("oldSrc", returnOldSrc);
    await router.push(`/scriptorium/${returnDocId}?${params.toString()}`);
  } catch {
    // silently leave the user on Illuminator so they can retry
  } finally {
    isExporting.value = false;
    isSavingBack.value = false;
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
  clearTexture();
  Object.assign(texture, { blendMode: DEFAULT_TEXTURE_OVERLAY.blendMode, opacity: DEFAULT_TEXTURE_OVERLAY.opacity, scale: DEFAULT_TEXTURE_OVERLAY.scale });
  brushController.clear();
  Object.assign(brush, structuredClone(DEFAULT_BRUSH_STATE));
}
</script>
