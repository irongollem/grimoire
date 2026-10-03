import type { ViewportTransform } from "@vue-flow/core";

const PREFIX = "grimoire:quest-flow-viewport:";

export function readQuestViewport(questId: string, storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): ViewportTransform | null {
  if (!storage) return null;
  try {
    const value = JSON.parse(storage.getItem(`${PREFIX}${questId}`) ?? "null") as Partial<ViewportTransform> | null;
    return value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.zoom) && value.zoom! > 0
      ? { x: value.x!, y: value.y!, zoom: value.zoom! }
      : null;
  } catch {
    return null;
  }
}

export function writeQuestViewport(questId: string, viewport: ViewportTransform, storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage) {
  try {
    storage?.setItem(`${PREFIX}${questId}`, JSON.stringify(viewport));
  } catch {
    // Private browsing and full storage quotas must not break canvas controls.
  }
}

/**
 * Whether a stored viewport still puts something on screen.
 *
 * A viewport is saved in the window that produced it and restored into whatever
 * window exists next — a narrower one, a shorter panel, a canvas that was
 * collapsed when the transform was captured. Restore it blindly and the flow
 * opens on empty space with every beat parked off the left edge, which reads as
 * an empty quest until you happen to press Fit.
 */
export function viewportShowsAnyNode(
  viewport: ViewportTransform,
  nodes: Array<{ position: { x: number; y: number } }>,
  size: { width: number; height: number },
  node: { width: number; height: number } = { width: 240, height: 120 },
): boolean {
  if (!nodes.length) return true;
  if (size.width <= 0 || size.height <= 0) return false;
  return nodes.some((candidate) => {
    const left = candidate.position.x * viewport.zoom + viewport.x;
    const top = candidate.position.y * viewport.zoom + viewport.y;
    return left + node.width * viewport.zoom > 0
      && left < size.width
      && top + node.height * viewport.zoom > 0
      && top < size.height;
  });
}

/**
 * The smallest zoom the Story flow allows. Low enough that Fit fits a long
 * quest for real (#944): a 15-beat chain in a 754px pane needs 0.168, and at
 * the old floor of 0.25 the clamp won, so Fit drew the graph both unreadable
 * and overflowing both edges.
 */
export const QUEST_FLOW_MIN_ZOOM = 0.05;

/**
 * Below this a beat card's text is no longer readable (a 12px caption at 0.75
 * is 9px). The Story flow opens fitted only when the fit stays above it;
 * otherwise it opens on one beat at full size. Frame `02 Story flow` draws Fit
 * and Current beat side by side, with the beats legible: Fit is the overview,
 * not the first view.
 */
export const QUEST_FLOW_READABLE_ZOOM = 0.75;

/**
 * The beat a long quest opens on when a fitted view would be unreadable: where
 * the party is, else where the quest starts, else the leftmost beat (the flow
 * reads left to right).
 */
export function openingBeatId(
  nodes: ReadonlyArray<{ id: string; position: { x: number; y: number } }>,
  currentBeatId: string | null,
  entryBeatId: string | null,
): string | null {
  for (const id of [currentBeatId, entryBeatId]) {
    if (id && nodes.some((node) => node.id === id)) return id;
  }
  let leftmost: (typeof nodes)[number] | null = null;
  for (const node of nodes) {
    if (!leftmost || node.position.x < leftmost.position.x || (node.position.x === leftmost.position.x && node.position.y < leftmost.position.y)) leftmost = node;
  }
  return leftmost?.id ?? null;
}
