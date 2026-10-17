// The stack picks which standing image to show (#1073): the one without the swaying props only while the top live
// layer animates AND has said every sprite is loaded; otherwise the full one, so no prop is ever missing.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import type { Viewer } from "@/lib/battlemap/vision";
import type { MapLive } from "@/types/mapLive.types";

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("@/lib/motion", () => ({ prefersReducedMotion: () => motion.reduced }));

import BattleMapStack from "./BattleMapStack.vue";
import BattleMapVeil from "./BattleMapVeil.vue";

const LiveLayerStub = defineComponent({
  props: { stratum: { type: String, required: true } },
  emits: ["ready"],
  template: `<div class="live-stub" :data-stratum="stratum" />`,
});

const sprite = { url: "https://cdn/tree.webp", x: 1, y: 1, w: 1, h: 1, rotation: 0, sway: { amount: 3, speed: 1, phase: 0 } };
const live = (sprites: MapLive["sprites"]): MapLive => ({ version: 1, darkness: "daylight", groups: [], lights: [], sprites });

function mountStack(over: { live?: MapLive | null; standLiveUrl?: string | null; viewers?: Viewer[] | null } = {}) {
  return mount(BattleMapStack, {
    props: {
      hostW: 400,
      hostH: 300,
      imageUrl: "ground.webp",
      standUrl: "stand.webp",
      standLiveUrl: "stand-live.webp",
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
      live: live([sprite]),
      ...over,
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
    await w.setProps({ live: live([{ ...sprite, url: "https://cdn/other.webp" }]) });
    expect(standHref(w)).toBe("stand.webp");
  });

  it("never mounts the top layer, and keeps the full image, under reduced motion", () => {
    motion.reduced = true;
    const w = mountStack();
    expect(topLayer(w)).toBeUndefined();
    expect(standHref(w)).toBe("stand.webp");
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
    const viewers = [{ x: 2.5, y: 2.5, darkvisionFeet: 60 }];
    const veil = mountStack({ live: { ...live([]), darkness: "dark" }, viewers }).findComponent(BattleMapVeil);
    expect(veil.props("viewers")).toEqual(viewers);
    expect(veil.props("groundUrl")).toBe("ground.webp");
    expect(veil.props("standUrl")).toBe("stand.webp");
    expect(mountStack({ live: { ...live([]), darkness: "dark" } }).findComponent(BattleMapVeil).props("viewers")).toBeNull();
  });

  it("mounts no veil in daylight or without a snapshot", () => {
    expect(mountStack().findComponent(BattleMapVeil).exists()).toBe(false);
    expect(mountStack({ live: null }).findComponent(BattleMapVeil).exists()).toBe(false);
  });
});
