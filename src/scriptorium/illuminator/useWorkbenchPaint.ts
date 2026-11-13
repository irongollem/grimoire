/*
 * The painting's stored side in the workbench (#1181): the recipe's `paint` step as the workbench holds it, saving
 * the session's layers into it as chunks, reading chunks back, saved versions and Flatten. Split out of
 * `useIlluminateWorkbench` so that file keeps the tools and the render; everything here that needs the workbench
 * (its session, picture loader, confirm, busy flag) is handed in.
 */
import { ref, type Ref } from "vue";
import { toWebP } from "@/lib/mediaConvert";
import { uploadToBucket } from "@/lib/storage";
import { encodeWebp } from "@/lib/webpEncode";
import { markForSweep } from "@/scriptorium/composables/illuminatorSweep";
import type { LoadImage } from "@/scriptorium/illuminator/lib/loadImage";
import type { PaintLayerRecord, PaintStep } from "@/scriptorium/illuminator/lib/treatment";
import { decodePixels, pixelsCanvas } from "@/scriptorium/illuminator/paint/paintLayerIO";
import { loadPaintLayers, savePaintStep } from "@/scriptorium/illuminator/paint/paintSave";
import type { PaintLayer } from "@/scriptorium/illuminator/paint/session/types";
import type { usePaintSession } from "@/scriptorium/illuminator/paint/usePaintSession";
import { usePaintVersions } from "@/scriptorium/illuminator/paint/usePaintVersions";

/** A painted chunk is stored like the mask: WebP keeps its alpha. */
const CHUNK_QUALITY = 0.9;
const CHUNK_UPLOADS = 4;

interface Deps {
  paint: ReturnType<typeof usePaintSession>;
  /** The sheet the painting lies on. */
  paperId: Ref<string | null>;
  userId: () => string | undefined;
  isPro: () => boolean;
  loadImage: LoadImage;
  confirm: (message: string, options?: { title?: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
  fail: (message: string) => void;
  busy: () => boolean;
  setBusy: (value: boolean) => void;
  hasPicture: () => boolean;
  /** The picture as it looks now, painting included. */
  renderPng: () => Promise<Blob>;
  exportName: () => string;
}

export function useWorkbenchPaint(deps: Deps) {
  const { paint } = deps;
  /** The painting as the recipe holds it: stored chunks, until Done saves what the session changed. */
  const paintStep = ref<PaintStep | null>(null);
  /**
   * After Go back, the version's own layer records: the layers equal them, so a save reuses their chunk URLs and
   * uploads only what changed since. Null means the saved step is the baseline. Reset whenever a session starts.
   */
  const paintBaseline = ref<PaintLayerRecord[] | null>(null);

  const paintLayers = (): PaintLayer[] => paint.layers.value.filter((l): l is PaintLayer => l.kind === "paint");

  /**
   * Stores the chunks of every layer the author changed (and none that they did not), and makes the result the
   * recipe's painting. A failed upload throws and leaves the recipe's painting as it was.
   */
  async function savePaint(): Promise<void> {
    const s = paint.session.value;
    if (!s) return;
    const layers = paintLayers();
    if (layers.length === 0 && paintStep.value === null && deps.paperId.value === null) return;
    paintStep.value = await savePaintStep(
      { layers, dirty: s.dirty, previous: paintStep.value, baseline: paintBaseline.value ?? undefined, width: s.state.doc.width, height: s.state.doc.height, paper: deps.paperId.value, versions: paintStep.value?.versions },
      {
        concurrency: CHUNK_UPLOADS,
        release: markForSweep,
        async upload(pixels) {
          const user = deps.userId();
          if (!user) throw new Error("Sign in again to save the painting.");
          const blob = await encodeWebp(pixelsCanvas(pixels), CHUNK_QUALITY);
          const url = await uploadToBucket({ bucket: "assetImages", blob, path: `${user}/ill-paint-${crypto.randomUUID().slice(0, 8)}.webp`, contentType: "image/webp" });
          if (!url) throw new Error("Could not store the painting.");
          // Marked at once: the sweep keeps it only if the saved recipe refers to it.
          markForSweep(url);
          return url;
        },
      },
    );
    s.markClean();
    paintBaseline.value = null;
  }

  /** A stored chunk read back into pixels, the way opening a painting does. */
  const decodeChunk = async (url: string, w: number, h: number) => decodePixels((await deps.loadImage(url)) as CanvasImageSource, w, h);

  // ── Saved versions ────────────────────────────────────────────────────────
  const versions = usePaintVersions({
    step: paintStep,
    ready: () => paint.ready.value,
    hasPainting: () => paint.hasPaintLayers.value,
    isPro: deps.isPro,
    hasChanges: () => paint.edited.value,
    save: savePaint,
    async restore(records) {
      const s = paint.session.value;
      if (!s) return;
      const layers = await loadPaintLayers({ type: "paint", width: s.state.doc.width, height: s.state.doc.height, paper: deps.paperId.value, layers: records }, decodeChunk);
      paint.replaceLayers(layers);
      // The layers are the version's now: nothing is left to upload until the painter changes something.
      s.rebase();
      paintBaseline.value = records;
    },
    confirm: deps.confirm,
    release: (urls) => markForSweep(...urls),
    fail: deps.fail,
  });

  /**
   * The picture as it looks now (every step, the painting included) becomes the picture's original, and the
   * recipe goes empty: the painting is part of the picture and no longer holds a canvas on the plan. Asks
   * first, uploads the flat picture, and returns its URL for the page to take as the original; null when the
   * author declines or it fails (said in a toast).
   */
  async function flatten(): Promise<string | null> {
    if (deps.busy() || !deps.hasPicture()) return null;
    const ok = await deps.confirm("The picture, painting included, becomes one flat picture. This frees a painting slot.", {
      title: "Flatten into the picture?",
      confirmLabel: "Flatten",
    });
    if (!ok) return null;
    deps.setBusy(true);
    try {
      const user = deps.userId();
      if (!user) throw new Error("Not signed in.");
      const png = await deps.renderPng();
      const webp = await toWebP(new File([png], `${deps.exportName()}.png`, { type: "image/png" }));
      const ext = webp.type === "image/jpeg" ? "jpeg" : "webp";
      const url = await uploadToBucket({ bucket: "assetImages", blob: webp, path: `${user}/ill-flat-${crypto.randomUUID().slice(0, 8)}.${ext}`, contentType: webp.type });
      if (!url) throw new Error("Upload failed");
      markForSweep(url);
      return url;
    } catch {
      deps.fail("The painting could not be flattened. Try again.");
      return null;
    } finally {
      deps.setBusy(false);
    }
  }

  /** A paint session is starting from the saved step: any Go back baseline belonged to the last one. */
  function startedSession(): void {
    paintBaseline.value = null;
  }

  /** The painting is gone (the picture changed shape, or everything was reset). */
  function forgetPainting(): void {
    paintStep.value = null;
    paintBaseline.value = null;
  }

  return { paintStep, savePaint, decodeChunk, versions, flatten, forgetPainting, startedSession };
}
