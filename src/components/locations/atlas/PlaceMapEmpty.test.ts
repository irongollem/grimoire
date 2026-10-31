import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useMapImportStore } from "@/stores/mapImport";
import AppButton from "@/components/common/controls/AppButton.vue";
import PlaceMapEmpty from "./PlaceMapEmpty.vue";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  openDrawing: vi.fn(),
  update: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/composables/locations/useOpenSiteDrawing", () => ({ useOpenSiteDrawing: () => ({ openDrawing: mocks.openDrawing }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useUpdateLocation: () => ({ mutateAsync: mocks.update }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: mocks.toastError, fromError: (e: unknown) => String(e) }) }));

const place = { id: "ash", name: "Ashmouth", source_map_id: null, is_battle_map: false };

function mountCard(isSite: boolean, over: Partial<typeof place> = {}) {
  return mount(PlaceMapEmpty, { props: { location: { ...place, ...over }, isSite } });
}
const press = (w: ReturnType<typeof mountCard>, label: string) =>
  w.findAllComponents(AppButton).find((b) => b.props("label") === label)!.vm.$emit("click");

beforeEach(() => {
  setActivePinia(createPinia());
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.openDrawing.mockResolvedValue(undefined);
  mocks.update.mockResolvedValue({});
});

// #1125 frame 04: "<Name> has no map." with three ways to start, each into the full-screen editor.
describe("PlaceMapEmpty", () => {
  it("names the place that has no map", () => {
    expect(mountCard(true).text()).toContain("Ashmouth has no map.");
  });

  it("Draw one makes the site's drawing first, then opens the editor on it", async () => {
    const w = mountCard(true);
    press(w, "Draw one");
    await flushPromises();
    expect(mocks.openDrawing).toHaveBeenCalledWith(expect.objectContaining({ id: "ash" }));
    expect(mocks.push).toHaveBeenCalledWith("/locations/ash/map?layer=drawing");
    expect(mocks.openDrawing.mock.invocationCallOrder[0]).toBeLessThan(mocks.push.mock.invocationCallOrder[0]!);
  });

  it("Bring a map takes a file and goes to Bring with this place as where it lives, writing nothing yet", async () => {
    const w = mountCard(true);
    const file = new File(["x"], "ashmouth_30x20.webp", { type: "image/webp" });
    const input = w.get('input[type="file"]');
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    expect(mocks.push).toHaveBeenCalledWith("/cartographer/bring");
    expect(useMapImportStore().file).toBe(file);
    expect(useMapImportStore().targetPlaceId).toBe("ash");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.openDrawing).not.toHaveBeenCalled();
  });

  it("Blank grid sets a 30 by 20 plan, then opens the editor on the Plan", async () => {
    const w = mountCard(true);
    press(w, "Blank grid");
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({ id: "ash", update: { plan_size: { cols: 30, rows: 20 } } });
    expect(mocks.push).toHaveBeenCalledWith("/locations/ash/map?layer=plan");
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.push.mock.invocationCallOrder[0]!);
  });

  it("stays on the tab, and says why, when the setup write fails", async () => {
    mocks.update.mockRejectedValue(new Error("denied"));
    const w = mountCard(true);
    press(w, "Blank grid");
    await flushPromises();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });

  it("a dropped file goes to Bring with the place locked as its home, instead of being lost", async () => {
    const w = mountCard(false);
    const file = new File(["x"], "daggerford.png", { type: "image/png" });
    await w.get("section").trigger("drop", { dataTransfer: { files: [file] } });
    expect(mocks.push).toHaveBeenCalledWith("/cartographer/bring");
    expect(useMapImportStore().file).toBe(file);
    expect(useMapImportStore().targetPlaceId).toBe("ash");
  });

  it("choosing nothing in the file dialog does nothing", async () => {
    const w = mountCard(true);
    await w.get('input[type="file"]').trigger("change");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("a drop with no file in it does nothing", async () => {
    const w = mountCard(true);
    await w.get("section").trigger("drop", { dataTransfer: { files: [] } });
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("says a battle map is why the Atlas shows nothing", () => {
    expect(mountCard(false, { is_battle_map: true }).text()).toContain("battle map");
  });
});
