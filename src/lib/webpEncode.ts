/**
 * The one WebP encoder every canvas-to-WebP call in the app goes through.
 *
 * `canvas.toBlob(cb, "image/webp", q)` and
 * `OffscreenCanvas.convertToBlob({ type: "image/webp" })` treat the type as a
 * request, not a promise: a browser that cannot encode WebP hands back a PNG
 * blob without complaint instead of failing. Safari on iOS and macOS is the
 * one that matters here, and it means a caller that trusts the browser ships
 * a PNG mislabelled as WebP — a tile pack the server refuses, a baked map
 * uploaded as `image/webp` that is actually a PNG, an AI Act provenance mark
 * that silently disappears because the embedder only understands WebP bytes.
 *
 * The native path is tried first because it is free: Chrome, Firefox and Edge
 * already encode real WebP without downloading anything. Only when the
 * native result is not actually WebP (wrong type, or nothing at all) does
 * this fall back to `@jsquash/webp`, libwebp compiled to WebAssembly. That
 * fallback is loaded through a lazy `import()` so the ~270-340 KB of WASM
 * never touches the app's boot bundle — only a device that actually needs it
 * ever downloads it.
 */
export async function encodeWebp(canvas: HTMLCanvasElement | OffscreenCanvas, quality: number): Promise<Blob> {
  const native = await encodeNative(canvas, quality);
  if (native && native.type === "image/webp") return native;

  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("Canvas is unavailable.");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  try {
    // Lazy on purpose — see the module docstring. `quality` here is 0-1 to
    // match `toBlob`/`convertToBlob`; jsquash's own scale is 0-100.
    const { default: encode } = await import("@jsquash/webp/encode");
    const buffer = await encode(imageData, { quality: Math.round(quality * 100) });
    return new Blob([buffer], { type: "image/webp" });
  } catch (err) {
    throw new Error(
      "This browser can't encode WebP images, and the built-in fallback encoder failed " +
      `(${err instanceof Error ? err.message : "unknown error"}). Try Chrome, Edge or Firefox instead.`,
    );
  }
}

/** Whether the canvas has a native WebP encoder available, and what it produced (or null). */
function encodeNative(canvas: HTMLCanvasElement | OffscreenCanvas, quality: number): Promise<Blob | null> {
  // Duck-typed rather than `instanceof OffscreenCanvas`: OffscreenCanvas
  // doesn't exist in every environment this runs in (older Safari, tests),
  // and the two canvas kinds are otherwise indistinguishable by anything but
  // which encode method they carry.
  if (typeof (canvas as OffscreenCanvas).convertToBlob === "function") {
    return (canvas as OffscreenCanvas).convertToBlob({ type: "image/webp", quality });
  }
  return new Promise((resolve) => {
    (canvas as HTMLCanvasElement).toBlob((blob) => resolve(blob), "image/webp", quality);
  });
}
