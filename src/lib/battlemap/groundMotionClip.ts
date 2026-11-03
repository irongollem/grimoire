// The live water must follow the same material boundary as the baked ground. A cell mask cannot describe a shore.
import type { MapLiveGroup } from "@/types/mapLive.types";

type ClipContext = Pick<CanvasRenderingContext2D, "beginPath" | "moveTo" | "lineTo" | "closePath" | "rect"> & {
  clip(fillRule?: CanvasFillRule): void;
};

interface MotionFrame {
  cellPx: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export function clipGroundMotion(ctx: ClipContext, group: MapLiveGroup, frame: MotionFrame): void {
  const { cellPx, originX, originY, width, height } = frame;
  const rings = (loops: readonly (readonly (readonly [number, number])[])[]): void => {
    for (const loop of loops) {
      loop.forEach(([x, y], i) => {
        const px = originX + x * cellPx;
        const py = originY + y * cellPx;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.closePath();
    }
  };
  const shape = group.clip;
  ctx.beginPath();
  if (shape) {
    rings(shape.outline);
    ctx.clip("evenodd");
    // Clip against each cover separately: overlapping covers must stay hidden rather than cancel one another.
    for (const cover of shape.occluded) {
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      rings(cover);
      ctx.clip("evenodd");
    }
  } else {
    // Outer mass and square-based motion groups use their cell coverage.
    for (const key of group.cells) {
      const [xs, ys] = key.split(",");
      const px = originX + Number(xs) * cellPx;
      const py = originY + Number(ys) * cellPx;
      if (px + cellPx < 0 || py + cellPx < 0 || px > width || py > height) continue;
      ctx.rect(px, py, cellPx, cellPx);
    }
    ctx.clip();
  }
}
