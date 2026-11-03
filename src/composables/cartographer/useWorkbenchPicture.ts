import { computed, onMounted, ref, watch, type Ref } from "vue";
import { BASE_TILE_SIZE, FEET_PER_CELL } from "@/cartographer/packSchema";
import type { MapRenderReferenceImage } from "@/cartographer/renderMap";
import type { EditorLayer } from "@/cartographer/keymap";
import { fitViewport, type CellBounds } from "@/cartographer/viewport";
import { DEFAULT_SQUARES_ACROSS, calibrationFor, gridSizeText, squaresDown, type ImageSize } from "@/lib/mapImport/pictureGrid";
import type { GridCalibration } from "@/types/location.types";

/** Zoom and pan the canvas so a box of cells fills it, `margin` cells to spare. A no-op until the canvas has a width. */
export type FitCanvasTo = (bounds: CellBounds, margin: number) => boolean;

export function useCanvasFraming(canvasEl: Ref<HTMLCanvasElement | null>, zoom: Ref<number>, viewportOffset: Ref<{ x: number; y: number }>): FitCanvasTo {
  return (bounds, margin) => {
    const canvas = canvasEl.value;
    if (!canvas || canvas.clientWidth === 0) return false;
    const next = fitViewport(bounds, { width: canvas.clientWidth, height: canvas.clientHeight }, window.devicePixelRatio || 1, BASE_TILE_SIZE, margin);
    zoom.value = next.zoom;
    viewportOffset.value = next.offset;
    return true;
  };
}

/**
 * The grid a base image is drawn on while nobody has lined one up yet: the default number of squares across, from the
 * picture's top-left corner. It lets Drawing and Zoning show the picture instead of a black void (Map Table frame 18).
 */
export function guessedCalibration(natural: ImageSize): GridCalibration {
  return calibrationFor(natural, DEFAULT_SQUARES_ACROSS);
}

/** What one square is on the base image, for the Grid options: "5 ft · 64 px on the picture". */
export function squareReadout(cal: GridCalibration, natural: ImageSize): string {
  return `${FEET_PER_CELL} ft · ${Math.round(natural.width / cal.cells_per_image_width)} px on the picture`;
}

/** The cells a picture covers on a grid, as whole-cell bounds. */
export function pictureCellBounds(cal: GridCalibration, natural: ImageSize): CellBounds {
  const across = cal.cells_per_image_width;
  const down = squaresDown(cal, natural);
  const left = (cal.origin_cell_x ?? 0) - cal.origin_x_pct * across;
  const top = (cal.origin_cell_y ?? 0) - cal.origin_y_pct * across;
  return { minX: Math.floor(left), minY: Math.floor(top), maxX: Math.ceil(left + across) - 1, maxY: Math.ceil(top + down) - 1 };
}

/** Both boxes in one; either may be absent, and both absent means there is nothing to fit. */
export function unionBounds(a: CellBounds | null, b: CellBounds | null): CellBounds | null {
  if (!a || !b) return a ?? b;
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}

export interface WorkbenchPicture {
  url: string;
  calibration: GridCalibration | null;
}

/**
 * The site's Picture as the canvas's reference image (#884 S6): loaded once per URL, and drawn at the scale and
 * offset of the grid it was lined up to. A picture without a grid still shows under Drawing and Zoning, on a guessed grid
 * (`gridNotLinedUp` says so, for the chip); on the Base image tab the fitted stage shows it instead.
 */
export function useReferencePicture(picture: Ref<WorkbenchPicture | null | undefined>, activeLayer: Ref<EditorLayer>) {
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

  /** The grid the picture is drawn on: its own, else a guess on the tabs that sit over it. */
  function drawingCalibration(img: HTMLImageElement): GridCalibration | null {
    const own = picture.value?.calibration;
    if (own) return own;
    if (activeLayer.value === "picture" || !picture.value || img.naturalWidth <= 0) return null;
    return guessedCalibration({ width: img.naturalWidth, height: img.naturalHeight });
  }
  /** The picture is on screen but its grid was never lined up: the canvas shows the "Grid not lined up" chip. */
  const gridNotLinedUp = computed(
    () => activeLayer.value !== "picture" && !!picture.value && !picture.value.calibration && referenceImageEl.value !== null,
  );

  /** Where the Picture draws on THIS frame's canvas, in device pixels: cell (origin_cell_x, origin_cell_y)'s corner
   *  lines up with this frame's own cell of the same coordinates, the cell space a Drawing publish shares with its
   *  Picture (see `lib/locations/mapStack.ts`). */
  function buildReferenceImage(tilePx: number, viewportOffset: { x: number; y: number }): MapRenderReferenceImage | null {
    const img = referenceImageEl.value;
    if (!img) return null;
    const cal = drawingCalibration(img);
    if (!cal) return null;
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

  return { referenceImageEl, buildReferenceImage, gridNotLinedUp };
}

/**
 * The Picture layer of the workbench (#1125, canvas frame 07): lining the grid up on the picture, the fitted view of
 * a picture that has no grid yet, and fitting the canvas to a picture that has one. The draft grid is local until
 * "Done": only `onLined` writes it out.
 */
export function useWorkbenchPicture(opts: {
  picture: Ref<WorkbenchPicture | null | undefined>;
  imageEl: Ref<HTMLImageElement | null>;
  activeLayer: Ref<EditorLayer>;
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
    fitCanvasTo(pictureCellBounds(cal, natural), 0);
  }
  watch(
    [activeLayer, () => picture.value?.calibration, pictureNatural],
    () => { if (activeLayer.value === "picture") fitPictureView(); },
    { flush: "post" },
  );

  return { liningUp, draftCalibration, boxMode, pictureNatural, pictureStage, lineUpHint, startLineUp, cancelLineUp, finishLineUp };
}

/**
 * Drawing and Zoning open fitted to the whole map the first time each is entered in a session (Map Table frame 18):
 * the Plan used to open at 100% on the top-left corner of a large base image, where a DM saw none of the rooms. The
 * Base image tab has its own fit. A tab is only marked entered once a fit really happened, so one opened before the
 * picture has loaded (or before the canvas has a width) fits when it can, not never.
 */
export function useFitMapOnFirstEntry(opts: {
  activeLayer: Ref<EditorLayer>;
  picture: Ref<WorkbenchPicture | null | undefined>;
  pictureNatural: Ref<ImageSize | null>;
  paintedBounds: () => CellBounds | null;
  /** Changes when the host hands over a different (or a just-loaded) map, which is when painted cells can appear. */
  mapId: () => string | undefined;
  fitCanvasTo: FitCanvasTo;
}): void {
  const { activeLayer, picture, pictureNatural, paintedBounds, mapId, fitCanvasTo } = opts;
  const entered = new Set<EditorLayer>(["picture"]);

  function tryFit(): void {
    const layer = activeLayer.value;
    if (entered.has(layer)) return;
    const natural = pictureNatural.value;
    // A picture that has not loaded yet is part of the map: wait for it rather than fit the drawing alone.
    if (picture.value && !natural) return;
    const cal = picture.value ? (picture.value.calibration ?? (natural ? guessedCalibration(natural) : null)) : null;
    const pictureBounds = cal && natural ? pictureCellBounds(cal, natural) : null;
    const bounds = unionBounds(pictureBounds, paintedBounds());
    if (!bounds) return;
    if (fitCanvasTo(bounds, 1)) entered.add(layer);
  }

  onMounted(tryFit);
  watch([activeLayer, pictureNatural, () => picture.value?.calibration, mapId], tryFit, { flush: "post" });
}
