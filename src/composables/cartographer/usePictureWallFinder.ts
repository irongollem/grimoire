// "Find walls in the picture" (#1197, canvas Picture Maps frame 07): the state of one finding, kept out of the
// components. It reads the site's picture once, proposes rings of wall from it (`proposeWallRings`), lets the DM keep
// or drop each, and writes what is kept as ordinary hidden walls with nodes, in one undo step. A proposal is never a
// result: nothing reaches the map until `apply`.

import { onScopeDispose, getCurrentScope, reactive, ref, watch, computed, type Ref } from "vue";
import { AREA_RES } from "@/cartographer/area";
import { outlineToWalls } from "@/cartographer/brushWalls";
import { DEFAULT_TRACE_OPTIONS, proposeWallRings, type TraceOptions, type TracePixels } from "@/cartographer/pictureTrace";
import { projectOnSegment } from "@/cartographer/wallEdit/geometry";
import { pictureCellPlacement, type WorkbenchPicture } from "@/composables/cartographer/useWorkbenchPicture";
import { useToast } from "@/composables/useToast";
import type { DungeonMapLayers, PackRef } from "@/types/dungeonMap.types";

type P = [number, number];

export interface WallProposal {
  ring: P[];
  kept: boolean;
}

/** Reads a picture's pixels, `width` of them across. Throws when the picture cannot be loaded or read. */
export type PictureReader = (url: string, width: number) => Promise<TracePixels>;

/** How long a change of option waits before the proposal is made again, so a dragged slider asks once. */
const REPROPOSE_MS = 100;
/** What a wall that no tile set draws is recorded against, as an imported hidden wall is (uvttImport). */
const NO_TILE_SET: PackRef = { pack_id: "", pack_version: 0, variant: 0 };

export const PICTURE_UNREADABLE = "The picture could not be read, so its walls cannot be found. Trace them by hand.";

/**
 * The picture's pixels at the resolution the rule works in. The CDN answers an anonymous cross-origin read, which a
 * canvas needs to stay readable; the picture the editor shows is loaded without it, so this is a second copy.
 */
export const readPicturePixels: PictureReader = (url, width) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onerror = () => reject(new Error("The picture did not load"));
    img.onload = () => {
      try {
        if (img.naturalWidth <= 0 || img.naturalHeight <= 0) throw new Error("The picture is empty");
        const height = Math.max(1, Math.round((width * img.naturalHeight) / img.naturalWidth));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No canvas to read the picture with");
        ctx.drawImage(img, 0, 0, width, height);
        const { data } = ctx.getImageData(0, 0, width, height); // a tainted canvas throws here
        resolve({ width, height, data });
      } catch (e) {
        reject(e);
      }
    };
    img.src = url;
  });

export interface PictureWallFinderOptions {
  picture: () => WorkbenchPicture | null | undefined;
  layers: Ref<DungeonMapLayers>;
  snapshotStr: () => string;
  pushCommand: (before: string, after: string) => void;
  markDirty: () => void;
  /** Injected so the composable is testable without canvas pixels. */
  reader?: PictureReader;
}

export function usePictureWallFinder(opts: PictureWallFinderOptions) {
  const { picture, layers, snapshotStr, pushCommand, markDirty } = opts;
  const reader = opts.reader ?? readPicturePixels;
  const toast = useToast();

  const active = ref(false);
  const busy = ref(false);
  const options = reactive<TraceOptions>({ ...DEFAULT_TRACE_OPTIONS });
  const proposals = ref<WallProposal[]>([]);
  const keptCount = computed(() => proposals.value.filter((p) => p.kept).length);

  /** The picture's pixels and where it lies, held while the finder is open so another sensitivity re-reads nothing. */
  let held: { pixels: TracePixels; placement: ReturnType<typeof pictureCellPlacement> } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped by every find and cancel, so a picture that arrives after the DM gave up is not opened. */
  let ticket = 0;

  function propose(): void {
    if (!held) return;
    proposals.value = proposeWallRings(held.pixels, held.placement, { ...options }).map((ring) => ({ ring, kept: true }));
  }

  function clearTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  watch(options, () => {
    if (!held) return;
    clearTimer();
    timer = setTimeout(() => { timer = null; propose(); }, REPROPOSE_MS);
  });

  function close(): void {
    ticket++;
    clearTimer();
    held = null;
    proposals.value = [];
    busy.value = false;
    active.value = false;
  }

  async function find(): Promise<void> {
    const pic = picture();
    if (!pic || !pic.calibration || busy.value) return;
    const placement = pictureCellPlacement(pic.calibration);
    const mine = ++ticket;
    busy.value = true;
    try {
      const pixels = await reader(pic.url, Math.max(1, Math.round(placement.across * AREA_RES)));
      if (mine !== ticket) return;
      held = { pixels, placement };
      propose();
      active.value = true;
    } catch {
      if (mine !== ticket) return;
      toast.error(PICTURE_UNREADABLE);
    } finally {
      if (mine === ticket) busy.value = false;
    }
  }

  function toggle(index: number): void {
    const proposal = proposals.value[index];
    if (proposal) proposal.kept = !proposal.kept;
  }
  const keepAll = (): void => { for (const p of proposals.value) p.kept = true; };
  const dropAll = (): void => { for (const p of proposals.value) p.kept = false; };

  /** Writes every kept ring as hidden walls, one undo step, and closes. Returns how many rings were written. */
  function apply(): number {
    const rings = proposals.value.filter((p) => p.kept).map((p) => p.ring);
    if (rings.length === 0) {
      close();
      return 0;
    }
    const before = snapshotStr();
    for (const ring of rings) {
      const walls = outlineToWalls(ring, { newKey: () => crypto.randomUUID(), wall: NO_TILE_SET });
      // Hidden: the picture already shows its walls, and a hidden wall still stops sight and light.
      for (const [id, wall] of Object.entries(walls)) layers.value.walls[id] = { ...wall, visible: false };
    }
    markDirty();
    pushCommand(before, snapshotStr());
    close();
    return rings.length;
  }

  /** The proposal whose outline passes nearest a point, within `reach` cells; null when none does. */
  function ringAt(point: P, reach: number): number | null {
    let best: number | null = null;
    let bestDist = reach;
    proposals.value.forEach(({ ring }, index) => {
      for (let i = 0; i < ring.length; i++) {
        const d = projectOnSegment(point, ring[i], ring[(i + 1) % ring.length]).dist;
        if (d <= bestDist) {
          bestDist = d;
          best = index;
        }
      }
    });
    return best;
  }

  if (getCurrentScope()) onScopeDispose(close);

  return { active, busy, options, proposals, keptCount, find, toggle, keepAll, dropAll, cancel: close, apply, ringAt };
}

export type PictureWallFinder = ReturnType<typeof usePictureWallFinder>;
