/*
 * The painting session as the workbench uses it (#1181): the pure session and the compositor, wrapped in Vue
 * reactivity. The session and its tiles mutate in place and are never made reactive (a large layer would be
 * proxied pixel by pixel); instead `revision` is bumped after every change a panel can see, and each derived
 * value reads it. The compositor is told what changed from the ids and tile keys the session returns, so a
 * stroke uploads only its tiles and an undo only its layers.
 *
 * One composable per workbench. A session starts on the first use of a paint tool, at the picture's bake size,
 * and lasts until the picture changes shape or the author resets everything.
 */
import { computed, ref, shallowRef } from "vue";
import { STOCK_BRUSHES } from "./brushes/stockBrushes";
import { useYoursBrushes, type UserBrushesApi } from "./useYoursBrushes";
import { loadPaintAssets, loadPaperSurface, type PaintAssetStore } from "./assets/loadPaintAssets";
import type { Paper } from "@/scriptorium/papers/papers";
import { effectiveValues, cursorOf } from "./components/paintOptions";
import { sampleThumbnail } from "./components/layerThumbnail";
import type { BrushBlend, BrushPreset, PressureCurve, Rgb } from "./engine/types";
import { loadMaskFromImage, maskHasPaint, maskToCanvas } from "./maskPixels";
import { loadPressureCurve, savePressureCurve } from "./pressureStore";
import { createCompositor, type Compositor } from "./render/compositor";
import type { PenReading } from "./render/penSamples";
import { createPaintSession, DEFAULT_BACKGROUND, DEFAULT_INK } from "./session/paintSession";
import type { Layer, LayerBlend, PaintLayer, PaintSessionApi, PaintTool, PictureLayer } from "./session/types";

export interface PaintStart {
  size: { width: number; height: number };
  /** The recipe's picture at document size, without its mask step: the paint and the mask sit on this. */
  picture: CanvasImageSource;
  /** A saved mask picture, decoded into the picture layer's mask. */
  mask: CanvasImageSource | null;
  tool: PaintTool;
  /** The sheet under the painting, from a saved paint step; null for none. */
  paper?: Paper | null;
  /** Paint layers a saved painting brings back; they are loaded, not edited, so nothing starts dirty. */
  layers?: PaintLayer[];
  /** The picture already holds a painting in the recipe, so painting it again is never a new canvas. */
  hadCanvas?: boolean;
}

export type LayerProps = Partial<Pick<PaintLayer, "name" | "blend" | "opacity" | "visible" | "lockAlpha">>;

const THUMB = 32;
type BrushTool = Exclude<PaintTool, "picker">;

export interface PaintSessionOptions {
  redraw: () => void;
  assets?: PaintAssetStore;
  /** The painter's own brushes; made from the asset store when not given (tests pass a stub). */
  user?: UserBrushesApi;
  /** Whether the account may hold another painting with layers (the plan's `paint_canvases` quota). Asked once, before the first layer a picture without a painting makes. */
  canMakeCanvas?: () => boolean;
  /** Called when `canMakeCanvas` said no, so the workbench can show the upgrade prompt. */
  onCanvasRefused?: () => void;
}

