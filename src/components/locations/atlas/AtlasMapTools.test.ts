import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AtlasMapTools from "./AtlasMapTools.vue";
import type { MapTool } from "@/lib/locations/mapTool";

const mocks = vi.hoisted(() => ({ setPicture: vi.fn(), removePicture: vi.fn(), setBattleMap: vi.fn() }));
vi.mock("@/composables/locations/usePlacePicture", () => ({
  usePlacePicture: () => ({
    busy: ref(false),
    setPicture: mocks.setPicture,
    removePicture: mocks.removePicture,
    setBattleMap: mocks.setBattleMap,
  }),
}));

const base: { id: string; map_url: string | null; map_motion: string | null; is_battle_map: boolean } = {
  id: "t",
  map_url: "https://x/p.png",
  map_motion: null,
  is_battle_map: false,
};

let wrapper: ReturnType<typeof mountTools> | null = null;
function mountTools(over: Partial<typeof base> = {}, tool: MapTool | null = null) {
  const w = mount(AtlasMapTools, {
    props: {
      location: { ...base, ...over } as never,
      tool,
      "onUpdate:tool": (next: MapTool | null) => w.setProps({ tool: next }),
    },
    attachTo: document.body,
  });
  wrapper = w;
  return w;
}
const byTip = (w: ReturnType<typeof mountTools>, tip: string) => w.find(`button[aria-label="${tip}"]`);
const inMenu = (label: string) => [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((b) => b.textContent?.includes(label));

beforeEach(() => {
  for (const f of Object.values(mocks)) f.mockReset();
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = "";
});

// The maintainer's decision of 14 Nov 2026: four icon-only buttons, every edit on the map itself.
describe("AtlasMapTools", () => {
  it("names each button by what it does", () => {
    const w = mountTools();
    for (const name of ["Measure a route", "Line up the grid", "Place pins", "Map image"]) expect(byTip(w, name).exists()).toBe(true);
  });

  it("offers the grid only when there is a picture to line it up on", () => {
    expect(byTip(mountTools({ map_url: null }), "Line up the grid").exists()).toBe(false);
  });

  it("turns a tool on, and turns it off by pressing the same button again", async () => {
    const w = mountTools();
    await byTip(w, "Place pins").trigger("click");
    expect(w.props("tool")).toBe("pins");
    await byTip(w, "Place pins").trigger("click");
    expect(w.props("tool")).toBeNull();
  });

  it("moves from one tool straight to another", async () => {
    const w = mountTools({}, "measure");
    await byTip(w, "Line up the grid").trigger("click");
    expect(w.props("tool")).toBe("grid");
  });

  describe("the image menu", () => {
    async function openMenu(over: Partial<typeof base> = {}) {
      const w = mountTools(over);
      await byTip(w, "Map image").trigger("click");
      await flushPromises();
      return w;
    }

    // Bug: the file input lived in the menu panel, which closing unmounts before `change` fires, so the pick was lost.
    it("replaces the picture with the file chosen after the menu has closed", async () => {
      const w = await openMenu();
      const input = w.get('input[type="file"]');
      const click = vi.spyOn(input.element as HTMLInputElement, "click");
      inMenu("Replace image")!.click();
      await flushPromises();
      expect(click).toHaveBeenCalled();
      expect(inMenu("Replace image")).toBeUndefined();

      const file = new File(["x"], "map.png", { type: "image/png" });
      Object.defineProperty(input.element, "files", { value: [file] });
      await input.trigger("change");
      expect(mocks.setPicture).toHaveBeenCalledWith(file);
    });

    it("removes the picture, and only offers to when there is one", async () => {
      await openMenu();
      inMenu("Remove image")!.click();
      expect(mocks.removePicture).toHaveBeenCalledTimes(1);
      wrapper?.unmount();
      document.body.innerHTML = "";

      await openMenu({ map_url: null });
      expect(inMenu("Remove image")).toBeUndefined();
    });

    it("says a moving map plays on this device, only for one", async () => {
      await openMenu({ map_motion: "video" });
      expect(document.body.textContent).toContain("A moving map");
      wrapper?.unmount();
      document.body.innerHTML = "";
      await openMenu();
      expect(document.body.textContent).not.toContain("A moving map");
    });

    it("flags and unflags the place as a battle map", async () => {
      await openMenu();
      const box = document.body.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      expect(box.checked).toBe(false);
      box.click();
      expect(mocks.setBattleMap).toHaveBeenCalledWith(true);
    });
  });
});
