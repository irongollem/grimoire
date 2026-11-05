import { computed, shallowRef, toValue, watch, type MaybeRefOrGetter } from "vue";
import { cutSides, type Side } from "@/lib/bookNook/framing";
import type { Images } from "@/lib/bookNook/render";
import { layersOf, type Scene } from "@/lib/bookNook/scene";

/** Largest side of the copy whose edges are read for cut sides: enough to see an opaque row, cheap to read. */
const READ_MAX = 512;

/** The cut sides of an image, or null when its pixels cannot be read (a canvas has no context, or is tainted). */
export function readCutSides(img: HTMLImageElement): Side[] | null {
  const k = Math.min(1, READ_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * k));
  const height = Math.max(1, Math.round(img.naturalHeight * k));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(img, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;
    const alpha = new Uint8ClampedArray(width * height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    return cutSides(alpha, width, height);
  } catch {
    // A tainted canvas refuses its pixels. The layer then has no entry in `cut`, and `checkWindow` leaves it out.
    return null;
  }
}

/**
 * The images of a scene's layers, loaded once per layer id and source (a drag or a resize does not reload
 * them), cross-origin-clean so their alpha can be read. Alongside: each image's size, its cut sides (for the
 * floating check) and the sources that failed to load, so the studio can name them instead of drawing a hole.
 */
export function useNookImages(scene: MaybeRefOrGetter<Scene | null>) {
  const images = shallowRef<Images>(new Map());
  const sizes = shallowRef(new Map<string, { width: number; height: number }>());
  const cut = shallowRef(new Map<string, Side[]>());
  const failed = shallowRef<string[]>([]);
  const loading = new Map<string, string>();

  const wanted = computed(() => {
    const s = toValue(scene);
    return s ? layersOf(s).map((l) => ({ id: l.id, src: l.src })) : [];
  });

  function load(id: string, src: string) {
    if (loading.get(id) === src) return;
    loading.set(id, src);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (loading.get(id) !== src) return;
      images.value = new Map(images.value).set(id, img);
      sizes.value = new Map(sizes.value).set(id, { width: img.naturalWidth, height: img.naturalHeight });
      const sides = readCutSides(img);
      if (sides) cut.value = new Map(cut.value).set(id, sides);
    };
    img.onerror = () => {
      if (loading.get(id) === src) failed.value = [...failed.value, src];
    };
    img.src = src;
  }

  watch(
    wanted,
    (list) => {
      for (const { id, src } of list) load(id, src);
    },
    { immediate: true },
  );

  /** Every layer's image height over its width, by layer id. */
  const aspects = computed(() => new Map([...sizes.value].map(([id, s]) => [id, s.height / s.width])));
  const ready = computed(() => wanted.value.length > 0 && wanted.value.every((w) => images.value.has(w.id)));

  return { images, sizes, cut, aspects, ready, failed };
}
