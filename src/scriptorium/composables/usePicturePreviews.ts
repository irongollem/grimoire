/*
 * Shows an edit on the page before its bake lands (#1176 story 9b).
 *
 * A panel edit changes a picture's recipe; its `src` is the old bake (or the
 * untouched file) until the Worker has baked and uploaded the new one, which
 * takes seconds. For every picture whose bake is stale this renders a small
 * version of the recipe (renderPreview.ts) and sets it on the picture's <img>
 * on the page. Only the DOM changes, never the document: the preview is a
 * blob URL that must not be saved, and when the bake lands the picture is
 * redrawn from its real `src` (its `data-baked-for` then matches its recipe, so
 * nothing here touches it again).
 *
 * Pictures are found by the data attributes both homes of a picture draw
 * (an image node, and art furniture): `data-original`, `data-illuminate`,
 * `data-baked-for`.
 */
import { getCurrentScope, onScopeDispose } from "vue";
import type { Editor } from "@tiptap/core";
import { renderPreviewBlob } from "@/scriptorium/illuminator/lib/renderPreview";
import { hashSettings, hasSteps, parseSettings, type IlluminateSettings } from "@/scriptorium/illuminator/lib/treatment";
import { staleFurnitureArt, staleImageNodes, type StalePicture } from "@/scriptorium/composables/usePictureBakes";
import type { PageFurnitureItem } from "@/scriptorium/types";

export type PreviewRender = (original: string, settings: IlluminateSettings) => Promise<Blob>;

export interface PicturePreviewOptions {
  editor: () => Editor | null | undefined;
  furniture: () => PageFurnitureItem[];
  /** The element the pictures are drawn in: the sheet. */
  sheet: () => ParentNode | null;
  /** Injected for tests. */
  render?: PreviewRender;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
}

const DEBOUNCE_MS = 120;
/** Previews kept: one per recipe in flight, a few for an author moving a slider back and forth. */
const MAX_KEPT = 16;

export function usePicturePreviews(options: PicturePreviewOptions) {
  const render = options.render ?? renderPreviewBlob;
  const createUrl = options.createUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeUrl = options.revokeUrl ?? ((url: string) => URL.revokeObjectURL(url));
  const urls = new Map<string, string>();
  const inFlight = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  /** Show every ready preview on the pictures that are still waiting for their bake. */
  function apply(): void {
    const root = options.sheet();
    if (!root) return;
    for (const img of root.querySelectorAll<HTMLImageElement>("img[data-original][data-illuminate]")) {
      const settings = parseSettings(img.getAttribute("data-illuminate"));
      if (!hasSteps(settings)) continue;
      const hash = hashSettings(settings);
      if (img.getAttribute("data-baked-for") === hash) continue;
      const url = urls.get(hash);
      if (url && img.getAttribute("src") !== url) img.setAttribute("src", url);
    }
  }

  async function draw(p: StalePicture): Promise<void> {
    if (urls.has(p.hash) || inFlight.has(p.hash)) return;
    inFlight.add(p.hash);
    try {
      const url = createUrl(await render(p.original, p.settings));
      if (disposed) {
        revokeUrl(url);
        return;
      }
      urls.set(p.hash, url);
      for (const [hash, old] of urls) {
        if (urls.size <= MAX_KEPT) break;
        urls.delete(hash);
        revokeUrl(old);
      }
      apply();
    } catch {
      // A picture that cannot be drawn keeps its old look until its bake lands; the bake reports its own failure.
    } finally {
      inFlight.delete(p.hash);
    }
  }

  /** Render what is stale, now. */
  async function refresh(): Promise<void> {
    const ed = options.editor();
    const stale = [...(ed && !ed.isDestroyed ? staleImageNodes(ed.state.doc) : []), ...staleFurnitureArt(options.furniture())];
    await Promise.all(stale.map(draw));
    apply();
  }

  /** Something may have changed: look again shortly. */
  function schedule(): void {
    if (disposed) return;
    clearTimeout(timer);
    timer = setTimeout(() => void refresh(), DEBOUNCE_MS);
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true;
      clearTimeout(timer);
      for (const url of urls.values()) revokeUrl(url);
      urls.clear();
    });
  }

  return { schedule, refresh, apply };
}
