import { BASE_TILE_SIZE, WALL_BAND_PX } from "./packSchema";
import type { SlotMechanics, SlotIdentity } from "./authoringPlan";

/** The canonical wall band — see WALL_BAND_RATIO. Was an independent 0.18. */
const BAND = WALL_BAND_PX;

export function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Removes only pale pixels connected to the canvas boundary, preserving light details inside the asset. */
export function stripBoundaryLightPixels(data: Uint8ClampedArray, width: number, height: number): void {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const pale = (pixel: number) => {
    const offset = pixel * 4;
    const r = data[offset]!;
    const g = data[offset + 1]!;
    const b = data[offset + 2]!;
    return data[offset + 3]! > 0 && Math.min(r, g, b) >= 210 && Math.max(r, g, b) - Math.min(r, g, b) <= 24;
  };
  const enqueue = (pixel: number) => {
    if (visited[pixel] || !pale(pixel)) return;
    visited[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++]!;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < width) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y + 1 < height) enqueue(pixel + width);
  }
  for (let pixel = 0; pixel < visited.length; pixel++) {
    if (visited[pixel]) data[pixel * 4 + 3] = 0;
  }
}

function alphaBounds(data: Uint8ClampedArray, width: number, height: number) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! < 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX < minX ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function clearRoundedInterior(ctx: CanvasRenderingContext2D, side: string | undefined): void {
  const corner = side === "L_NE" ? [0, BASE_TILE_SIZE]
    : side === "L_SE" ? [0, 0]
      : side === "L_SW" ? [BASE_TILE_SIZE, 0]
        : [BASE_TILE_SIZE, BASE_TILE_SIZE];
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(corner[0]!, corner[1]!, Math.round(BASE_TILE_SIZE * 0.65), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function canvasToWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Browser could not encode WebP")),
    "image/webp",
    0.9,
  ));
}

/**
 * Whether a tile's art is cropped and redrawn *into* the wall band.
 *
 * True for a wall or a shut door, whose art lives entirely on the gridline —
 * squashing it there is what guarantees a consistent band whatever the model
 * drew. False for an open door, which is the one edge category with art
 * deliberately outside the band: an ajar leaf hangs into the adjacent
 * half-cell, and squashing flattens it back onto the wall.
 */
export function squashesOntoBand(category: SlotIdentity["category"], footprint: SlotMechanics["footprint"]): boolean {
  if (category === "doorOpenH" || category === "doorOpenV") return false;
  return footprint === "centered-horizontal-edge" || footprint === "centered-vertical-edge";
}

