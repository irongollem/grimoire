import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TilePackManifest } from "@/cartographer/packSchema";

const mocks = vi.hoisted(() => ({
  signed: [] as string[][],
  loaded: [] as TilePackManifest[],
  opts: [] as unknown[],
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => {
          mocks.signed.push(paths);
          return { data: paths.map((p) => ({ signedUrl: `https://signed/${p}` })), error: null };
        },
      }),
    },
  },
}));
vi.mock("@/cartographer/packLoader", async (importActual) => ({
  ...(await importActual<typeof import("@/cartographer/packLoader")>()),
  loadPack: async (url: string, opts?: unknown) => {
    mocks.opts.push(opts);
    mocks.loaded.push(JSON.parse(await (await fetch(url)).text()) as TilePackManifest);
    return {};
  },
}));

const { loadUserPack } = await import("./useTilePacks");

describe("loadUserPack", () => {
  beforeEach(() => {
    mocks.signed.length = 0;
    mocks.loaded.length = 0;
    mocks.opts.length = 0;
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (blob: Blob) => blob, revokeObjectURL: () => undefined }));
    vi.stubGlobal("fetch", async (blob: Blob) => ({ text: () => blob.text() }));
  });

  it("signs only the tiles and drops motion and sway, which a published snapshot could not keep", async () => {
    const manifest = {
      pack_id: "mine",
      assets: { floor: [{ variant: 0, url: "tiles/floor-0.webp" }] },
      motion: { terrainWater: [{ url: "motion/foam.webp", cells: 4, drift: [0, 0], alpha: 0.5 }] },
      sway: { objectPillar: [{ amount: 3, speed: 1 }] },
    } as unknown as TilePackManifest;
    await loadUserPack({ user_id: "u1", pack_id: "mine", pack_version: 2, manifest } as never);
    expect(mocks.signed).toEqual([["u1/mine/v2/tiles/floor-0.webp"]]);
    expect(mocks.loaded[0]).not.toHaveProperty("motion");
    expect(mocks.loaded[0]).not.toHaveProperty("sway");
    expect(mocks.loaded[0]!.assets.floor![0]!.url).toBe("https://signed/u1/mine/v2/tiles/floor-0.webp");
  });

  it("marks the runtime as holding urls that do not last", async () => {
    const manifest = { pack_id: "mine", assets: {} } as unknown as TilePackManifest;
    await loadUserPack({ user_id: "u1", pack_id: "mine", pack_version: 2, manifest } as never);
    expect(mocks.opts).toEqual([{ lastingUrls: false }]);
  });
});
