/** Straight (non-premultiplied) RGBA pixels in lazily allocated square tiles. Empty areas cost nothing. */
export const DEFAULT_TILE_SIZE = 256;

export interface TileRect {
  x: number;
  y: number;
  /** Clipped to the layer, so an edge tile can be narrower than `tileSize` (its data still has full stride). */
  w: number;
  h: number;
}

export class TiledLayer {
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  readonly cols: number;
  readonly rows: number;
  private readonly tiles = new Map<number, Uint8ClampedArray>();

  constructor(width: number, height: number, tileSize: number = DEFAULT_TILE_SIZE) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
    this.cols = Math.ceil(width / tileSize);
    this.rows = Math.ceil(height / tileSize);
  }

  key(tx: number, ty: number): number {
    return ty * this.cols + tx;
  }

  tile(key: number): Uint8ClampedArray | undefined {
    return this.tiles.get(key);
  }

  ensureTile(key: number): Uint8ClampedArray {
    let t = this.tiles.get(key);
    if (!t) {
      t = new Uint8ClampedArray(this.tileSize * this.tileSize * 4);
      this.tiles.set(key, t);
    }
    return t;
  }

  /** Puts a tile in place, or removes it when `data` is null. */
  setTile(key: number, data: Uint8ClampedArray | null): void {
    if (data === null) this.tiles.delete(key);
    else this.tiles.set(key, data);
  }

  keys(): number[] {
    return [...this.tiles.keys()];
  }

  tileRect(key: number): TileRect {
    const tx = key % this.cols;
    const ty = Math.floor(key / this.cols);
    const x = tx * this.tileSize;
    const y = ty * this.tileSize;
    return { x, y, w: Math.min(this.tileSize, this.width - x), h: Math.min(this.tileSize, this.height - y) };
  }

  /** Keys of every tile (existing or not) that a rectangle in canvas pixels touches. */
  tilesInRect(x: number, y: number, w: number, h: number): number[] {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    if (x1 <= x0 || y1 <= y0) return [];
    const out: number[] = [];
    const t = this.tileSize;
    for (let ty = Math.floor(y0 / t); ty <= Math.floor((y1 - 1) / t); ty++) {
      for (let tx = Math.floor(x0 / t); tx <= Math.floor((x1 - 1) / t); tx++) out.push(this.key(tx, ty));
    }
    return out;
  }

  /**
   * The colour under a disc, weighted by alpha, plus the mean alpha. Null when nothing there has any
   * paint. Large discs are sampled on a grid so smudging stays cheap.
   */
  averageColour(x: number, y: number, radius: number): { r: number; g: number; b: number; a: number } | null {
    const step = Math.max(1, Math.floor(radius / 8));
    const t = this.tileSize;
    let r = 0;
    let g = 0;
    let b = 0;
    let aSum = 0;
    let n = 0;
    const r2 = radius * radius;
    for (let py = Math.floor(y - radius); py <= Math.ceil(y + radius); py += step) {
      for (let px = Math.floor(x - radius); px <= Math.ceil(x + radius); px += step) {
        const dx = px + 0.5 - x;
        const dy = py + 0.5 - y;
        if (dx * dx + dy * dy > r2) continue;
        n++;
        if (px < 0 || py < 0 || px >= this.width || py >= this.height) continue;
        const data = this.tiles.get(this.key(Math.floor(px / t), Math.floor(py / t)));
        if (!data) continue;
        const o = ((py % t) * t + (px % t)) * 4;
        const a = data[o + 3];
        if (a === 0) continue;
        r += data[o] * a;
        g += data[o + 1] * a;
        b += data[o + 2] * a;
        aSum += a;
      }
    }
    if (aSum === 0 || n === 0) return null;
    return { r: r / aSum, g: g / aSum, b: b / aSum, a: aSum / 255 / n };
  }

  isTileEmpty(data: Uint8ClampedArray): boolean {
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
    return true;
  }
}
