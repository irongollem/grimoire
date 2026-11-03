// The stack picks which standing image to show (#1073): the one without the swaying props only while the top live
// layer animates AND has said every sprite is loaded; otherwise the full one, so no prop is ever missing.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import type { Viewer } from "@/lib/battlemap/vision";
import type { MapLive } from "@/types/mapLive.types";
import type { BattleMapLayers } from "@/lib/battlemap/roomBridge";

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("@/lib/motion", () => ({ prefersReducedMotion: () => motion.reduced }));

// The DM device's OPFS: a key holds a moving file or does not.
const device = vi.hoisted(() => ({ files: new Map<string, File>() }));
vi.mock("@/lib/mapImport/localMedia", () => ({
  getLocalMap: (key: string) => Promise.resolve(device.files.get(key) ?? null),
  saveLocalMap: (key: string, file: File) => {
    device.files.set(key, file);
    return Promise.resolve(true);
  },
}));

import BattleMapStack from "./BattleMapStack.vue";
import BattleMapVeil from "./BattleMapVeil.vue";

const LiveLayerStub = defineComponent({
  props: { stratum: { type: String, required: true }, doorStates: { type: Array, default: () => [] } },
  emits: ["ready"],
  template: `<div class="live-stub" :data-stratum="stratum" />`,
});

const sprite = { url: "https://cdn/tree.webp", x: 1, y: 1, w: 1, h: 1, rotation: 0, sway: { amount: 3, speed: 1, phase: 0 } };
const live = (sprites: MapLive["sprites"]): MapLive => ({ version: 3, darkness: "daylight", groups: [], lights: [], sprites, walls: [], doors: [], solid: [] });

function mountStack(over: { picture?: BattleMapLayers["picture"]; motion?: BattleMapLayers["motion"]; imageUrl?: string; live?: MapLive | null; standLiveUrl?: string | null; viewers?: Viewer[] | null; zones?: { x: number; y: number; radius: number }[]; doorStates?: { id: string; open: boolean }[] } = {}) {
  const { live: liveOver, standLiveUrl, picture = null, motion: motionOver = null, imageUrl = "ground.webp", ...rest } = over;
  return mount(BattleMapStack, {
    props: {
      hostW: 400,
      hostH: 300,
      layers: {
        imageUrl,
        picture,
        motion: motionOver,
        standUrl: "stand.webp",
        standLiveUrl: standLiveUrl === undefined ? "stand-live.webp" : standLiveUrl,
        live: liveOver === undefined ? live([sprite]) : liveOver,
      },
      panX: 0,
      panY: 0,
      imageW: 400,
      imageH: 300,
      showGrid: false,
      gridVerticals: [],
      gridHorizontals: [],
      gridStrokeOpacity: 0.2,
      cellPx: 50,
      originX: 0,
      originY: 0,
      ...rest,
    },
    global: { stubs: { BattleMapLiveLayer: LiveLayerStub } },
  });
}

const standHref = (w: ReturnType<typeof mountStack>): string | undefined =>
  w.findAll("image").map((i) => i.attributes("href")).find((h) => h?.startsWith("stand"));
const topLayer = (w: ReturnType<typeof mountStack>) => w.findAllComponents(LiveLayerStub).find((c) => c.props("stratum") === "top");