export async function normalizeGeneratedTile(input: {
  imageB64: string;
  contentType: string;
  mechanics: SlotMechanics;
  slot: SlotIdentity;
}): Promise<Blob> {
  const sourceBytes = decodeBase64(input.imageB64);
  const source = new Blob([sourceBytes.buffer as ArrayBuffer], { type: input.contentType });
  const bitmap = await createImageBitmap(source);
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = BASE_TILE_SIZE;
  sourceCanvas.height = BASE_TILE_SIZE;
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceCtx) throw new Error("Canvas is unavailable");
  sourceCtx.drawImage(bitmap, 0, 0, BASE_TILE_SIZE, BASE_TILE_SIZE);
  bitmap.close();

  if (input.mechanics.alpha === "transparent-outside-footprint") {
    const pixels = sourceCtx.getImageData(0, 0, BASE_TILE_SIZE, BASE_TILE_SIZE);
    stripBoundaryLightPixels(pixels.data, BASE_TILE_SIZE, BASE_TILE_SIZE);
    sourceCtx.putImageData(pixels, 0, 0);
  }

  const output = document.createElement("canvas");
  output.width = BASE_TILE_SIZE;
  output.height = BASE_TILE_SIZE;
  const ctx = output.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  // An open door is an edge tile that must NOT be squashed onto the edge.
  //
  // The branch below takes whatever the model drew, crops to its alpha bounds
  // and redraws it *into* the wall band — which is right for a wall or a shut
  // door, whose art is entirely on the gridline, and fatal for an open one. An
  // ajar leaf hangs off that line into the adjacent half-cell; squashing the
  // whole image into a 32px strip flattens the leaf back onto the wall, and
  // then the threshold clear below removes what is left. Between them the two
  // steps could only ever produce a wall with a hole in it, whatever the model
  // supplied.
  //
  // So an open door is drawn 1:1 and only its threshold is cleared. Its band
  // alignment then comes from the source art rather than from being forced,
  // which is the whole premise of generating from an approved reference tile:
  // geometry is carried in, not imposed afterwards.
  const horizontal = squashesOntoBand(input.slot.category, input.mechanics.footprint)
    && input.mechanics.footprint === "centered-horizontal-edge";
  const vertical = squashesOntoBand(input.slot.category, input.mechanics.footprint)
    && input.mechanics.footprint === "centered-vertical-edge";
  if (horizontal || vertical) {
    const pixels = sourceCtx.getImageData(0, 0, BASE_TILE_SIZE, BASE_TILE_SIZE);
    const bounds = alphaBounds(pixels.data, BASE_TILE_SIZE, BASE_TILE_SIZE) ?? { x: 0, y: 0, width: BASE_TILE_SIZE, height: BASE_TILE_SIZE };
    ctx.drawImage(
      sourceCanvas,
      bounds.x, bounds.y, bounds.width, bounds.height,
      horizontal ? 0 : Math.floor((BASE_TILE_SIZE - BAND) / 2),
      horizontal ? Math.floor((BASE_TILE_SIZE - BAND) / 2) : 0,
      horizontal ? BASE_TILE_SIZE : BAND,
      horizontal ? BAND : BASE_TILE_SIZE,
    );
  } else if (input.mechanics.footprint === "centered-overlay") {
    const inset = Math.round(BASE_TILE_SIZE * 0.1);
    ctx.drawImage(sourceCanvas, inset, inset, BASE_TILE_SIZE - inset * 2, BASE_TILE_SIZE - inset * 2);
  } else {
    ctx.drawImage(sourceCanvas, 0, 0);
  }

  // An open door's threshold is cleared across the WALL BAND ONLY, never the
  // full height of the tile.
  //
  // This used to clear the entire column (or row), which made a swung leaf
  // impossible by construction: a leaf hangs off the wall line into the
  // adjacent half-cell, which is exactly the region that clear was wiping. The
  // best the pipeline could then produce was "a wall with a hole in it", and
  // that is what every generated open door came back as — the model was not at
  // fault, the geometry had already been decided here.
  //
  // Clearing just the band opens the doorway through the wall and leaves
  // everything outside the band untouched, so an ajar leaf survives. A leaf
  // cannot swing a full 90° — the tile only reaches half a cell either side of
  // the gridline — so the art convention is ajar, around 30-40°, which reads
  // unmistakably open within that reach. A true right-angle swing would need a
  // non-square asset or a per-category draw scale, and the 128x128 invariant is
  // enforced in four places (here, completeSlot, preparePackUpload, the schema).
  // An open door's threshold is NOT punched out here any more.
  //
  // It used to be: clear a band-height column through the middle so the
  // crossing read as open. That was a crutch for having nothing to tell the
  // model where the opening went, and it is destructive the moment the model
  // draws a leaf — the leaf occupies the threshold, which is precisely the
  // region being cleared. Observed 21 Sep 2026: given a base geometry
  // reference the model returned a handsome pair of hinged leaves swung into
  // the doorway, and this clear erased both, leaving the wall-with-a-hole the
  // reference existed to eliminate. There is no width that removes wall and
  // spares a leaf, because nothing here knows where the leaf is.
  //
  // The opening now comes from the reference (#904), which carries a
  // transparent crossing that an edit preserves. A tile that comes back with
  // the crossing filled in is a retry, not something to mutilate into shape.
  if (input.mechanics.footprint === "rounded-junction") {
    clearRoundedInterior(ctx, input.slot.side);
  }
  return canvasToWebp(output);
}
