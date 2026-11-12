/*
 * The workbench's state (#1176 story 9b, frame 12).
 *
 * The old Illuminator page kept one reactive object per tool (grading,
 * vignette, depth of field, texture, edges, the brush) with an on/off switch
 * each, so a tool switched off still remembers its sliders. That stays: it is
 * what the tool panels bind to. What changed is the ends. It opens on a
 * picture's recipe (`loadSettings`) and gives one back (`finish`), instead of
 * a file in and a file out, so the quick edits in the panel and the workbench
 * are the same recipe.
 *
 * Two pictures live only here until Done: the painted mask (the Eraser on the
 * picture, held by the paint session) and a texture just picked. The mask is
 * uploaded as a WebP when the author finishes; a texture is uploaded as soon as
 * it is picked, so every recipe this hands back points at stored pictures only.
 * Paint layers live in the paint session in memory (#1181); saving them comes later.
 */
import { computed, reactive, ref, shallowRef, watch } from "vue";
import { useHotkeys } from "@/composables/useHotkeys";
import { useToast } from "@/composables/useToast";
import { downloadBlob } from "@/lib/downloadBlob";
import { toWebP } from "@/lib/mediaConvert";
import { encodeWebp } from "@/lib/webpEncode";
import { uploadToBucket } from "@/lib/storage";
import { markForSweep } from "@/scriptorium/composables/illuminatorSweep";
import { applySteps, processImage } from "@/scriptorium/illuminator/lib/applySteps";
import { croppedSize, drawBase } from "@/scriptorium/illuminator/lib/crop";
import { bakeSize } from "@/scriptorium/illuminator/lib/renderBake";
import { dragCrop, fitRatio, FULL_CROP, shapeRatio, type CropHandle, type CropRect, type CropShape } from "@/scriptorium/illuminator/lib/cropBox";
import { DEFAULT_COLOUR_GRADING, type ColourGradingOptions } from "@/scriptorium/illuminator/lib/colourGrading";
import { DEFAULT_DOF_BLUR, drawFocalCrosshair, type DofBlurOptions } from "@/scriptorium/illuminator/lib/dofBlur";
import { DEFAULT_EDGE_TREATMENT, type EdgeTreatmentOptions } from "@/scriptorium/illuminator/lib/edgeTreatment";
import { loadDomImage, type LoadImage } from "@/scriptorium/illuminator/lib/loadImage";
import { FADED_SIDE, PAPER_PANEL_SIDE, type EdgeStyle } from "@/scriptorium/illuminator/lib/recipeEdits";
import { DEFAULT_TEXTURE_OVERLAY, type DecodedImage, type TextureOverlayOptions } from "@/scriptorium/illuminator/lib/textureOverlay";
import { DEFAULT_PAPER_SIDE, PAPER_SIDES, type PaperEdgeOptions, type PaperSide } from "@/scriptorium/illuminator/lib/tornPaper";
import { baseImageUrl, clampCrop, type AiStep, type IlluminateSettings, type IlluminateStep, type WashStep } from "@/scriptorium/illuminator/lib/treatment";
import { DEFAULT_VIGNETTE, type VignetteOptions } from "@/scriptorium/illuminator/lib/vignette";
import { renderPaintPicture } from "@/scriptorium/illuminator/paint/paintPicture";
import type { PaintTool } from "@/scriptorium/illuminator/paint/session/types";
import { usePaintSession } from "@/scriptorium/illuminator/paint/usePaintSession";

/** The tools that change the recipe's picture, and the ones that paint on it (#1181). */
export type PictureTool = "crop" | "edges" | "grade" | "vignette" | "texture" | "wash" | "focus";
export type WorkbenchTool = PictureTool | PaintTool;

const PAINT_TOOLS: readonly PaintTool[] = ["brush", "smudge", "eraser", "picker"];
export function isPaintTool(tool: WorkbenchTool): tool is PaintTool {
  return PAINT_TOOLS.some((t) => t === tool);
}

