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

import type { PageFurnitureItem } from "@/scriptorium/types";
import { hasTransparentPixels } from "@/lib/mediaConvert";
import { applySteps } from "@/scriptorium/illuminator/lib/applySteps";
import { cropOf, croppedSize, drawBase } from "@/scriptorium/illuminator/lib/crop";
import { loadDomImage } from "@/scriptorium/illuminator/lib/loadImage";
import { baseImageUrl, hasSteps, parseSettings, type IlluminateSettings } from "@/scriptorium/illuminator/lib/treatment";

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

/**
 * A treated picture prints from its recipe, not its bake (#1176 story 9): the
 * `<img>` carries `data-original` and `data-illuminate`, and the steps are
 * applied to the original here, so print never shows a stale or missing bake.
 * `base` is the picture they are drawn over: the AI result when the recipe has one, else the original.
 * Null when the picture carries no recipe, or an empty one.
 */
export function printRecipe(el: HTMLImageElement) {
  const original = el.getAttribute("data-original");
  const settings = parseSettings(el.getAttribute("data-illuminate"));
  return original && hasSteps(settings) ? { base: baseImageUrl(original, settings), settings } : null;
}

/** Width over height a recipe's picture comes out at, or null when the recipe does not crop. */
async function croppedAspect(original: string, settings: IlluminateSettings): Promise<number | null> {
  if (!cropOf(settings)) return null;
  const base = await loadDomImage(baseImageUrl(original, settings));
  const { width, height } = croppedSize({ width: base.naturalWidth, height: base.naturalHeight }, settings);
  return width / height;
}

/**
 * Cropped pictures take the crop's shape BEFORE the book is laid out (#1176 story 9c). The stored `src` is a bake
 * that may be stale or missing (an edit made seconds before the export), so the box Paged.js measures would
 * otherwise have the old shape, and compactPrintImages, which redraws after layout, would put the cropped render
 * into it. Giving the picture the crop's aspect first means the layout paginates the real size and the redraw
 * fills its box exactly: it can never print stretched or squashed. Text that has no cropped picture is
 * returned untouched, never re-serialised.
 */
export async function fitCroppedPictures(html: string): Promise<string> {
  if (!html.includes("data-illuminate") || !html.includes("crop")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  let changed = false;
  await Promise.all(
    Array.from(doc.body.querySelectorAll("img[data-original][data-illuminate]")).map(async (img) => {
      const original = img.getAttribute("data-original");
      const settings = parseSettings(img.getAttribute("data-illuminate"));
      if (!original || !settings) return;
      const aspect = await croppedAspect(original, settings).catch(() => null);
      if (aspect === null) return;
      const style = (img.getAttribute("style") ?? "").replace(/;?\s*$/, "");
      img.setAttribute("style", `${style}${style ? ";" : ""}aspect-ratio:${aspect};height:auto`);
      changed = true;
    }),
  );
  return changed ? doc.body.innerHTML : html;
}

/** The same for art placed on pages: the item carries the crop's aspect, which the furniture render draws. */
export async function fitCroppedArt(items: readonly PageFurnitureItem[]): Promise<PageFurnitureItem[]> {
  return Promise.all(
    items.map(async (item) => {
      if (item.kind !== "art") return item;
      const original = item.props.original;
      const settings = parseSettings(item.props.illuminate);
      if (typeof original !== "string" || !settings) return item;
      const aspect = await croppedAspect(original, settings).catch(() => null);
      return aspect === null ? item : { ...item, props: { ...item.props, aspect } };
    }),
  );
}

async function compactOne(el: HTMLImageElement): Promise<void> {
  const rect = el.getBoundingClientRect();
  const recipe = printRecipe(el);
  const from = recipe?.base ?? el.currentSrc;
  if (!from || rect.width === 0 || rect.height === 0) return;
  const source = await loadDomImage(from);
  const full = { width: source.naturalWidth, height: source.naturalHeight };
  // A cropped picture prints at the cropped size, from the same cut the bake and the page make.
  const natural = recipe ? croppedSize(full, recipe.settings) : full;
  const target = printPixelSize(natural, { width: rect.width, height: rect.height });
  if (!recipe && !needsCompacting(el.currentSrc, natural, target)) return;

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (recipe) drawBase(ctx, source, full, recipe.settings, target.width, target.height);
  else ctx.drawImage(source, 0, 0, target.width, target.height);
  if (recipe) await applySteps(ctx, target.width, target.height, recipe.settings, loadDomImage, { sourceWidth: natural.width });
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
