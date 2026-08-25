/**
 * Page photos are reduced before they are uploaded.
 *
 * Three separate limits make this necessary rather than nice:
 *
 *   1. **The aggregate upload cap.** Storage's `file_size_limit` is per object,
 *      so a batch of page photos is otherwise unbounded — 50 pages of untouched
 *      phone camera output is a few hundred megabytes. `MAX_UPLOAD_BYTES` caps
 *      the batch, and at 2–5 MB a photo even the free tier's own 10-page limit
 *      would not fit inside it. Downscaling is what makes the page caps
 *      reachable rather than theoretical.
 *
 *   2. **The provider request.** Every part is base64'd into one JSON body, so
 *      raw photos inflate the request by a further third.
 *
 *   3. **The bill.** `detail: "high"` tiles an image at 512px and charges per
 *      tile, so token cost scales with *dimensions*, not with file size. A
 *      4032x3024 photo costs several times what the same page costs at 1600px,
 *      for text that is equally legible either way — the measured 20260825000600
 *      run put a PDF page at ~1,080 tokens, and an untouched photo is far above
 *      that for no gain.
 *
 * The pure half is separated from the browser half deliberately: `OffscreenCanvas`,
 * `createImageBitmap` and `toBlob` do not exist in the test DOM, so the arithmetic
 * that decides the output size is testable and the encoding is not.
 */

/** Longest edge, in pixels, a page photo is reduced to. Comfortably legible for
 *  printed statblock text while keeping a 50-page batch inside the byte cap. */
export const MAX_IMAGE_EDGE = 1600;

/** JPEG quality for the re-encode. Above ~0.85 the file grows without the text
 *  getting any easier to read; below ~0.75 small type starts to smear. */
export const DOWNSCALE_QUALITY = 0.82;

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * What `width` x `height` becomes when its longest edge is capped at `maxEdge`.
 * Aspect ratio is preserved and images already inside the cap are returned
 * unchanged — never upscaled, which would cost tokens to invent detail.
 */
export function targetDimensions(width: number, height: number, maxEdge: number = MAX_IMAGE_EDGE): Dimensions {
  const longest = Math.max(width, height);
  if (longest <= 0 || longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  // At least one pixel each way: a 4000x1 strip must not round to zero height.
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * A page photo reduced for upload, or the original file untouched.
 *
 * Returns the input unchanged for anything that is not an image (a PDF carries
 * its own compression and is parsed, not rasterised, by the extractor), when
 * the browser lacks the APIs, when encoding fails, and — the case worth
 * naming — when the result would be *larger* than what came in. Re-encoding a
 * small flat-colour PNG as JPEG can do exactly that, and shipping the bigger
 * file to save a step would defeat the point.
 */
export async function downscalePagePhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const target = targetDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, target.width, target.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", DOWNSCALE_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
