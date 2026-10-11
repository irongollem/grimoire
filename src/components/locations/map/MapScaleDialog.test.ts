import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MapScaleDialog from "./MapScaleDialog.vue";
import type { MapScale } from "@/types/location.types";

const EXISTING: MapScale = { unit: "km", distance: 40, a: { x: 0.2, y: 0.2 }, b: { x: 0.8, y: 0.6 } };

function mountDialog(props: { existing?: MapScale | null; saving?: boolean } = {}) {
  return mount(MapScaleDialog, {
    props: { open: true, mapUrl: "https://example.test/map.webp", ...props },
    global: { stubs: { AppModal: { template: "<div><slot /></div>" }, ModalHeader: true } },
  });
}

const button = (wrapper: ReturnType<typeof mountDialog>, label: string) =>
  wrapper.findAll("button").find((b) => b.text() === label);

describe("MapScaleDialog", () => {
  it("cannot save until a distance is typed", async () => {
    const wrapper = mountDialog();
    expect(button(wrapper, "Save Scale")!.attributes("disabled")).toBeDefined();
    await wrapper.find("input[type=number]").setValue("120");
    expect(button(wrapper, "Save Scale")!.attributes("disabled")).toBeUndefined();
  });

  it("saves the two points, the distance and the chosen unit", async () => {
    const wrapper = mountDialog();
    await wrapper.find("input[type=number]").setValue("120");
    await button(wrapper, "Kilometres")!.trigger("click");
    await button(wrapper, "Save Scale")!.trigger("click");
    expect(wrapper.emitted("save")).toEqual([
      [{ unit: "km", distance: 120, a: { x: 0.3, y: 0.5 }, b: { x: 0.7, y: 0.5 } }],
    ]);
  });

  it("opens on the saved scale, and offers Clear only when there is one", async () => {
    const wrapper = mountDialog({ existing: EXISTING });
    expect((wrapper.find("input[type=number]").element as HTMLInputElement).value).toBe("40");
    await button(wrapper, "Clear scale")!.trigger("click");
    expect(wrapper.emitted("clear")).toHaveLength(1);
    expect(button(mountDialog(), "Clear scale")).toBeUndefined();
  });

  it("holds the buttons while the caller's write is in flight", () => {
    const wrapper = mountDialog({ existing: EXISTING, saving: true });
    expect(button(wrapper, "Saving…")!.attributes("disabled")).toBeDefined();
    expect(button(wrapper, "Clear scale")!.attributes("disabled")).toBeDefined();
  });
});
