import { computed, ref, watch, type Ref } from "vue";
import { BASE_TILE_SIZE } from "@/cartographer/packSchema";
import type { MapRenderReferenceImage } from "@/cartographer/renderMap";
import { fitViewport } from "@/cartographer/viewport";
import { DEFAULT_SQUARES_ACROSS, calibrationFor, gridSizeText, squaresDown } from "@/lib/mapImport/pictureGrid";
import type { GridCalibration } from "@/types/location.types";

/** Zoom and pan the canvas so a box of cells fills it, `margin` cells to spare. A no-op until the canvas has a width. */
export type FitCanvasTo = (bounds: { minX: number; minY: number; maxX: number; maxY: number }, margin: number) => void;

export function useCanvasFraming(canvasEl: Ref<HTMLCanvasElement | null>, zoom: Ref<number>, viewportOffset: Ref<{ x: number; y: number }>): FitCanvasTo {
  return (bounds, margin) => {
    const canvas = canvasEl.value;
    if (!canvas || canvas.clientWidth === 0) return;
    const next = fitViewport(bounds, { width: canvas.clientWidth, height: canvas.clientHeight }, window.devicePixelRatio || 1, BASE_TILE_SIZE, margin);
    zoom.value = next.zoom;
    viewportOffset.value = next.offset;
  };
}

export interface WorkbenchPicture {
  url: string;
  calibration: GridCalibration | null;
}

/**
 * The site's Picture as the canvas's reference image (#884 S6): loaded once per URL, and drawn at the scale and
 * offset of the grid it was lined up to. Nothing is drawn for a picture without a grid.
 */
export function useReferencePicture(picture: Ref<WorkbenchPicture | null | undefined>, activeLayer: Ref<"drawing" | "plan" | "picture">) {
  const showPictureReference = ref(true);
  const referenceImageEl = ref<HTMLImageElement | null>(null);
  watch(
    () => picture.value?.url ?? null,
    (url) => {
      referenceImageEl.value = null;
      if (!url) return;
      const img = new Image();
      img.onload = () => { referenceImageEl.value = img; };
      img.src = url;
    },
    { immediate: true },
  );

  /** Where the Picture draws on THIS frame's canvas, in device pixels: cell (origin_cell_x, origin_cell_y)'s corner
   *  lines up with this frame's own cell of the same coordinates, the cell space a Drawing publish shares with its
   *  Picture (see `lib/locations/mapStack.ts`). */
  function buildReferenceImage(tilePx: number, viewportOffset: { x: number; y: number }): MapRenderReferenceImage | null {
    // The Picture layer is about the picture, so the "show picture underneath" switch does not apply there.
    if (!showPictureReference.value && activeLayer.value !== "picture") return null;
    const img = referenceImageEl.value;
    const cal = picture.value?.calibration;
    if (!img || !cal) return null;
    if (cal.cells_per_image_width <= 0 || img.naturalWidth <= 0) return null;
    const cellPx = img.naturalWidth / cal.cells_per_image_width;
    if (cellPx <= 0) return null;
    const scale = tilePx / cellPx;
    const cellOriginX = (cal.origin_cell_x ?? 0) * tilePx - viewportOffset.x;
    const cellOriginY = (cal.origin_cell_y ?? 0) * tilePx - viewportOffset.y;
    return {
      source: img,
      x: cellOriginX - cal.origin_x_pct * img.naturalWidth * scale,
      y: cellOriginY - cal.origin_y_pct * img.naturalHeight * scale,
      width: img.naturalWidth * scale,
      height: img.naturalHeight * scale,
      opacity: activeLayer.value === "picture" ? 1 : 0.45,
    };
  }

  return { showPictureReference, referenceImageEl, buildReferenceImage };
}

/**
 * The Picture layer of the workbench (#1125, canvas frame 07): lining the grid up on the picture, the fitted view of
 * a picture that has no grid yet, and fitting the canvas to a picture that has one. The draft grid is local until
 * "Done": only `onLined` writes it out.
 */
export function useWorkbenchPicture(opts: {
  picture: Ref<WorkbenchPicture | null | undefined>;
  imageEl: Ref<HTMLImageElement | null>;
  activeLayer: Ref<"drawing" | "plan" | "picture">;
  fitCanvasTo: FitCanvasTo;
    onLined: (calibration: GridCalibration) => void;
}) {
  const { picture, imageEl, activeLayer, fitCanvasTo, onLined } = opts;

  const liningUp = ref(false);
  const draftCalibration = ref<GridCalibration | null>(null);
  const boxMode = ref(false);

  const pictureNatural = computed(() => {
    const img = imageEl.value;
    return img && img.naturalWidth > 0 ? { width: img.naturalWidth, height: img.naturalHeight } : null;
  });
  /** The fitted picture is on screen instead of the canvas: before it has a grid, and while lining one up. */
  const pictureStage = computed(() => activeLayer.value === "picture" && (liningUp.value || !picture.value?.calibration));
  const lineUpHint = computed(() => {
    const cal = draftCalibration.value;
    const natural = pictureNatural.value;
    if (!cal || !natural) return "";
    return `${gridSizeText(cal, natural)}. Drag the grid to line it up; arrow keys nudge it a pixel.`;
  });

  function startLineUp(): void {
    const natural = pictureNatural.value;
    const current = picture.value;
    if (!natural || !current) return;
    draftCalibration.value = current.calibration ? { ...current.calibration } : calibrationFor(natural, DEFAULT_SQUARES_ACROSS);
    boxMode.value = false;
    liningUp.value = true;
  }
  function cancelLineUp(): void {
    liningUp.value = false;
    draftCalibration.value = null;
    boxMode.value = false;
  }
  function finishLineUp(): void {
    const draft = draftCalibration.value;
    if (draft) onLined(draft);
    cancelLineUp();
  }
  watch(activeLayer, (layer) => {
    if (layer !== "picture") cancelLineUp();
  });
  // A new picture is a new frame for any grid being lined up.
  watch(() => picture.value?.url, () => cancelLineUp());

  // The Picture layer opens on the whole picture, wherever the Drawing had the view: a picture lined up to a grid
  // sits at cell (origin_cell) and 30-odd squares across, which the Drawing's own view may not be near.
  function fitPictureView(): void {
    const cal = picture.value?.calibration;
    const natural = pictureNatural.value;
    if (!cal || !natural) return;
    const across = cal.cells_per_image_width;
    const down = squaresDown(cal, natural);
    const left = (cal.origin_cell_x ?? 0) - cal.origin_x_pct * across;
    const top = (cal.origin_cell_y ?? 0) - cal.origin_y_pct * across;
    fitCanvasTo({ minX: Math.floor(left), minY: Math.floor(top), maxX: Math.ceil(left + across) - 1, maxY: Math.ceil(top + down) - 1 }, 0);
  }
  watch(
    [activeLayer, () => picture.value?.calibration, pictureNatural],
    () => { if (activeLayer.value === "picture") fitPictureView(); },
    { flush: "post" },
  );

  return { liningUp, draftCalibration, boxMode, pictureNatural, pictureStage, lineUpHint, startLineUp, cancelLineUp, finishLineUp };
}