export function usePaintSession(opts: PaintSessionOptions) {
  const assets = opts.assets ?? loadPaintAssets();
  const session = shallowRef<PaintSessionApi | null>(null);
  const compositor = shallowRef<Compositor | null>(null);
  /** Bumped after anything a panel shows changes; every derived value below reads it. */
  const revision = ref(0);
  /** The picture's mask changed since the session started or since the saved mask was loaded. */
  const maskDirty = ref(false);
  /** Bumped when the mask changes, so a picture tool's preview redraws with the new erasure. */
  const maskVersion = ref(0);
  const curve = ref<PressureCurve>(loadPressureCurve());
  const yours = useYoursBrushes(assets, opts.user);
  const library = yours.library;
  const pen = ref<PenReading | null>(null);
  /** The colour is kept here too, so the rail's swatch shows it before a session has started. */
  const colourNow = ref<Rgb>(DEFAULT_INK);
  /** The background colour: not painted with until X swaps it to the front. Kept here only; nothing is saved. */
  const backgroundNow = ref<Rgb>(DEFAULT_BACKGROUND);
  /** Which of the two the Colour panel edits. */
  const editing = ref<"foreground" | "background">("foreground");
  let startToken = 0;
  let opacityDraft: { id: string; start: number } | null = null;
  let maskCache: { version: number; canvas: HTMLCanvasElement } | null = null;
  /** The recipe held a painting when the session started: it is not a new canvas for the quota. */
  let hadCanvas = false;

  const bump = () => {
    revision.value++;
  };
  /** Makes a computed depend on the revision. */
  const track = () => revision.value;

  function live(): { s: PaintSessionApi; c: Compositor } | null {
    return session.value && compositor.value ? { s: session.value, c: compositor.value } : null;
  }

  async function start(o: PaintStart): Promise<void> {
    stop();
    const token = ++startToken;
    await assets.preloadStock();
    // A newer start (or a stop) overtook this one while the brushes loaded.
    if (token !== startToken) return;
    const s = createPaintSession({ width: o.size.width, height: o.size.height, paper: o.paper ?? null, layers: o.layers, picture: true, assets, curve: curve.value, colour: colourNow.value });
    hadCanvas = o.hadCanvas === true;
    s.state.tool = o.tool;
    const pictureLayer = s.state.doc.layers.find((l): l is PictureLayer => l.kind === "picture");
    if (o.mask && pictureLayer) loadMaskFromImage(pictureLayer.mask, o.mask);
    const c = createCompositor({ width: o.size.width, height: o.size.height, picture: o.picture });
    c.syncLayers(s.state.doc.layers);
    maskDirty.value = false;
    session.value = s;
    compositor.value = c;
    if (o.paper) {
      // The sheet's grain reaches the brushes through the session; the sheet itself is laid under the painting
      // here, at the scale a blank sheet and the page draw it, for display only. A sheet that cannot load leaves
      // the checker under the paint, which still paints and saves.
      const paper = o.paper;
      void loadPaperSurface(paper)
        .then((surface) => {
          if (compositor.value !== c) return;
          c.setPaper(surface, paper.surfaceScale);
          opts.redraw();
        })
        .catch(() => undefined);
    }
    bump();
  }

  function stop(): void {
    yours.flush();
    startToken++;
    compositor.value?.dispose();
    compositor.value = null;
    session.value = null;
    maskCache = null;
    hadCanvas = false;
    opacityDraft = null;
    bump();
  }

  /** Another edit changed what lies under the paint. */
  function setPicture(picture: CanvasImageSource): void {
    compositor.value?.setPicture(picture);
    opts.redraw();
  }

  /** Brings the compositor in step after a change to the layer list or to these layers' pixels. */
  function sync(ids: readonly string[]): void {
    const l = live();
    if (!l) return;
    l.c.syncLayers(l.s.state.doc.layers);
    for (const id of ids) l.c.markDirty(id);
    bump();
    opts.redraw();
  }

  function pictureTouched(ids: readonly string[]): void {
    if (!ids.includes("picture")) return;
    maskDirty.value = true;
    maskVersion.value++;
  }

  // ---- derived state, for the panels ----
  const ready = computed(() => session.value !== null);
  const layers = computed<Layer[]>(() => {
    track();
    return session.value ? [...session.value.state.doc.layers] : [];
  });
  const activeLayerId = computed(() => {
    track();
    return session.value ? session.value.state.activeLayerId : "";
  });
  const colour = computed<Rgb>(() => colourNow.value);
  const background = computed<Rgb>(() => backgroundNow.value);
  const editedColour = computed<Rgb>(() => (editing.value === "background" ? backgroundNow.value : colourNow.value));
  const recent = computed<Rgb[]>(() => {
    track();
    return session.value ? [...session.value.state.recent] : [];
  });
  const tool = computed<PaintTool | null>(() => {
    track();
    return session.value ? session.value.state.tool : null;
  });
  /** The painting tool whose brush the library and settings show: the armed one, or the Brush while the picker is. */
  const brushTool = computed<BrushTool>(() => {
    const t = tool.value;
    return t === null || t === "picker" ? "brush" : t;
  });
  const brush = computed<BrushPreset | null>(() => {
    track();
    return session.value ? session.value.state.brushes[brushTool.value] : null;
  });
  const optionValues = computed(() => {
    track();
    const s = session.value;
    return s ? effectiveValues(s.state.brushes[brushTool.value], s.state.overrides[brushTool.value]) : null;
  });
  const cursor = computed(() => {
    track();
    const s = session.value;
    return s ? cursorOf(s.state.brushes[brushTool.value], s.state.overrides[brushTool.value], s.state.tool) : null;
  });
  const canUndo = computed(() => {
    track();
    return session.value?.canUndo === true;
  });
  const canRedo = computed(() => {
    track();
    return session.value?.canRedo === true;
  });
  /** What the layers panel may offer for the active layer: the session owns the rule. */
  const canDeleteActive = computed(() => {
    track();
    return session.value?.canDelete(session.value.state.activeLayerId) === true;
  });
  const canMergeActive = computed(() => {
    track();
    return session.value?.canMergeDown(session.value.state.activeLayerId) === true;
  });
  /** Whether the mask erases anything: the recipe's mask step exists exactly when this is true. */
  const hasMask = computed(() => {
    track();
    const pic = session.value?.state.doc.layers.find((l): l is PictureLayer => l.kind === "picture");
    return pic ? maskHasPaint(pic.mask) : false;
  });
  /** Whether the session holds any paint layer: the recipe has a paint step when it does. */
  const hasPaintLayers = computed(() => {
    track();
    return session.value?.state.doc.layers.some((l) => l.kind === "paint") === true;
  });
  const reported = computed(() => pen.value?.reported ?? null);

  function thumbnail(id: string) {
    const layer = session.value?.state.doc.layers.find((l) => l.id === id);
    return layer && layer.kind === "paint" ? sampleThumbnail(layer.pixels, THUMB) : null;
  }

  /** The mask on a canvas at document size, for saving and for a picture tool's preview. Null with no session. */
  function maskCanvas(): HTMLCanvasElement | null {
    const pic = session.value?.state.doc.layers.find((l): l is PictureLayer => l.kind === "picture");
    if (!pic) return null;
    if (maskCache?.version !== maskVersion.value) maskCache = { version: maskVersion.value, canvas: maskToCanvas(pic.mask) };
    return maskCache.canvas;
  }

  // ---- stage events ----
  function onStrokeStart(): void {
    bump();
  }
  function onStrokeEnd(layerId: string): void {
    bump();
    pictureTouched([layerId]);
  }
  function onPicked(rgb: Rgb): void {
    setColour(rgb);
  }
  function onPen(reading: PenReading): void {
    pen.value = reading;
  }

  // ---- history ----
  function undo(): void {
    const r = session.value?.undo();
    if (!r) return;
    sync(r.layerIds);
    pictureTouched(r.layerIds);
  }
  function redo(): void {
    const r = session.value?.redo();
    if (!r) return;
    sync(r.layerIds);
    pictureTouched(r.layerIds);
  }

  // ---- layers ----
  const selectLayer = (id: string): void => {
    const s = session.value;
    if (!s) return;
    s.state.activeLayerId = id;
    bump();
  };
  /**
   * Whether the layer a stroke or "New layer" would make may be made. A picture's first paint layer makes a
   * canvas, which the plan counts; a picture that already has a painting (or has made its first layer this
   * session) never asks again. Kept here rather than in the pure session, which knows nothing of plans.
   */
  function mayMakeLayer(): boolean {
    const s = session.value;
    if (!s) return false;
    if (hadCanvas || s.state.doc.layers.some((l) => l.kind === "paint")) return true;
    if (opts.canMakeCanvas?.() ?? true) return true;
    opts.onCanvasRefused?.();
    return false;
  }
  /** The stage asks before it begins a stroke: false means do not paint. */
  function mayStroke(): boolean {
    const s = session.value;
    if (!s) return false;
    const target = s.state.doc.layers.find((l) => l.id === s.state.activeLayerId);
    // Only a brush or smudge stroke on the picture makes a layer; the eraser on it paints the mask.
    if (target?.kind !== "picture" || s.state.tool === "eraser" || s.state.tool === "picker") return true;
    return mayMakeLayer();
  }
  function addLayer(): void {
    if (!mayMakeLayer()) return;
    const layer = session.value?.addLayer();
    if (layer) sync([layer.id]);
  }
  function deleteLayer(id: string): void {
    const s = session.value;
    if (!s?.canDelete(id)) return;
    s.deleteLayer(id);
    sync([]);
  }
  function mergeDown(id: string): void {
    const s = session.value;
    if (!s?.canMergeDown(id)) return;
    s.mergeDown(id);
    // The layer below changed its pixels; the merged one is gone.
    const below = s.state.activeLayerId;
    sync([below]);
  }
  function moveLayer(id: string, toIndex: number): void {
    session.value?.moveLayer(id, toIndex);
    sync([id]);
  }
  function setLayerProps(id: string, props: LayerProps): void {
    const s = session.value;
    if (!s) return;
    // Opacity moves with the thumb: shown live, recorded once when it is released.
    if (props.opacity !== undefined && Object.keys(props).length === 1) {
      const layer = s.state.doc.layers.find((l) => l.id === id);
      if (!layer || layer.kind !== "paint") return;
      opacityDraft ??= { id, start: layer.opacity };
      layer.opacity = props.opacity;
      bump();
      opts.redraw();
      return;
    }
    s.setLayerProps(id, props);
    sync([id]);
    if (id === "picture") pictureTouched([id]);
  }
  function commitOpacity(id: string): void {
    const s = session.value;
    const draft = opacityDraft;
    opacityDraft = null;
    if (!s || !draft || draft.id !== id) return;
    const layer = s.state.doc.layers.find((l) => l.id === id);
    if (!layer || layer.kind !== "paint") return;
    const final = layer.opacity;
    layer.opacity = draft.start;
    s.setLayerProps(id, { opacity: final });
    bump();
    opts.redraw();
  }
  const setBlend = (id: string, blend: LayerBlend): void => setLayerProps(id, { blend });

  // ---- tool, brush, colour ----
  function setTool(t: PaintTool): void {
    const s = session.value;
    if (!s) return;
    s.state.tool = t;
    bump();
  }
  function setColour(c: Rgb): void {
    colourNow.value = { ...c };
    if (session.value) session.value.state.colour = { ...c };
    bump();
  }
  function setBackground(c: Rgb): void {
    backgroundNow.value = { ...c };
    bump();
  }
  /** The Colour panel writes to whichever swatch was opened. */
  function setEditedColour(c: Rgb): void {
    if (editing.value === "background") setBackground(c);
    else setColour(c);
  }
  function swapColours(): void {
    const front = colourNow.value;
    const back = backgroundNow.value;
    backgroundNow.value = { ...front };
    setColour(back);
  }
  function resetColours(): void {
    backgroundNow.value = { ...DEFAULT_BACKGROUND };
    setColour(DEFAULT_INK);
  }
  function setOption(field: "size" | "opacity" | "flow" | "smoothing", value: number): void {
    const s = session.value;
    if (!s) return;
    const t = brushTool.value;
    if (field === "smoothing") {
      s.state.brushes[t] = { ...s.state.brushes[t], smoothing: value };
      yours.scheduleSave(s.state.brushes[t]);
    }
    else s.state.overrides[t] = { ...s.state.overrides[t], [field]: value };
    bump();
  }
  function setMode(mode: BrushBlend): void {
    const s = session.value;
    if (!s) return;
    const t = brushTool.value;
    s.state.brushes[t] = { ...s.state.brushes[t], blend: mode };
    yours.scheduleSave(s.state.brushes[t]);
    bump();
  }
  function selectBrush(id: string): void {
    const s = session.value;
    const picked = library.value.find((b) => b.id === id);
    if (!s || !picked) return;
    const arm = () => {
      const t = brushTool.value;
      s.state.brushes[t] = picked;
      // The options bar's values belonged to the brush it was tuned for.
      s.state.overrides[t] = {};
      bump();
    };
    // A brush of Yours may still be fetching its tip; the engine reads it synchronously, so it is armed after.
    const wait = yours.ready(picked);
    if (wait === null) arm();
    else void wait.then(() => (session.value === s ? arm() : undefined), () => undefined);
  }
  function updateBrush(next: BrushPreset): void {
    const s = session.value;
    if (!s) return;
    s.state.brushes[brushTool.value] = next;
    yours.scheduleSave(next);
    bump();
  }
  function resetBrush(): void {
    const s = session.value;
    if (!s) return;
    const t = brushTool.value;
    const base = library.value.find((b) => b.id === s.state.brushes[t].id);
    if (!base) return;
    s.state.brushes[t] = base;
    s.state.overrides[t] = {};
    bump();
  }
  /** Every tool whose armed brush has this id. */
  function armedWith(id: string): BrushTool[] {
    const s = session.value;
    return s ? (Object.keys(s.state.brushes) as BrushTool[]).filter((t) => s.state.brushes[t].id === id) : [];
  }
  /** The armed brush as a new one in Yours (with its own pictures), armed. Null when it could not be kept. */
  async function saveAsNewBrush(): Promise<BrushPreset | null> {
    const s = session.value;
    if (!s) return null;
    const t = brushTool.value;
    const made = await yours.saveAsNew(s.state.brushes[t]);
    if (made && session.value === s) {
      s.state.brushes[t] = made;
      s.state.overrides[t] = {};
      bump();
    }
    return made;
  }
  async function renameBrush(id: string, name: string): Promise<void> {
    if (!(await yours.rename(id, name))) return;
    const s = session.value;
    if (!s) return;
    for (const t of armedWith(id)) s.state.brushes[t] = { ...s.state.brushes[t], name: name.trim() };
    bump();
  }
  /** An armed brush that is deleted falls back to the first stock one. */
  async function removeBrush(id: string): Promise<void> {
    if (!(await yours.remove(id))) return;
    const s = session.value;
    if (!s) return;
    for (const t of armedWith(id)) {
      s.state.brushes[t] = STOCK_BRUSHES[0];
      s.state.overrides[t] = {};
    }
    bump();
  }
  function setCurve(next: PressureCurve): void {
    curve.value = next;
    savePressureCurve(next);
    if (session.value) session.value.state.curve = next;
  }

  return {
    assets,
    session,
    compositor,
    revision,
    maskDirty,
    maskVersion,
    curve,
    library,
    userSetNames: yours.setNames,
    brushSaveStatus: yours.status,
    brushSaveError: yours.saveError,
    importing: yours.importing,
    importReport: yours.importReport,
    importFile: yours.importFile,
    dismissImport: yours.dismissImport,
    renameBrush,
    removeBrush,
    pen,
    ready,
    layers,
    activeLayerId,
    colour,
    background,
    editing,
    editedColour,
    setBackground,
    setEditedColour,
    swapColours,
    resetColours,
    recent,
    tool,
    brushTool,
    brush,
    optionValues,
    cursor,
    canUndo,
    canRedo,
    canDeleteActive,
    canMergeActive,
    hasMask,
    hasPaintLayers,
    mayStroke,
    reported,
    thumbnail,
    maskCanvas,
    start,
    stop,
    setPicture,
    onStrokeStart,
    onStrokeEnd,
    onPicked,
    onPen,
    undo,
    redo,
    selectLayer,
    addLayer,
    deleteLayer,
    mergeDown,
    moveLayer,
    setLayerProps,
    commitOpacity,
    setBlend,
    setTool,
    setColour,
    setOption,
    setMode,
    selectBrush,
    updateBrush,
    resetBrush,
    saveAsNewBrush,
    setCurve,
  };
}

export type PaintSessionHandle = ReturnType<typeof usePaintSession>;