describe("BattleMapStack standing image", () => {
  beforeEach(() => {
    motion.reduced = false;
  });

  it("shows the full standing image until the top layer says its sprites are ready", async () => {
    const w = mountStack();
    expect(standHref(w)).toBe("stand.webp");
    topLayer(w)!.vm.$emit("ready");
    await nextTick();
    expect(standHref(w)).toBe("stand-live.webp");
  });

  it("falls back to the full image when a new snapshot arrives, until it is ready", async () => {
    const w = mountStack();
    topLayer(w)!.vm.$emit("ready");
    await nextTick();
    await w.setProps({ layers: { ...w.props("layers"), live: live([{ ...sprite, url: "https://cdn/other.webp" }]) } });
    expect(standHref(w)).toBe("stand.webp");
  });

  it("mounts the top layer and swaps once ready under reduced motion too, as it draws one still frame", async () => {
    motion.reduced = true;
    const w = mountStack();
    expect(topLayer(w)).toBeDefined();
    topLayer(w)!.vm.$emit("ready");
    await nextTick();
    expect(standHref(w)).toBe("stand-live.webp");
  });

  it("swaps for a map with door leaves and no sprites, and hands the layer the door states", async () => {
    const leaf = { url: "https://cdn/door.webp", hingeX: 0, hingeY: 0.5, openDegrees: 90 };
    const doorLive: MapLive = { ...live([]), doors: [{ id: "2,2:N", a: [2, 2], b: [3, 2], open: false, leaf }] };
    const doorStates = [{ id: "2,2:N", open: true }];
    const w = mountStack({ live: doorLive, doorStates });
    expect(topLayer(w)!.props("doorStates")).toEqual(doorStates);
    topLayer(w)!.vm.$emit("ready");
    await nextTick();
    expect(standHref(w)).toBe("stand-live.webp");
  });

  it("keeps a leafless door baked in: no top layer for a door whose leaf has no url", () => {
    const doorLive: MapLive = { ...live([]), doors: [{ id: "2,2:N", a: [2, 2], b: [3, 2], open: false, leaf: null }] };
    expect(topLayer(mountStack({ live: doorLive }))).toBeUndefined();
  });

  it("keeps the full image with no stand-live picture or no sprites", () => {
    expect(topLayer(mountStack({ standLiveUrl: null }))).toBeUndefined();
    expect(topLayer(mountStack({ live: live([]) }))).toBeUndefined();
  });
  it("mounts the darkness veil last for a dim or dark map, even under reduced motion", () => {
    motion.reduced = true;
    const w = mountStack({ live: { ...live([]), darkness: "dark" } });
    expect(w.findComponent(BattleMapVeil).exists()).toBe(true);
    expect(w.html().indexOf("veil")).toBeGreaterThan(w.html().indexOf("<svg"));
  });

  it("hands the veil the player's viewers and the pictures to show in grey", () => {
    const viewers = [{ x: 2.5, y: 2.5, darkvisionFeet: 60, blindsightFeet: 0, truesightFeet: 0, devilsSightFeet: 0 }];
    const veil = mountStack({ live: { ...live([]), darkness: "dark" }, viewers }).findComponent(BattleMapVeil);
    expect(veil.props("viewers")).toEqual(viewers);
    expect(veil.props("groundUrl")).toBe("ground.webp");
    expect(veil.props("standUrl")).toBe("stand.webp");
    expect(mountStack({ live: { ...live([]), darkness: "dark" } }).findComponent(BattleMapVeil).props("viewers")).toBeNull();
  });

  it("mounts the veil on a daylight map when there is a sphere of magical darkness", () => {
    const w = mountStack({ zones: [{ x: 2, y: 2, radius: 15 }] });
    expect(w.findComponent(BattleMapVeil).exists()).toBe(true);
    expect(w.findComponent(BattleMapVeil).props("zones")).toEqual([{ x: 2, y: 2, radius: 15 }]);
  });

  it("mounts no veil in daylight or without a snapshot", () => {
    expect(mountStack().findComponent(BattleMapVeil).exists()).toBe(false);
    expect(mountStack({ live: null }).findComponent(BattleMapVeil).exists()).toBe(false);
  });
});


// The Picture under the Drawing, and a moving Picture (#1125 decisions 6 and 8).
const cal = (cells: number) => ({ cells_per_image_width: cells, origin_x_pct: 0, origin_y_pct: 0, origin_cell_x: 0, origin_cell_y: 0 });
const pictureUnder = { url: "picture.webp", calibration: cal(5), drawingCalibration: cal(10) };
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await nextTick();
};

