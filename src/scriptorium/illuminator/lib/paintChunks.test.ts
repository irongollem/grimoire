import { describe, expect, it } from "vitest";
import { chunkGrid, chunkKey, chunkRect, chunksForTiles, parseChunkKey } from "./paintChunks";

describe("paint chunks", () => {
  // Fails on: a key written one way and read another, so saved chunks are never found again.
  it("round-trips a key and refuses anything else", () => {
    expect(parseChunkKey(chunkKey(3, 12))).toEqual({ cx: 3, cy: 12 });
    for (const bad of ["", "1", "1,", "a,b", "-1,0", "1,2,3", "1.5,2"]) expect(parseChunkKey(bad)).toBeNull();
  });

  // Fails on: a floor instead of a ceiling, which drops the ragged last row and column of paint.
  it("rounds the grid up", () => {
    expect(chunkGrid(1024, 1024)).toEqual({ cols: 1, rows: 1 });
    expect(chunkGrid(1025, 2048)).toEqual({ cols: 2, rows: 2 });
    expect(chunkGrid(4096, 100)).toEqual({ cols: 4, rows: 1 });
  });

  // Fails on: mixing up tx and ty, or using the chunk size instead of tiles per chunk (a 256 tile at (5,1) is chunk 1,0).
  it("maps tile keys to the chunks that contain them", () => {
    const cols = 8; // a 2048 wide layer of 256 tiles
    const key = (tx: number, ty: number) => ty * cols + tx;
    const got = chunksForTiles([key(0, 0), key(3, 3), key(5, 1), key(4, 4), key(7, 7)], 256, cols);
    expect([...got].sort()).toEqual(["0,0", "1,0", "1,1"]);
  });

  // Fails on: a clipped edge chunk keeping its full size, so it draws past the document.
  it("clips the last chunk to the document", () => {
    expect(chunkRect(0, 0, 3000, 3000)).toEqual({ x: 0, y: 0, w: 1024, h: 1024 });
    expect(chunkRect(2, 2, 3000, 2500)).toEqual({ x: 2048, y: 2048, w: 952, h: 452 });
  });
});
