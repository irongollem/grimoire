import { describe, expect, it } from "vitest";
import { framePairs } from "./frames";
import type { LibraryNookPart } from "@/types/bookNook.types";

const frame = (id: string, name: string, shape: "tall" | "wide", image_url: string | null): LibraryNookPart =>
  ({ id, kind: "frame", group_key: "frames", name, preset: { shape }, image_url, sort_order: 1, source: "grimoire-book-nook", created_at: "", updated_at: "" }) as LibraryNookPart;

describe("framePairs", () => {
  // Bug: each shape listed as its own choice, so a DM could pick the tall arch and get no frame on the TV.
  it("offers one choice per style with both shapes", () => {
    const pairs = framePairs([frame("frame-arch-tall", "Arch (tall)", "tall", "t.webp"), frame("frame-arch-wide", "Arch (wide)", "wide", "w.webp")]);
    expect(pairs).toEqual([{ style: "frame-arch", name: "Arch", tall: "t.webp", wide: "w.webp" }]);
  });

  // Bug: a frame still being painted offered as a choice that draws nothing.
  it("leaves out a shape with no picture yet", () => {
    expect(framePairs([frame("frame-cameo-tall", "Cameo (tall)", "tall", null)])).toEqual([]);
  });
});
