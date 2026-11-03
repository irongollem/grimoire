// Where a pixel on the editor canvas is in the world and on the grid, and the other way round.
// Split out of useMapCanvasEditor: the render pass, the pointer router and the touch gestures all
// ask the same questions of the same viewport, so they share one answer.

import type { Ref } from "vue";
import { BASE_TILE_SIZE } from "@/cartographer/packSchema";

export function useEditorGeometry(inputs: {
  canvasEl: Ref<HTMLCanvasElement | null>;
  zoom: Ref<number>;
  viewportOffset: Ref<{ x: number; y: number }>;
}) {
  const { canvasEl, zoom, viewportOffset } = inputs;

  function devicePixelDims(): { w: number; h: number; dpr: number } {
    const canvas = canvasEl.value!;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    return { w: rect.width, h: rect.height, dpr };
  }

  // World pixel coords (canvas-pixel space) given an event on the canvas.
  function pointerToWorld(local: { x: number; y: number }): { x: number; y: number } {
    const { dpr } = devicePixelDims();
    return {
      x: viewportOffset.value.x + local.x * dpr,
      y: viewportOffset.value.y + local.y * dpr,
    };
  }

  function tilePixelSize(): number {
    return BASE_TILE_SIZE * zoom.value * (window.devicePixelRatio || 1);
  }

  function viewportToCell(px: number, py: number): [number, number] {
    const { dpr } = devicePixelDims();
    const tileCSS = BASE_TILE_SIZE * zoom.value;
    const worldX = viewportOffset.value.x + px * dpr;
    const worldY = viewportOffset.value.y + py * dpr;
    const x = Math.floor(worldX / (tileCSS * dpr));
    const y = Math.floor(worldY / (tileCSS * dpr));
    return [x, y];
  }

  function visibleCellBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    const { w, h, dpr } = devicePixelDims();
    const tileCSS = BASE_TILE_SIZE * zoom.value;
    const minX = Math.floor(viewportOffset.value.x / (tileCSS * dpr));
    const minY = Math.floor(viewportOffset.value.y / (tileCSS * dpr));
    const maxX = Math.ceil((viewportOffset.value.x + w * dpr) / (tileCSS * dpr));
    const maxY = Math.ceil((viewportOffset.value.y + h * dpr) / (tileCSS * dpr));
    return { minX, minY, maxX, maxY };
  }

  function getLocalPointer(ev: MouseEvent): { x: number; y: number } {
    const rect = canvasEl.value!.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  /** Fractional cell coordinates under a pointer event, for hit-testing props. */
  function fractionalCellAt(ev: MouseEvent): [number, number] {
    const world = pointerToWorld(getLocalPointer(ev));
    const tilePx = tilePixelSize();
    return [world.x / tilePx, world.y / tilePx];
  }

  return { devicePixelDims, pointerToWorld, tilePixelSize, viewportToCell, visibleCellBounds, getLocalPointer, fractionalCellAt };
}

export type EditorGeometry = ReturnType<typeof useEditorGeometry>;