/** Long edge of the working preview: sharp on screen, cheap enough to redraw as a slider moves. */
const MAX_PREVIEW = 900;
/** Stand-in for the painted mask, which is not a stored picture until Done. */
const VIEW_MASK = "view:mask";
/** The mask only needs its alpha, so it is stored compact. */
const MASK_QUALITY = 0.9;

function defaultPaper(): PaperEdgeOptions {
  const side = () => ({ ...DEFAULT_PAPER_SIDE, ...PAPER_PANEL_SIDE });
  return { top: side(), right: side(), bottom: side(), left: side() };
}

export interface WorkbenchOptions {
  /** The untouched picture the recipe is applied to. */
  original: () => string;
  /** The recipe the picture already has, if any. */
  settings: () => IlluminateSettings | null;
  userId: () => string | undefined;
  /** The two canvases of the stage: the original, and the picture with its edits. */
  canvases: () => { before: HTMLCanvasElement | null; after: HTMLCanvasElement | null };
  /** Asks the paint stage to draw its next frame (after an undo, a layer change). */
  redrawPaint?: () => void;
  /** The hotkeys belong to the workbench only while it is open. */
  active?: () => boolean;
  /** Width over height of the page the picture sits on, for art placed on the page; null for a picture in the text. */
  pageAspect?: () => number | null;
}

