/*
 * The canvas half of an AI picture action (#1176 story 10): draw the picture to send, draw the extend mask, and
 * lay the original back over the extended result. The geometry is in aiPicture.ts; this only paints it.
 */
import { encodeWebp } from "@/lib/webpEncode";
import { embedXmpInWebp, readXmpFromWebp } from "@edge-shared/provenance/embed.ts";
import { MAX_SEND_EDGE, dimensionsOf, nearestAiSize, sendDimensions, type AiSize, type ExtendLayout } from "./aiPicture";

/** Decoded, a PNG over this does not fit the server's 6 MB limit once base64 is counted in; shrink and retry. */
const MAX_PNG_BYTES = 5.5 * 1024 * 1024;
const RESULT_QUALITY = 0.92;

type Source = HTMLImageElement | ImageBitmap;

function sizeOf(source: Source): { width: number; height: number } {
  return source instanceof HTMLImageElement ? { width: source.naturalWidth, height: source.naturalHeight } : source;
}

function canvasOf(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");
  return { canvas, ctx };
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The picture could not be prepared."))), "image/png");
  });
}

export interface PreparedPicture {
  image: Blob;
  /** Extend only: the picture's own region opaque, the margin transparent. */
  mask?: Blob;
  size: AiSize;
}

/** The picture as a PNG to send, its long edge capped, shrunk further when the bytes are too many. */
export async function preparePicture(source: Source): Promise<PreparedPicture> {
  const natural = sizeOf(source);
  for (const edge of [MAX_SEND_EDGE, 1280, 1024, 768]) {
    const { width, height } = sendDimensions(natural, edge);
    const { canvas, ctx } = canvasOf(width, height);
    ctx.drawImage(source, 0, 0, width, height);
    const image = await toPng(canvas);
    if (image.size <= MAX_PNG_BYTES) return { image, size: nearestAiSize(width, height) };
  }
  throw new Error("This picture is too large to send.");
}

/** The picture on a transparent field of the extend shape, and the mask that tells the model where to paint. */
export async function prepareExtend(source: Source, layout: ExtendLayout): Promise<PreparedPicture> {
  const { width, height } = layout.canvas;
  const { x, y, width: pw, height: ph } = layout.picture;

  const field = canvasOf(width, height);
  field.ctx.drawImage(source, x, y, pw, ph);

  // OpenAI repaints where the mask is transparent: opaque over the picture, clear over the margin.
  const mask = canvasOf(width, height);
  mask.ctx.fillStyle = "#000";
  mask.ctx.fillRect(x, y, pw, ph);

  return { image: await toPng(field.canvas), mask: await toPng(mask.canvas), size: layout.size };
}

/**
 * The result of an extend with the original laid back over its own region, so only the new margin is invented
 * and the part the author already had is exactly theirs. Re-encoding drops the server's AI mark, so it is read
 * from the result and put back.
 */
export async function restoreOriginal(result: Blob, source: Source, layout: ExtendLayout): Promise<Blob> {
  const bytes = new Uint8Array(await result.arrayBuffer());
  const mark = readXmpFromWebp(bytes);
  const { width, height } = dimensionsOf(layout.size);
  const { canvas, ctx } = canvasOf(width, height);
  const bitmap = await createImageBitmap(result);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const { x, y, width: pw, height: ph } = layout.picture;
  ctx.drawImage(source, x, y, pw, ph);
  const out = await encodeWebp(canvas, RESULT_QUALITY);
  if (!mark) return out;
  return new Blob([new Uint8Array(embedXmpInWebp(new Uint8Array(await out.arrayBuffer()), mark))], { type: "image/webp" });
}
