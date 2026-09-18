import { describe, expect, it } from "vitest";
import { reactive } from "vue";
import { cloneManifest } from "./cloneManifest";
import type { TilePackManifest } from "./packSchema";

const manifest = { pack_id: "p", assets: { floor: [{ variant: 0, url: "floor/0.webp" }] } } as unknown as TilePackManifest;

describe("cloneManifest", () => {
  it("copies deeply, so rewriting a slot url cannot reach the original", () => {
    const copy = cloneManifest(manifest);
    copy.assets.floor![0]!.url = "https://cdn.example/floor.webp";
    expect(manifest.assets.floor![0]!.url).toBe("floor/0.webp");
  });

  // The regression this exists for: a manifest read through TanStack Query is
  // wrapped in Vue's reactive proxy, which structuredClone refuses outright.
  it("survives a manifest wrapped in Vue's reactive proxy", () => {
    const proxied = reactive(structuredClone(manifest)) as TilePackManifest;
    expect(() => structuredClone(proxied)).toThrow();
    expect(cloneManifest(proxied).assets.floor![0]!.url).toBe("floor/0.webp");
  });
});