export function useIlluminateWorkbench(opts: WorkbenchOptions) {
  const toast = useToast();

  /** The picture every step is drawn over: the AI result when there is one, else the original. */
  const image = shallowRef<HTMLImageElement | null>(null);
  /** The untouched original, for the before side of the divider. */
  const originalImage = shallowRef<HTMLImageElement | null>(null);
  /** An AI picture action's stored result. It is the base image, not a layer (treatment.ts). */
  const aiStep = ref<AiStep | null>(null);
  const loadError = ref("");
  const tool = ref<WorkbenchTool>("edges");
  const seed = ref(Math.floor(Math.random() * 1e9));

  // ── Tool state ────────────────────────────────────────────────────────────
  const edgeStyle = ref<EdgeStyle>("straight");
  const classic = reactive<EdgeTreatmentOptions>(structuredClone(DEFAULT_EDGE_TREATMENT));
  const paper = reactive<PaperEdgeOptions>(defaultPaper());
  const grading = reactive<ColourGradingOptions>(structuredClone(DEFAULT_COLOUR_GRADING));
  const gradingEnabled = ref(false);
  const vignette = reactive<VignetteOptions>(structuredClone(DEFAULT_VIGNETTE));
  const vignetteEnabled = ref(false);
  const dof = reactive<DofBlurOptions>(structuredClone(DEFAULT_DOF_BLUR));
  const dofEnabled = ref(false);
  const texture = reactive<Omit<TextureOverlayOptions, "enabled">>({
    blendMode: DEFAULT_TEXTURE_OVERLAY.blendMode,
    opacity: DEFAULT_TEXTURE_OVERLAY.opacity,
    scale: DEFAULT_TEXTURE_OVERLAY.scale,
  });
  const textureEnabled = ref(false);
  /** The paper wash, or null when there is none. */
  const wash = ref<WashStep | null>(null);
  /** The stored texture picture, and what to call it. */
  const textureUrl = ref<string | null>(null);
  const textureFilename = ref("");
  /** The crop box, in fractions of the base picture; the whole picture when nothing is cropped. */
  const crop = reactive<CropRect>({ ...FULL_CROP });
  const cropShape = ref<CropShape>("free");
  const pageAspect = computed(() => opts.pageAspect?.() ?? null);
  const paint = usePaintSession({ redraw: () => opts.redrawPaint?.() });
  /** A saved mask the picture came with, until the author erases differently on the picture. */
  const maskUrl = ref<string | null>(null);
  /**
   * Whether the picture is erased anywhere: the session's mask once it has started, else the saved one. The
   * recipe has a mask step exactly when this is true.
   */
  const hasMask = computed(() => (paint.ready.value ? paint.hasMask.value : maskUrl.value !== null));
  const paintError = ref("");

  const busy = ref(false);
  const copied = ref(false);
  const clipboardSupported = typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;

  // ── Before / after ────────────────────────────────────────────────────────
  /** Where the divider sits: the left of it shows the original, the right the edits. */
  const comparePos = ref(50);
  /** Held O: the whole picture as it was (B is the Brush). */
  const showOriginal = ref(false);

  // ── Recipe in and out ─────────────────────────────────────────────────────
  function syncSides(from: Record<PaperSide, boolean>) {
    for (const side of PAPER_SIDES) {
      classic[side].enabled = from[side];
      paper[side].enabled = from[side];
    }
  }

  function setEdgeSideEnabled(side: PaperSide, value: boolean) {
    classic[side].enabled = value;
    paper[side].enabled = value;
  }

  function sidesOn(): Record<PaperSide, boolean> {
    return { top: paper.top.enabled || classic.top.enabled, right: paper.right.enabled || classic.right.enabled, bottom: paper.bottom.enabled || classic.bottom.enabled, left: paper.left.enabled || classic.left.enabled };
  }

  /** Choose a style. The sides already on stay on; with none on, all four are. */
  function setEdgeStyle(style: EdgeStyle) {
    if (style === "straight") {
      edgeStyle.value = style;
      return;
    }
    const sides = sidesOn();
    const any = PAPER_SIDES.some((s) => sides[s]);
    if (style === "faded") for (const s of PAPER_SIDES) Object.assign(classic[s], FADED_SIDE);
    if (style === "classic" && edgeStyle.value === "faded") for (const s of PAPER_SIDES) Object.assign(classic[s], structuredClone(DEFAULT_EDGE_TREATMENT)[s], { enabled: classic[s].enabled });
    edgeStyle.value = style;
    syncSides(any ? sides : { top: true, right: true, bottom: true, left: true });
  }

  function resetState() {
    edgeStyle.value = "straight";
    Object.assign(classic, structuredClone(DEFAULT_EDGE_TREATMENT));
    Object.assign(paper, defaultPaper());
    Object.assign(grading, structuredClone(DEFAULT_COLOUR_GRADING));
    gradingEnabled.value = false;
    Object.assign(vignette, structuredClone(DEFAULT_VIGNETTE));
    vignetteEnabled.value = false;
    Object.assign(dof, structuredClone(DEFAULT_DOF_BLUR));
    dofEnabled.value = false;
    Object.assign(texture, { blendMode: DEFAULT_TEXTURE_OVERLAY.blendMode, opacity: DEFAULT_TEXTURE_OVERLAY.opacity, scale: DEFAULT_TEXTURE_OVERLAY.scale });
    textureEnabled.value = false;
    wash.value = null;
    textureUrl.value = null;
    textureFilename.value = "";
    Object.assign(crop, FULL_CROP);
    cropShape.value = "free";
    discardPaint();
  }

  /** Put a recipe's steps into the tools. A step is on; a tool with no step is off with its defaults. */
  function loadSettings(settings: IlluminateSettings | null) {
    resetState();
    aiStep.value = null;
    if (!settings) return;
    seed.value = settings.seed;
    for (const step of settings.steps) {
      switch (step.type) {
        case "grade":
          Object.assign(grading, step.options);
          gradingEnabled.value = true;
          break;
        case "dof":
          Object.assign(dof, step.options);
          dofEnabled.value = true;
          break;
        case "vignette":
          Object.assign(vignette, step.options);
          vignetteEnabled.value = true;
          break;
        case "texture":
          Object.assign(texture, { blendMode: step.blendMode, opacity: step.opacity, scale: step.scale });
          textureUrl.value = step.url;
          textureFilename.value = "Saved texture";
          textureEnabled.value = true;
          break;
        case "edges":
          if (step.style === "paper") {
            Object.assign(paper, { top: step.top, right: step.right, bottom: step.bottom, left: step.left });
            edgeStyle.value = "paper";
          } else {
            Object.assign(classic, { top: step.top, right: step.right, bottom: step.bottom, left: step.left });
            edgeStyle.value = PAPER_SIDES.every((s) => !step[s].enabled || step[s].variation <= 0.05) ? "faded" : "classic";
          }
          syncSides({ top: step.top.enabled, right: step.right.enabled, bottom: step.bottom.enabled, left: step.left.enabled });
          break;
        case "wash":
          wash.value = { ...step };
          break;
        case "mask":
          maskUrl.value = step.url;
          break;
        case "ai":
          aiStep.value = step;
          break;
        case "crop":
          Object.assign(crop, { x: step.x, y: step.y, w: step.w, h: step.h });
          break;
      }
    }
  }

  /** The tools as a recipe. The preview takes the mask from the session's canvas; the final recipe points at the stored mask. */
  function buildSettings(forPreview: boolean): IlluminateSettings {
    const steps: IlluminateStep[] = [];
    if (aiStep.value) steps.push({ ...aiStep.value });
    const kept = clampCrop(crop.x, crop.y, crop.w, crop.h);
    if (kept) steps.push(kept);
    if (gradingEnabled.value) steps.push({ type: "grade", options: { ...grading } });
    if (dofEnabled.value) {
      const { enabled: _enabled, ...options } = dof;
      steps.push({ type: "dof", options });
    }
    if (textureEnabled.value && textureUrl.value) {
      steps.push({ type: "texture", url: textureUrl.value, blendMode: texture.blendMode, opacity: texture.opacity, scale: texture.scale });
    }
    if (vignetteEnabled.value) {
      const { enabled: _enabled, ...options } = vignette;
      steps.push({ type: "vignette", options });
    }
    if (edgeStyle.value !== "straight" && PAPER_SIDES.some((s) => sidesOn()[s])) {
      if (edgeStyle.value === "paper") steps.push({ type: "edges", style: "paper", top: { ...paper.top }, right: { ...paper.right }, bottom: { ...paper.bottom }, left: { ...paper.left } });
      else steps.push({ type: "edges", style: "classic", top: { ...classic.top }, right: { ...classic.right }, bottom: { ...classic.bottom }, left: { ...classic.left } });
    }
    if (wash.value) steps.push({ ...wash.value });
    if (hasMask.value) {
      const local = paint.ready.value && (forPreview || paint.maskDirty.value || !maskUrl.value);
      const url = local ? VIEW_MASK : maskUrl.value;
      if (url !== null) steps.push({ type: "mask", url });
    }
    return { v: 1, seed: seed.value, steps };
  }

  /** Upload what is only local (the painted mask) and hand back the finished recipe. */
  async function finish(): Promise<IlluminateSettings> {
    if (!hasMask.value) return buildSettings(false);
    if (paint.ready.value && (paint.maskDirty.value || !maskUrl.value)) {
      const user = opts.userId();
      if (!user) throw new Error("Sign in again to save the erasing.");
      const canvas = paint.maskCanvas();
      if (!canvas) throw new Error("Could not read the erasing.");
      // The pictures bucket takes WebP and JPEG, not PNG; WebP keeps the mask's alpha.
      const blob = await encodeWebp(canvas, MASK_QUALITY);
      const url = await uploadToBucket({ bucket: "assetImages", blob, path: `${user}/ill-mask-${crypto.randomUUID().slice(0, 8)}.webp`, contentType: "image/webp" });
      if (!url) throw new Error("Could not store the erasing.");
      // Marked at once: the sweep keeps it only if the saved recipe refers to it.
      markForSweep(url);
      maskUrl.value = url;
      paint.maskDirty.value = false;
    }
    return buildSettings(false);
  }

  // ── Loading pictures ──────────────────────────────────────────────────────
  const pictureCache = new Map<string, Promise<DecodedImage>>();
  const loader: LoadImage = (url) => {
    if (url === VIEW_MASK) {
      const canvas = paint.maskCanvas();
      return canvas ? Promise.resolve(canvas) : Promise.reject(new Error("No painted mask yet."));
    }
    let loaded = pictureCache.get(url);
    if (!loaded) {
      loaded = loadDomImage(url);
      pictureCache.set(url, loaded);
    }
    return loaded;
  };

  function previewOf(size: { width: number; height: number }) {
    const scale = Math.min(1, MAX_PREVIEW / Math.max(size.width, size.height));
    return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
  }

  /** The picture as it comes out: the crop applied. The stage shows it, and the painting is the same shape. */
  const outputSize = computed(() => {
    const img = image.value;
    if (!img) return { width: 0, height: 0 };
    return previewOf(croppedSize({ width: img.naturalWidth, height: img.naturalHeight }, buildSettings(true)));
  });
  /** What the stage shows: the whole picture while the crop box is being set, else the output. */
  const previewSize = computed(() => {
    const img = image.value;
    if (!img) return { width: 0, height: 0 };
    return tool.value === "crop" ? previewOf({ width: img.naturalWidth, height: img.naturalHeight }) : outputSize.value;
  });

  async function open() {
    const recipe = opts.settings();
    loadSettings(recipe);
    try {
      originalImage.value = await loadDomImage(opts.original());
      const base = baseImageUrl(opts.original(), recipe);
      image.value = base === opts.original() ? originalImage.value : await loadDomImage(base);
    } catch {
      loadError.value = "The picture could not be opened.";
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  let renderToken = 0;
  async function renderPreview() {
    const img = image.value;
    const { before, after } = opts.canvases();
    if (!img || !after) return;
    const token = ++renderToken;
    const { width: pw, height: ph } = previewSize.value;

    // Drawn off screen, then copied over, so a slow render never shows half a picture
    // and a newer render is never overwritten by an older one.
    const scratch = document.createElement("canvas");
    scratch.width = pw;
    scratch.height = ph;
    const ctx = scratch.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    // Setting the crop shows the whole picture (and no strokes, which belong to the cropped one).
    const cropping = tool.value === "crop";
    const recipe = buildSettings(true);
    const drawn = cropping ? { ...recipe, steps: recipe.steps.filter((step) => step.type !== "crop" && step.type !== "mask") } : recipe;
    const natural = { width: img.naturalWidth, height: img.naturalHeight };
    drawBase(ctx, img, natural, drawn, pw, ph);
    try {
      await applySteps(ctx, pw, ph, drawn, loader, { sourceWidth: croppedSize(natural, drawn).width });
    } catch {
      // A texture that cannot load leaves the rest of the picture drawn.
    }
    if (token !== renderToken) return;

    // The before side is always the original, fitted whole inside the base's shape (an AI result may differ).
    const was = originalImage.value;
    if (before && was) {
      before.width = pw;
      before.height = ph;
      const fit = Math.min(pw / was.naturalWidth, ph / was.naturalHeight);
      const w = was.naturalWidth * fit;
      const h = was.naturalHeight * fit;
      before.getContext("2d")?.drawImage(was, (pw - w) / 2, (ph - h) / 2, w, h);
    }
    after.width = pw;
    after.height = ph;
    const out = after.getContext("2d", { willReadFrequently: true });
    if (!out) return;
    out.clearRect(0, 0, pw, ph);
    out.drawImage(scratch, 0, 0);
    // The crosshair is for the preview only; it is never in the picture.
    if (tool.value === "focus" && dofEnabled.value) drawFocalCrosshair(out, pw, ph, dof.focalX, dof.focalY);
  }

  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => void renderPreview(), 60);
  }

  const settingsKey = computed(() => JSON.stringify(buildSettings(true)));
  watch([settingsKey, paint.maskVersion, tool], scheduleRender);

  // ── Painting ──────────────────────────────────────────────────────────────
  /** The picture the paint sits on: every step but the mask. It is redrawn under the paint when this changes. */
  const pictureKey = computed(() => JSON.stringify(buildSettings(true).steps.filter((step) => step.type !== "mask")));
  const outputKey = computed(() => `${outputSize.value.width}x${outputSize.value.height}`);
  let startingPaint = false;
  let paintedPicture = "";
  let pictureToken = 0;

  /** The document's size: the cropped picture at bake size, so the Eraser's mask is at full resolution. */
  function documentSize() {
    const img = image.value;
    if (!img) return null;
    return bakeSize(croppedSize({ width: img.naturalWidth, height: img.naturalHeight }, buildSettings(true)));
  }

  /** Starts the session on first use of a paint tool, at the picture's size, over the recipe's picture. */
  async function ensurePaint() {
    const img = image.value;
    const size = documentSize();
    const armed = tool.value;
    if (!img || !size || paint.ready.value || startingPaint || !isPaintTool(armed)) return;
    startingPaint = true;
    paintError.value = "";
    try {
      const key = pictureKey.value;
      const picture = await renderPaintPicture(img, size, buildSettings(true), loader);
      let mask: CanvasImageSource | null = null;
      if (maskUrl.value) {
        try {
          mask = (await loader(maskUrl.value)) as CanvasImageSource;
        } catch {
          // A saved mask that cannot be read is dropped, as it always was: the picture shows whole.
          maskUrl.value = null;
        }
      }
      const current = tool.value;
      await paint.start({ size, picture, mask, tool: isPaintTool(current) ? current : armed });
      paintedPicture = key;
    } catch {
      paintError.value = "Painting could not start. Try again.";
      toast.error(paintError.value);
    } finally {
      startingPaint = false;
    }
  }

  /** Repaints the picture under the paint when another tool changed it. */
  async function refreshPicture() {
    const img = image.value;
    const size = documentSize();
    if (!img || !size || !paint.ready.value || pictureKey.value === paintedPicture) return;
    const key = pictureKey.value;
    const token = ++pictureToken;
    const picture = await renderPaintPicture(img, size, buildSettings(true), loader);
    if (token !== pictureToken || !paint.ready.value) return;
    paintedPicture = key;
    paint.setPicture(picture);
  }

  /** Forgets the painting and the saved mask: the picture changed shape, or the author reset everything. */
  function discardPaint() {
    pictureToken++;
    paint.stop();
    maskUrl.value = null;
    paint.maskDirty.value = false;
    paint.maskVersion.value++;
    paintedPicture = "";
  }

  watch([tool, pictureKey, image], async ([t]) => {
    if (!isPaintTool(t)) return;
    if (paint.ready.value) {
      paint.setTool(t);
      await refreshPicture();
    } else await ensurePaint();
  });

  // The painting is sized to the output (the cropped picture). A new base of the same shape (an AI result)
  // keeps it; a different shape means what was painted would land in the wrong place, so it is cleared. While
  // the crop box is being set the shape is not final, so this waits for another tool.
  let shapeKey = "";
  watch([image, outputKey, tool], async ([img, key, current]) => {
    if (!img || current === "crop") return;
    if (shapeKey === "") {
      shapeKey = key;
      return;
    }
    if (key === shapeKey) {
      scheduleRender();
      return;
    }
    shapeKey = key;
    if (hasMask.value || paint.layers.value.some((l) => l.kind === "paint")) toast.info("The brush strokes were cleared because the picture changed shape.");
    discardPaint();
    if (isPaintTool(current)) await ensurePaint();
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => void renderPreview(), 0);
  });

  function dispose() {
    clearTimeout(renderTimer);
    renderToken++;
    pictureToken++;
    paint.stop();
  }

  // ── Canvas interaction ────────────────────────────────────────────────────
  function onCanvasClick(e: MouseEvent) {
    if (tool.value !== "focus" || !dofEnabled.value) return;
    const canvas = opts.canvases().after;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    dof.focalX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    dof.focalY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
  }

  // ── Keys ──────────────────────────────────────────────────────────────────
  /** Arming a paint tool from a key; the session follows through the tool watcher. */
  const arm = (t: PaintTool) => () => {
    tool.value = t;
  };
  const painting = () => isPaintTool(tool.value);
  /** [ and ] step the size by a tenth, at least a pixel: finer at small sizes, quicker at large. */
  const nudgeSize = (direction: 1 | -1) => () => {
    const values = paint.optionValues.value;
    if (!painting() || !values) return;
    const step = Math.max(1, Math.round(values.size * 0.1));
    paint.setOption("size", Math.min(400, Math.max(1, values.size + direction * step)));
  };
  useHotkeys(
    () => [
      { combo: "o", description: "Hold to see the original picture (O, since B is the Brush)", handler: () => { showOriginal.value = true; }, onRelease: () => { showOriginal.value = false; }, ignoreRepeat: true },
      { combo: "b", description: "Brush", handler: arm("brush") },
      { combo: "s", description: "Smudge", handler: arm("smudge") },
      { combo: "e", description: "Eraser", handler: arm("eraser") },
      { combo: "i", description: "Pick a colour", handler: arm("picker") },
      { combo: "[", description: "Smaller brush", handler: nudgeSize(-1) },
      { combo: "]", description: "Larger brush", handler: nudgeSize(1) },
      { combo: "mod+z", description: "Undo the last painting step", handler: () => { if (painting()) paint.undo(); } },
      { combo: "shift+mod+z", description: "Redo the painting step", handler: () => { if (painting()) paint.redo(); } },
      { combo: "mod+y", description: "Redo the painting step", handler: () => { if (painting()) paint.redo(); } },
    ],
    { layer: "overlay", enabled: () => opts.active?.() ?? true },
  );

  // ── Texture ───────────────────────────────────────────────────────────────
  async function pickTexture(file: File) {
    if (!file.type.startsWith("image/")) return;
    const user = opts.userId();
    if (!user) {
      toast.error("Sign in again to add a texture.");
      return;
    }
    try {
      const webp = await toWebP(file);
      const url = await uploadToBucket({ bucket: "assetImages", blob: webp, path: `${user}/ill-texture-${crypto.randomUUID().slice(0, 8)}.webp`, contentType: webp.type });
      if (!url) throw new Error("upload failed");
      markForSweep(url);
      textureUrl.value = url;
      textureFilename.value = file.name.replace(/\.[^.]+$/, "");
      textureEnabled.value = true;
    } catch {
      toast.error("The texture could not be added.");
    }
  }

  function clearTexture() {
    textureUrl.value = null;
    textureFilename.value = "";
    textureEnabled.value = false;
  }

  // ── Crop ──────────────────────────────────────────────────────────────────
  function setCropShape(shape: CropShape) {
    cropShape.value = shape;
    const ratio = shapeRatio(shape, pageAspect.value);
    const img = image.value;
    if (ratio !== null && img) Object.assign(crop, fitRatio(crop, ratio, img.naturalWidth / img.naturalHeight));
  }

  /** A drag of the crop box: `start` is the box when the drag began, (dx, dy) how far it went, in fractions of the picture. */
  function dragCropBox(handle: CropHandle, start: CropRect, dx: number, dy: number) {
    const img = image.value;
    if (!img) return;
    Object.assign(crop, dragCrop(start, handle, dx, dy, shapeRatio(cropShape.value, pageAspect.value), img.naturalWidth / img.naturalHeight));
  }

  function resetCrop() {
    Object.assign(crop, FULL_CROP);
    cropShape.value = "free";
  }

  /** Every tool back to nothing, the painting included. */
  function resetAll() {
    const keepSeed = seed.value;
    resetState();
    seed.value = keepSeed;
    scheduleRender();
    if (isPaintTool(tool.value)) void ensurePaint();
  }

  // ── Output ────────────────────────────────────────────────────────────────
  async function run(task: () => Promise<void>) {
    const img = image.value;
    if (!img || busy.value) return;
    busy.value = true;
    try {
      await task();
    } catch {
      toast.error("That did not work. Try again.");
    } finally {
      busy.value = false;
    }
  }

  const exportName = () => `${(opts.original().split("/").pop() ?? "picture").replace(/\.[^.]+$/, "")}-illuminated`;

  function renderPng(): Promise<Blob> {
    const img = image.value;
    if (!img) return Promise.reject(new Error("No picture."));
    return processImage(img, buildSettings(true), loader);
  }

  const downloadPng = () => run(async () => downloadBlob(await renderPng(), `${exportName()}.png`));

  const copyPng = () =>
    run(async () => {
      if (!clipboardSupported) return;
      await navigator.clipboard.write([new ClipboardItem({ "image/png": await renderPng() })]);
      copied.value = true;
      setTimeout(() => { copied.value = false; }, 2000);
    });

  /** A new picture in the author's own pictures. The picture in the book stays as it is. */
  const saveAsNewPicture = () =>
    run(async () => {
      const user = opts.userId();
      if (!user) throw new Error("Not signed in.");
      const png = await renderPng();
      const webp = await toWebP(new File([png], `${exportName()}.png`, { type: "image/png" }));
      const ext = webp.type === "image/jpeg" ? "jpeg" : "webp";
      const url = await uploadToBucket({ bucket: "assetImages", blob: webp, path: `${user}/rte-${Date.now()}.${ext}`, contentType: webp.type });
      if (!url) throw new Error("Upload failed");
      toast.success("Saved as a new picture in your pictures.");
    });

  /** Whether the tools hold any edit at all. An AI result is the base picture, undone on its own, not a tool. */
  const hasEdits = computed(() => buildSettings(true).steps.some((step) => step.type !== "ai"));

  // ── AI result ─────────────────────────────────────────────────────────────
  /** The picture the next AI action works from: the current base. */
  const baseUrl = computed(() => aiStep.value?.output ?? opts.original());

  /** Make a stored AI picture the base. A second action's output replaces the first, and the action records the chain. */
  async function setAiResult(url: string, action: string) {
    // A second action replaces the first, and Cancel drops both: mark it, the sweep keeps what the recipe commits.
    markForSweep(url);
    const next = await loadDomImage(url);
    const was = image.value;
    aiStep.value = { type: "ai", action: aiStep.value ? `${aiStep.value.action}+${action}` : action, output: url };
    // Paint on a differently shaped picture would land in the wrong place: it goes with it.
    if (was && Math.abs(was.naturalWidth / was.naturalHeight - next.naturalWidth / next.naturalHeight) > 0.01) discardPaint();
    image.value = next;
  }

  /** Back to the original picture: the AI result leaves the recipe. The stored output stays where it is. */
  function clearAiResult() {
    if (!aiStep.value) return;
    aiStep.value = null;
    image.value = originalImage.value;
  }

  return {
    image, loadError, tool, previewSize, crop, cropShape, pageAspect, setCropShape, dragCropBox, resetCrop, aiStep, baseUrl, setAiResult, clearAiResult,
    edgeStyle, classic, paper, grading, gradingEnabled, vignette, vignetteEnabled, dof, dofEnabled,
    texture, textureEnabled, wash, textureUrl, textureFilename, paint, hasMask, paintError,
    comparePos, showOriginal, busy, copied, clipboardSupported, hasEdits,
    open, dispose, finish, buildSettings, setEdgeStyle, setEdgeSideEnabled, resetAll,
    onCanvasClick, pickTexture, clearTexture, downloadPng, copyPng, saveAsNewPicture,
  };
}
