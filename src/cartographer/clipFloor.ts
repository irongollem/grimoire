// The editor and bake share this painter: every material is tiled in map coordinates and clipped to its own curves.
// A water shoreline has no wall or automatic cell curb. Its vector is revealed only by the editor selection overlay.
import type { Frame, Target } from "./drawFrame";
import type { PackCategory } from "./packSchema";
import type { TilePackRuntime } from "./packLoader";
export type VariantAt = (runtime: TilePackRuntime, category: PackCategory, x: number, y: number, stored: number) => number;
import { groundBounds, groundLoops, orderedGround } from "./groundRegions";

export function paintGroundRegions(frame: Frame, target: Target, variantAt: VariantAt): void {
  const { tilePx, bounds, runtime } = frame;
  const { ctx } = target;
  for (const [, region] of orderedGround(frame.layers)) {
    const box = groundBounds(region);
    if (!box || box.maxX < bounds.minX || box.minX > bounds.maxX + 1 || box.maxY < bounds.minY || box.minY > bounds.maxY + 1) continue;
    const pack = runtime(region.material.pack_id);
    if (!pack) continue;
    const category = region.category === "terrainWater" && pack.variantCount("terrainWater") > 0 ? "terrainWater" : "floor";
    ctx.save(); ctx.beginPath();
    for (const loop of groundLoops(region)) {
      loop.forEach(([x, y], i) => {
        const px = x * tilePx - target.ox; const py = y * tilePx - target.oy;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.closePath();
    }
    ctx.clip("evenodd");
    for (let y = Math.max(bounds.minY, Math.floor(box.minY)); y < Math.min(bounds.maxY + 1, Math.ceil(box.maxY)); y++) {
      for (let x = Math.max(bounds.minX, Math.floor(box.minX)); x < Math.min(bounds.maxX + 1, Math.ceil(box.maxX)); x++) {
        const stored = region.variants[`${x},${y}`] ?? region.material.variant;
        const tile = pack.getTile(category, variantAt(pack, category, x, y, stored));
        ctx.drawImage(tile.source, x * tilePx - target.ox, y * tilePx - target.oy, tilePx, tilePx);
      }
    }
    ctx.restore();
  }
}
