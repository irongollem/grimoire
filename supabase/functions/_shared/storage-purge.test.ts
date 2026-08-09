import { describe, expect, it } from "vitest";
import { listAllFilePaths, chunk, type StorageEntry } from "./storage-purge";

describe("listAllFilePaths", () => {
  it("returns file paths at the top level only when there are no sub-folders", async () => {
    const list = async (prefix: string): Promise<StorageEntry[]> => {
      if (prefix === "user-1") {
        return [
          { name: "a.png", id: "1" },
          { name: "b.png", id: "2" },
        ];
      }
      return [];
    };
    await expect(listAllFilePaths(list, "user-1")).resolves.toEqual(["user-1/a.png", "user-1/b.png"]);
  });

  it("recurses into folders (id === null) to arbitrary depth", async () => {
    const tree: Record<string, StorageEntry[]> = {
      "user-1": [
        { name: "root.png", id: "1" },
        { name: "mini-1", id: null },
      ],
      "user-1/mini-1": [
        { name: "model.glb", id: "2" },
        { name: "textures", id: null },
      ],
      "user-1/mini-1/textures": [{ name: "diffuse.webp", id: "3" }],
    };
    const list = async (prefix: string): Promise<StorageEntry[]> => tree[prefix] ?? [];

    await expect(listAllFilePaths(list, "user-1")).resolves.toEqual([
      "user-1/root.png",
      "user-1/mini-1/model.glb",
      "user-1/mini-1/textures/diffuse.webp",
    ]);
  });

  it("returns an empty list for a folder that does not exist", async () => {
    await expect(listAllFilePaths(async () => [], "user-1")).resolves.toEqual([]);
  });
});

describe("chunk", () => {
  it("splits into groups of at most `size`", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns no chunks for an empty array", () => {
    expect(chunk([], 100)).toEqual([]);
  });

  it("returns a single chunk when items fit within size", () => {
    expect(chunk([1, 2], 100)).toEqual([[1, 2]]);
  });
});
