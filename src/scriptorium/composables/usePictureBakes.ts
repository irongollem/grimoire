/*
 * Keeps the baked picture in step with its recipe (#1176 story 9).
 *
 * A treated picture (an image node, or art page furniture) holds
 * { src, original, illuminate, bakedFor }. When the hash of `illuminate` is not
 * `bakedFor`, the `src` was baked from other steps, so it is re-baked from the
 * original at full resolution, stored under a new key, and `src` + `bakedFor`
 * are set. Print never waits for this: it renders the recipe itself.
 *
 * The write-back is not an edit the author made, so image nodes take it in a
 * transaction with `addToHistory: false` (Undo steps back over the author's
 * edits, not over a cache refresh). Furniture goes out through `setFurniture`,
 * which receives the whole updated array.
 *
 * Bakes run one at a time: a bake is a heavy job.
 */
import { ref } from "vue";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { ASSET_IMAGES_BUCKET, removeStorageImages } from "@/composables/useImageUpload";
import { bakeAndUpload, type BakeResult } from "@/scriptorium/illuminator/lib/bakeUpload";
import { hashSettings, hasSteps, parseSettings, type IlluminateSettings } from "@/scriptorium/illuminator/lib/treatment";
import type { PageFurnitureItem } from "@/scriptorium/types";

export type BakeFn = (original: string, settings: IlluminateSettings, userId: string) => Promise<BakeResult>;

export interface StalePicture {
  original: string;
  settings: IlluminateSettings;
  hash: string;
}

/** The recipe of a picture whose bake is out of date, or null when it is current or has no recipe. */
function stale(original: unknown, illuminate: unknown, bakedFor: unknown): StalePicture | null {
  if (typeof original !== "string" || original === "") return null;
  const settings = parseSettings(illuminate);
  if (!hasSteps(settings)) return null;
  const hash = hashSettings(settings);
  return hash === bakedFor ? null : { original, settings, hash };
}

/** Image nodes in `doc` whose bake is out of date. */
export function staleImageNodes(doc: ProseMirrorNode): StalePicture[] {
  const found: StalePicture[] = [];
  doc.descendants((node) => {
    if (node.type.name !== "image") return;
    const s = stale(node.attrs.original, node.attrs.illuminate, node.attrs.bakedFor);
    if (s) found.push(s);
  });
  return found;
}

/** Art furniture whose bake is out of date. */
export function staleFurnitureArt(items: readonly PageFurnitureItem[]): StalePicture[] {
  return items.flatMap((item) => {
    if (item.kind !== "art") return [];
    const s = stale(item.props.original, item.props.illuminate, item.props.bakedFor);
    return s ? [s] : [];
  });
}

export interface PictureBakesOptions {
  editor: () => Editor | null | undefined;
  furniture: () => PageFurnitureItem[];
  setFurniture: (next: PageFurnitureItem[]) => void;
  userId: () => string | undefined;
  /** Injected for tests; the real one bakes in a Worker and uploads. */
  bake?: BakeFn;
  /** Removes a bake nothing ended up referencing. */
  discard?: (url: string) => void;
}

const keyOf = (p: StalePicture) => `${p.original}\n${p.hash}`;

export function usePictureBakes(options: PictureBakesOptions) {
  const bake: BakeFn = options.bake ?? bakeAndUpload;
  const discard = options.discard ?? ((url: string) => void removeStorageImages(ASSET_IMAGES_BUCKET, url));
  const running = ref(false);
  const errors = ref<string[]>([]);

  function pending(): StalePicture[] {
    const ed = options.editor();
    const all = [...(ed ? staleImageNodes(ed.state.doc) : []), ...staleFurnitureArt(options.furniture())];
    const unique = new Map<string, StalePicture>();
    for (const p of all) unique.set(keyOf(p), p);
    return [...unique.values()];
  }

  /** Set src + bakedFor on every image node still holding this recipe. Returns how many. */
  function applyToNodes(p: StalePicture, url: string): number {
    const ed = options.editor();
    if (!ed) return 0;
    const tr = ed.state.tr;
    let count = 0;
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name !== "image") return;
      const s = stale(node.attrs.original, node.attrs.illuminate, node.attrs.bakedFor);
      if (!s || keyOf(s) !== keyOf(p)) return;
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: url, bakedFor: p.hash });
      count++;
    });
    if (count > 0) {
      tr.setMeta("addToHistory", false);
      ed.view.dispatch(tr);
    }
    return count;
  }

  function applyToFurniture(p: StalePicture, url: string): number {
    let count = 0;
    const next = options.furniture().map((item) => {
      if (item.kind !== "art") return item;
      const s = stale(item.props.original, item.props.illuminate, item.props.bakedFor);
      if (!s || keyOf(s) !== keyOf(p)) return item;
      count++;
      return { ...item, props: { ...item.props, src: url, bakedFor: p.hash } };
    });
    if (count > 0) options.setFurniture(next);
    return count;
  }

  /** Bake every stale picture. Resolves when all are done; one failing picture does not stop the rest. */
  async function bakeStale(): Promise<void> {
    const userId = options.userId();
    if (running.value || !userId) return;
    running.value = true;
    errors.value = [];
    try {
      for (const p of pending()) {
        try {
          const { url } = await bake(p.original, p.settings, userId);
          // The author may have edited the picture while it baked: only what
          // still holds this recipe takes the result, and a bake nothing took is removed.
          const applied = applyToNodes(p, url) + applyToFurniture(p, url);
          if (applied === 0) discard(url);
        } catch (err) {
          errors.value.push(err instanceof Error ? err.message : "A picture could not be baked.");
        }
      }
    } finally {
      running.value = false;
    }
  }

  return { running, errors, pending, bakeStale };
}