class FakeImage {
  naturalWidth = 100;
  naturalHeight = 100;
  onload: (() => void) | null = null;
  set src(_: string) {
    queueMicrotask(() => this.onload?.());
  }
}

describe("BattleMapStack picture and motion", () => {
  beforeEach(() => {
    motion.reduced = false;
    device.files.clear();
    vi.stubGlobal("Image", FakeImage);
    URL.createObjectURL = () => "blob:movie";
    URL.revokeObjectURL = () => undefined;
  });

  it("draws the Picture beneath the Drawing in the box its calibration covers (5 of 10 cells wide = half the width)", async () => {
    // Drawing box 400x300 at the origin; a square 100px picture of 5 cells against a 10-cell drawing.
    const w = mountStack({ picture: pictureUnder });
    await flush();
    const images = w.findAll("svg image");
    const hrefs = images.map((i) => i.attributes("href"));
    expect(hrefs.indexOf("picture.webp")).toBeLessThan(hrefs.indexOf("ground.webp"));
    const pic = images[hrefs.indexOf("picture.webp")]!;
    expect(Number(pic.attributes("width"))).toBeCloseTo(200); // half of 400
    expect(Number(pic.attributes("height"))).toBeCloseTo(200); // 5 cells * (400/10 px) square cells
  });

  it("draws no Picture layer when there is none under the Drawing", async () => {
    const w = mountStack();
    await flush();
    expect(w.findAll("svg image").map((i) => i.attributes("href"))).toEqual(["ground.webp", "stand.webp"]);
  });

  const moving = { key: "loc-1", kind: "video" as const, still: "ground.webp", fileName: "river.mp4", bytes: 4 };

  it("plays the device's file instead of the still when this device has it", async () => {
    device.files.set("loc-1", new File(["abcd"], "river.mp4"));
    const w = mountStack({ motion: moving });
    await flush();
    expect(w.find("video").attributes("src")).toBe("blob:movie");
    expect(w.findAll("svg image").map((i) => i.attributes("href"))).not.toContain("ground.webp");
    expect(w.find("[data-testid=map-motion-missing]").exists()).toBe(false);
  });

  it("plays an animated image in an img element", async () => {
    device.files.set("loc-1", new File(["abcd"], "river.gif"));
    const w = mountStack({ motion: { ...moving, kind: "animated" } });
    await flush();
    expect(w.find("video").exists()).toBe(false);
    expect(w.find("img[data-testid=map-motion]").attributes("src")).toBe("blob:movie");
  });

  it("shows the still under reduced motion", async () => {
    motion.reduced = true;
    device.files.set("loc-1", new File(["abcd"], "river.mp4"));
    const w = mountStack({ motion: moving });
    await flush();
    expect(w.find("video").exists()).toBe(false);
    expect(w.findAll("svg image").map((i) => i.attributes("href"))).toContain("ground.webp");
  });

  it("shows the still and offers the file when this device does not have it", async () => {
    const w = mountStack({ motion: moving });
    await flush();
    expect(w.find("video").exists()).toBe(false);
    expect(w.findAll("svg image").map((i) => i.attributes("href"))).toContain("ground.webp");
    expect(w.get("[data-testid=map-motion-missing]").text()).toContain("this device doesn't have the file");
  });

  it("offers nothing on a surface with no moving Picture (a player's)", async () => {
    const w = mountStack();
    await flush();
    expect(w.find("[data-testid=map-motion-missing]").exists()).toBe(false);
  });

  it("plays beneath the Drawing, in the Picture's placed box, and keeps the Drawing", async () => {
    device.files.set("loc-1", new File(["abcd"], "river.mp4"));
    const w = mountStack({ picture: pictureUnder, motion: { ...moving, still: "picture.webp" } });
    await flush();
    const video = w.get("video");
    expect(video.attributes("style")).toContain("width: 200px");
    expect(w.findAll("svg image").map((i) => i.attributes("href"))).toEqual(["ground.webp", "stand.webp"]);
  });
});
