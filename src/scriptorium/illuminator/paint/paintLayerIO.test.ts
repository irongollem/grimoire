import { describe, expect, it } from "vitest";
import { TiledLayer } from "./engine/tiledLayer";
import { chunkPixels, fillChunk, paintedChunks, parseViewChunk, viewChunkUrl } from "./paintLayerIO";

/** A layer wider and taller than one 1024 chunk, so the edge chunks are short and tiles straddle nothing but are many. */
const W = 1300;
const H = 1100;

function paintDot(layer: TiledLayer, x: number, y: number, rgba: [number, number, number, number]) {
  const key = layer.key(Math.floor(x / layer.tileSize), Math.floor(y / layer.tileSize));
  const tile = layer.ensureTile(key);
  const o = ((y % layer.tileSize) * layer.tileSize + (x % layer.tileSize)) * 4;
  tile.set(rgba, o);
}
const dump = (layer: TiledLayer) =>
  layer
    .keys()
    .sort((a, b) => a - b)
    .map((k) => [k, Array.from(layer.tile(k) ?? [])]);

describe("a layer's chunks", () => {
  // Fails if a chunk read-back puts a pixel at the wrong place (a tile/chunk offset slip), loses its alpha, or
  // drops a pixel on a chunk edge: the reopened painting would not be the one that was saved.
  it("round-trips every pixel of a layer through its chunks", () => {
    const layer = new TiledLayer(W, H);
    const dots: [number, number][] = [[0, 0], [255, 256], [1023, 1023], [1024, 0], [1299, 1099], [1024, 1024], [500, 700]];
    dots.forEach(([x, y], i) => paintDot(layer, x, y, [10 + i, 20, 30, 40 + i]));
    const back = new TiledLayer(W, H);
    for (const key of paintedChunks(layer)) {
      const [cx, cy] = key.split(",").map(Number) as [number, number];
      const pixels = chunkPixels(layer, cx, cy);
      if (!pixels) throw new Error(`chunk ${key} is empty`);
      fillChunk(back, cx, cy, pixels);
    }
    expect(dump(back)).toEqual(dump(layer));
  });

  // Fails if an empty chunk is reported as painted, so an erased chunk would be uploaded again as a blank file.
  it("reports no pixels for a chunk with no paint, and ignores tiles that hold only transparency", () => {
    const layer = new TiledLayer(W, H);
    layer.ensureTile(layer.key(0, 0));
    expect(chunkPixels(layer, 0, 0)).toBeNull();
    expect([...paintedChunks(layer)]).toEqual([]);
  });

  // Fails if an edge chunk is cut to the wrong size: the stored picture would be stretched when drawn at its place.
  it("clips the last chunk to the document's edge", () => {
    const layer = new TiledLayer(W, H);
    paintDot(layer, 1299, 1099, [1, 2, 3, 255]);
    expect(chunkPixels(layer, 1, 1)).toMatchObject({ width: W - 1024, height: H - 1024 });
  });

  // Fails if a stored chunk of the wrong size is poured into a layer (a document that changed size under it).
  it("refuses a chunk that is not the size of its place", () => {
    const layer = new TiledLayer(W, H);
    expect(() => fillChunk(layer, 0, 0, { width: 10, height: 10, data: new Uint8ClampedArray(400) })).toThrow();
  });

  // Fails if the preview's chunk name does not parse back to the layer and chunk it names.
  it("names a chunk for the preview and reads the name back", () => {
    expect(parseViewChunk(viewChunkUrl("layer-3", 1, 0))).toEqual({ layerId: "layer-3", cx: 1, cy: 0 });
    expect(parseViewChunk("https://cdn/x.webp")).toBeNull();
  });
});
