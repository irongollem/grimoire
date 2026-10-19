import { describe, it, expect } from "vitest";
import { doorLeafArt } from "./doorLeaf";
import { DEFAULT_DOOR_LEAF } from "./packSchema";
import { makeRuntime } from "./testCanvas";
import type { EdgeSeg } from "@/types/dungeonMap.types";

const seg = (type: EdgeSeg["type"], variant = 0): EdgeSeg => ({ pack_id: "p", pack_version: 1, variant, type });
const ASSETS = { doorLeaf: [{ variant: 0, url: "https://cdn/leaf-0.webp" }] };

describe("doorLeafArt", () => {
  it("returns the slot's url with the pack's hinge", () => {
    const hinge = { hingeX: 0.5, hingeY: 0.25, openDegrees: 60 };
    const rt = makeRuntime("p", { assets: ASSETS, doorLeaf: hinge });
    expect(doorLeafArt(seg("doorClosed"), rt)).toEqual({ url: "https://cdn/leaf-0.webp", ...hinge });
    expect(doorLeafArt(seg("doorOpen"), rt)).toEqual({ url: "https://cdn/leaf-0.webp", ...hinge });
  });

  it("falls back to the schema's default hinge", () => {
    expect(doorLeafArt(seg("doorClosed"), makeRuntime("p", { assets: ASSETS }))).toEqual({
      url: "https://cdn/leaf-0.webp",
      ...DEFAULT_DOOR_LEAF,
    });
  });

  it("is null when the variant has no slot url, or the slot is for a side", () => {
    const rt = makeRuntime("p", { assets: ASSETS });
    expect(doorLeafArt(seg("doorClosed", 1), rt)).toBeNull();
    const sided = makeRuntime("p", { assets: { doorLeaf: [{ variant: 0, side: "N", url: "https://cdn/n.webp" }] } });
    expect(doorLeafArt(seg("doorClosed"), sided)).toBeNull();
    expect(doorLeafArt(seg("doorClosed"), makeRuntime("p"))).toBeNull();
  });

  it("is null for a pack whose urls do not last, and for a missing pack", () => {
    expect(doorLeafArt(seg("doorClosed"), makeRuntime("p", { assets: ASSETS, lastingUrls: false }))).toBeNull();
    expect(doorLeafArt(seg("doorClosed"), null)).toBeNull();
  });

  it("is null for anything that is not a door", () => {
    const rt = makeRuntime("p", { assets: ASSETS });
    for (const type of ["wall", "grate", "sluice"] as const) expect(doorLeafArt(seg(type), rt)).toBeNull();
  });
});
