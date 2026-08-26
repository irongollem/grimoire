import { BASE_TILE_SIZE } from "./packSchema";
import type { SlotMechanics, SlotIdentity } from "./authoringPlan";

const BAND = Math.round(BASE_TILE_SIZE * 0.18);

function decodeBase64(value: string): Uint8Array {
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

function clearRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#fff";
  ctx.fillRect(x, y, width, height);
  ctx.restore();
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
  const horizontal = input.mechanics.footprint === "centered-horizontal-edge";
  const vertical = input.mechanics.footprint === "centered-vertical-edge";
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

  if (input.slot.category === "doorOpenH") {
    const gap = Math.round(BASE_TILE_SIZE * 0.28);
    clearRect(ctx, Math.round((BASE_TILE_SIZE - gap) / 2), 0, gap, BASE_TILE_SIZE);
  } else if (input.slot.category === "doorOpenV") {
    const gap = Math.round(BASE_TILE_SIZE * 0.28);
    clearRect(ctx, 0, Math.round((BASE_TILE_SIZE - gap) / 2), BASE_TILE_SIZE, gap);
  } else if (input.mechanics.footprint === "rounded-junction") {
    clearRoundedInterior(ctx, input.slot.side);
  }
  return canvasToWebp(output);
}
