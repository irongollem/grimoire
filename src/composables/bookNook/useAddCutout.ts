import { ref } from "vue";
import { useToast } from "@/composables/useToast";
import { addCutout, newLayerId } from "@/lib/bookNook/edit";
import { addLiftedPart, addStockPart, replaceRoom } from "@/lib/bookNook/editRoom";
import { partRect } from "@/lib/bookNook/liftGeometry";
import type { Point, Rect, Scene } from "@/lib/bookNook/scene";
import { uploadNookImage } from "@/lib/bookNook/upload";
import { useAuthStore } from "@/stores/auth";
import type { LiftResult } from "@/components/bookNook/studio/addCutout/liftFlow";
import type { LibraryNookPart } from "@/types/bookNook.types";

/** The pixel size of an image file or blob, read without drawing it. */
async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/** The size of a picture at a URL (a stock part), through an <img> so no CORS read is needed. */
function urlSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("That part's picture could not be loaded."));
    img.src = url;
  });
}

/**
 * Every way a cut-out gets into a nook (frame 06): a file or a generated picture stored under the owner's
 * nook folder, a stock part used where it lies, and a lifted part standing where it came from. Each lands in
 * the middle of the stage unless it knows better, at the picture's depth, and tells the studio its id so the
 * inspector can open on it. One `update` per add, so one undo step.
 */
export function useAddCutout(options: {
  nookId: () => string;
  update: (change: (scene: Scene) => Scene) => void;
  /** The new layer's id, so the studio can select it. */
  added: (id: string) => void;
}) {
  const auth = useAuthStore();
  const toast = useToast();
  const busy = ref(false);

  /** Runs one add with the busy flag and a toast for a failure; true when it went in. */
  async function guarded(work: (userId: string) => Promise<void>): Promise<boolean> {
    const user = auth.user;
    if (!user) {
      toast.error("Sign in again to add a cut-out.");
      return false;
    }
    busy.value = true;
    try {
      await work(user.id);
      return true;
    } catch (e) {
      toast.error(toast.fromError(e));
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** A picture (an upload, or a painted or background-removed one) stored and stood in the middle, or at `at`. */
  function addFromBlob(blob: Blob, name: string, at?: Point): Promise<boolean> {
    return guarded(async (userId) => {
      const [size, src] = await Promise.all([imageSize(blob), uploadNookImage(blob, options.nookId(), userId)]);
      const id = newLayerId(name);
      options.update((scene) => addCutout(scene, { id, src, ...size }, at ?? { x: scene.size.width / 2, y: scene.size.height / 2 }));
      options.added(id);
    });
  }

  const add = (file: File) => addFromBlob(file, file.name);

  /** A shelf part, with its motion and pin already set. */
  function addFromStock(part: LibraryNookPart): Promise<boolean> {
    return guarded(async () => {
      if (part.kind !== "cutout" || !part.image_url) throw new Error("That part has no picture yet.");
      const size = await urlSize(part.image_url);
      const id = newLayerId(part.name);
      const src = part.image_url;
      options.update((scene) => addStockPart(scene, { id, src, ...size }, part.preset));
      options.added(id);
    });
  }

  /**
   * A finished lift: the part goes in where it came from and, when the gap was painted, the room's picture is
   * replaced in the same step. `scale` is the scene's room width over the picture file's.
   */
  function addLifted(result: LiftResult, scale: number): boolean {
    const id = newLayerId("lifted");
    const rect: Rect = partRect(result.bounds, result.crop, scale);
    options.update((scene) => {
      const next = result.roomUrl ? replaceRoom(scene, result.roomUrl) : scene;
      return addLiftedPart(next, { id, src: result.partUrl, width: result.bounds.w, height: result.bounds.h }, rect);
    });
    options.added(id);
    return true;
  }

  return { add, addFromBlob, addFromStock, addLifted, busy };
}
