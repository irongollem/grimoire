// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type Ref } from "vue";
import { newScene, addCutout } from "@/lib/bookNook/edit";
import type { Scene } from "@/lib/bookNook/scene";
import { useNookImages } from "./useNookImages";

const made: FakeImage[] = [];
class FakeImage {
  crossOrigin = "";
  naturalWidth = 400;
  naturalHeight = 200;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = "";
  constructor() { made.push(this); }
  get src() { return this._src; }
  set src(v: string) { this._src = v; queueMicrotask(() => (v.includes("bad") ? this.onerror?.() : this.onload?.())); }
}

const base = newScene({ id: "n", title: "N", room: { url: "room.webp", width: 2400, height: 1350 } });

function mountImages(scene: Ref<Scene>) {
  let out!: ReturnType<typeof useNookImages>;
  createApp(defineComponent({ setup() { out = useNookImages(scene); return () => h("div"); } })).mount(document.createElement("div"));
  return out;
}

beforeEach(() => {
  made.length = 0;
  vi.stubGlobal("Image", FakeImage);
  // jsdom has no canvas: the alpha read finds no context and leaves the layer out of `cut`.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useNookImages", () => {
  it("loads each layer once and not again when the scene is only moved about", async () => {
    // Bug: reloading every image on each drag step makes the stage flash and re-reads alpha 60 times a second.
    const scene = ref<Scene>(base);
    const nook = mountImages(scene);
    await vi.waitFor(() => expect(nook.ready.value).toBe(true));
    expect(made).toHaveLength(1);
    expect(made[0].crossOrigin).toBe("anonymous");
    scene.value = { ...scene.value, loop: 16 };
    await nextTick();
    expect(made).toHaveLength(1);
  });

  it("loads a layer added later and gives its height over width", async () => {
    const scene = ref<Scene>(base);
    const nook = mountImages(scene);
    await vi.waitFor(() => expect(nook.ready.value).toBe(true));
    scene.value = addCutout(scene.value, { id: "chair", src: "chair.webp", width: 400, height: 200 }, { x: 1, y: 1 });
    await vi.waitFor(() => expect(nook.aspects.value.get("chair")).toBe(0.5));
  });

  it("names a source that failed rather than leaving the stage to throw on a missing image", async () => {
    const scene = ref<Scene>(addCutout(base, { id: "ghost", src: "bad.webp", width: 4, height: 4 }, { x: 1, y: 1 }));
    const nook = mountImages(scene);
    await vi.waitFor(() => expect(nook.failed.value).toEqual(["bad.webp"]));
    expect(nook.ready.value).toBe(false);
  });
});
