// The Light tool (#1125 story 5): click puts a light of the slip's colour and reach down, a click on one that is
// already there picks it up (select, and drag to move it), Delete removes it. Lights live in `layers.lights`, beside
// the ones sets and props carry, and the glow, the darkness veil and the live battle map all read them from there.
//
// Like useDressingTool, a press that places or grabs a light stays open until its release and only the release files
// the undo step, so a drag is one step however many pointer moves it took.

import { ref, type Ref } from "vue";
import { snapPoint, nearestLight, type CellPoint } from "@/cartographer/wallPick";
import type { TileLight } from "@/cartographer/packSchema";
import type { DungeonMapLayers } from "@/types/dungeonMap.types";

export interface LightToolOptions {
  layers: Ref<DungeonMapLayers>;
  /** What the next light placed is made of; the slip edits it. */
  draft: Ref<TileLight>;
  snapshotStr: () => string;
  pushCommand: (before: string, after: string) => void;
  markDirty: () => void;
}

interface Press {
  id: string;
  before: string;
  /** True once a drag moved the light; a plain click on one only selects it. */
  moved: boolean;
  /** True for a light this press created: its release is an undo step even without a move. */
  placed: boolean;
  /** The light's own point minus the pointer, kept so it does not jump to the pointer on grab. */
  offset: CellPoint;
  origin: CellPoint;
}

export function useLightTool(opts: LightToolOptions) {
  const { layers, draft, snapshotStr, pushCommand, markDirty } = opts;

  const selectedId = ref<string | null>(null);
  /** The snapped point under the pointer, for the ghost. */
  const hover = ref<CellPoint | null>(null);
  let press: Press | null = null;

  function track(frac: CellPoint, free: boolean): void {
    hover.value = snapPoint(frac, free);
  }

  /**
   * Picks up the light under the pointer: selects it and starts a drag. False, changing nothing, when none is there.
   * The Select tool uses it too (#1125), so a light is reachable without switching to the Light tool.
   */
  function grabAt(frac: CellPoint): boolean {
    onPointerUp();
    const hit = nearestLight(layers.value.lights, frac);
    if (!hit) return false;
    const light = layers.value.lights[hit];
    selectedId.value = hit;
    press = {
      id: hit,
      before: snapshotStr(),
      moved: false,
      placed: false,
      offset: [light.x - frac[0], light.y - frac[1]],
      origin: [light.x, light.y],
    };
    return true;
  }

  /** A press: on a light it picks it up, elsewhere it places a new one. Always consumed. */
  function onPointerDown(frac: CellPoint, free: boolean): void {
    if (grabAt(frac)) return;
    const point = snapPoint(frac, free);
    const id = crypto.randomUUID();
    const before = snapshotStr();
    layers.value.lights[id] = { x: point[0], y: point[1], light: { ...draft.value } };
    selectedId.value = id;
    press = { id, before, moved: false, placed: true, offset: [0, 0], origin: point };
  }

  function onPointerMove(frac: CellPoint, free: boolean): void {
    track(frac, free);
    if (!press || press.placed) return;
    const light = layers.value.lights[press.id];
    if (!light) return;
    const next = snapPoint([frac[0] + press.offset[0], frac[1] + press.offset[1]], free);
    if (next[0] === light.x && next[1] === light.y) return;
    layers.value.lights[press.id] = { ...light, x: next[0], y: next[1] };
    press.moved = true;
  }

  function isHolding(): boolean {
    return press !== null;
  }

  /** Ends the press: a placement is one undo step, a drag one if the light actually moved. */
  function onPointerUp(): void {
    const done = press && (press.placed || press.moved) ? press : null;
    press = null;
    if (!done) return;
    markDirty();
    pushCommand(done.before, snapshotStr());
  }

  /** A second finger landed mid-press (a pinch): take a placement back, or put a dragged light down where it was. */
  function cancelGesture(): void {
    if (!press) return;
    const { id, placed, origin } = press;
    press = null;
    if (placed) {
      const next = { ...layers.value.lights };
      delete next[id];
      layers.value.lights = next;
      selectedId.value = null;
    } else {
      const light = layers.value.lights[id];
      if (light) layers.value.lights[id] = { ...light, x: origin[0], y: origin[1] };
    }
  }

  function deleteSelected(): boolean {
    const id = selectedId.value;
    if (!id || !layers.value.lights[id]) return false;
    const before = snapshotStr();
    const next = { ...layers.value.lights };
    delete next[id];
    layers.value.lights = next;
    selectedId.value = null;
    markDirty();
    pushCommand(before, snapshotStr());
    return true;
  }

  /** The slip edited the selected light: apply it as one undo step. No light selected: only the draft changes. */
  function updateSelected(patch: Partial<TileLight>): boolean {
    const id = selectedId.value;
    const light = id ? layers.value.lights[id] : undefined;
    if (!id || !light) return false;
    const before = snapshotStr();
    layers.value.lights[id] = { ...light, light: { ...light.light, ...patch } };
    markDirty();
    pushCommand(before, snapshotStr());
    return true;
  }

  function dropStaleSelection(): void {
    if (selectedId.value && !layers.value.lights[selectedId.value]) selectedId.value = null;
  }

  return { selectedId, hover, track, grabAt, onPointerDown, onPointerMove, onPointerUp, isHolding, cancelGesture, deleteSelected, updateSelected, dropStaleSelection };
}
