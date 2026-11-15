// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";

vi.mock("@vueuse/core", async (original) => ({ ...(await original<typeof import("@vueuse/core")>()), useElementSize: () => ({ width: ref(832), height: ref(632) }) }));

import StudioStage from "./StudioStage.vue";
import PathOverlay from "./PathOverlay.vue";
import { addCutout, newScene } from "@/lib/bookNook/edit";
import type { Motion } from "@/lib/bookNook/scene";

const room = newScene({ id: "n", title: "N", room: { url: "r", width: 2400, height: 1350 } });
const first = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
const second = [{ x: 0, y: 0 }, { x: 99, y: 99 }];
const motions: Motion[] = [
  { kind: "spin", period: 4 },
  { kind: "path", points: first, period: 4 },
  { kind: "path", points: second, period: 4, closed: false },
];
const base = addCutout(room, { id: "apple-abc123", src: "a", width: 100, height: 100 }, { x: 1200, y: 600 });
const scene = { ...base, stack: base.stack.map((i) => (i.kind === "layer" && i.id === "apple-abc123" ? { ...i, motions } : i)) };

function stage(drawing: { id: string; index: number } | null) {
  return mount(StudioStage, {
    props: {
      scene, images: new Map<string, HTMLImageElement>(), aspects: new Map([["apple-abc123", 1]]), ready: false, screen: "tv", t: 0,
      selection: { kind: "layer", id: "apple-abc123" }, hidden: new Set<string>(), drawing,
    },
  });
}

describe("StudioStage, which path is edited", () => {
  it("shows the first path of a part with two, and the spin is no path", () => {
    // Bug: the overlay takes motion 0 (the spin) or none at all, so a travelling part shows no path.
    const o = stage(null).findComponent(PathOverlay);
    expect(o.props("points")).toEqual(first);
    expect(o.props("drawing")).toBe(false);
  });

  it("edits the path being drawn, and writes the change to that motion's place", () => {
    // Bug: drawing the second path edits the first, because the stage always picks the first one.
    const w = stage({ id: "apple-abc123", index: 2 });
    const o = w.findComponent(PathOverlay);
    expect(o.props("points")).toEqual(second);
    expect(o.props("closed")).toBe(false);
    expect(o.props("drawing")).toBe(true);
    o.vm.$emit("points", [{ x: 5, y: 5 }]);
    expect(w.emitted("op")?.[0]).toEqual([{ op: "pathPoints", id: "apple-abc123", index: 2, points: [{ x: 5, y: 5 }] }]);
  });

  it("falls back to the first path when the drawn motion is not a path, or belongs to another part", () => {
    // Bug: a stale drawing state (the spin's place, another cut-out) points the overlay at a motion that is not a path.
    expect(stage({ id: "apple-abc123", index: 0 }).findComponent(PathOverlay).props("points")).toEqual(first);
    const other = stage({ id: "someone-else", index: 2 }).findComponent(PathOverlay);
    expect(other.props("points")).toEqual(first);
    expect(other.props("drawing")).toBe(false);
  });
});
