/*
 * Print-sized images for the PDF export (#915, 27 Sep 2026).
 *
 * Chrome's print pipeline passes a JPEG into the PDF as it is but re-encodes
 * any other image losslessly, and every picture goes in at its full source
 * resolution. The Sugarwell booklet's WebP location art went in at 3 to 4 MB
 * a picture and about 600 ppi, and the exported file came to 55 MB: too heavy
 * to mail or upload to a storefront, for no gain in print.
 *
 * compactPrintImages() runs on the laid-out print pages, before they are
 * serialised into the HTML the PDF renderer prints (useScriptoriumPdf.ts),
 * and redraws each picture at 300 ppi of the
 * size it is printed at. An opaque picture becomes a JPEG; one with any
 * transparency (frameless creature art that sits on the page) stays lossless
 * PNG, only smaller. A picture that cannot be read back (no CORS, failed
 * load) keeps its original source, so the export never loses an image.
 */

import { hasTransparentPixels } from "@/lib/mediaConvert";

/** Print resolution the pictures are resampled to. */
export const PRINT_PPI = 300;
/** CSS pixels per inch; a laid-out size in CSS px is this many per inch. */
const CSS_PX_PER_INCH = 96;
const JPEG_QUALITY = 0.88;

export interface PixelSize {
  width: number;
  height: number;
}

/**
 * The pixel size a picture needs to print sharp at PRINT_PPI in a box of
 * `box` CSS px, never larger than its source. The larger of the two ratios
 * covers `object-fit: cover`, where the picture is cropped to fill its box.
 */
export function printPixelSize(natural: PixelSize, box: PixelSize): PixelSize {
  const needed = PRINT_PPI / CSS_PX_PER_INCH;
  const scale = Math.min(1, Math.max((box.width * needed) / natural.width, (box.height * needed) / natural.height));
  return {
    width: Math.max(1, Math.round(natural.width * scale)),
    height: Math.max(1, Math.round(natural.height * scale)),
  };
}

/**
 * Whether redrawing gains anything: a JPEG already at print size goes into the
 * PDF untouched, while anything else is re-encoded losslessly by the print
 * pipeline however small it is.
 */
export function needsCompacting(src: string, natural: PixelSize, target: PixelSize): boolean {
  const isJpeg = /\.jpe?g(?:$|[?#])/i.test(src) || src.startsWith("data:image/jpeg");
  return !isJpeg || target.width < natural.width;
}

function loadCorsImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

async function compactOne(el: HTMLImageElement): Promise<void> {
  const rect = el.getBoundingClientRect();
  if (!el.currentSrc || rect.width === 0 || rect.height === 0) return;
  const source = await loadCorsImage(el.currentSrc);
  const natural = { width: source.naturalWidth, height: source.naturalHeight };
  const target = printPixelSize(natural, { width: rect.width, height: rect.height });
  if (!needsCompacting(el.currentSrc, natural, target)) return;

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(source, 0, 0, target.width, target.height);
  // getImageData throws on a tainted canvas; the caller keeps the original.
  const opaque = !hasTransparentPixels(ctx.getImageData(0, 0, target.width, target.height).data);
  el.removeAttribute("srcset");
  el.src = opaque ? canvas.toDataURL("image/jpeg", JPEG_QUALITY) : canvas.toDataURL("image/png");
}

/** Redraw every laid-out picture under `root` at print size, in place. */
export async function compactPrintImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map((el) =>
      compactOne(el).catch(() => {
        // Unreadable (CORS, load failure): the original source prints as is.
      }),
    ),
  );
}
