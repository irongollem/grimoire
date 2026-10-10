import { config, mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import FocalPointPicker from "./FocalPointPicker.vue";

// The AI chip reads provenance through TanStack Query; these tests mount without a query client.
config.global.stubs = { ...config.global.stubs, AiImageBadge: true };

/** A 200 x 300 image (2:3, like library art) drawn at (10, 20) on the page. */
function stubImageRect(img: Element) {
  img.getBoundingClientRect = () =>
    ({ left: 10, top: 20, width: 200, height: 300, right: 210, bottom: 320, x: 10, y: 20, toJSON: () => ({}) }) as DOMRect;
}

describe("FocalPointPicker", () => {
  it("stores the click as a percentage of the picture itself, so FocalImage reads it back unchanged", async () => {
    const wrapper = mount(FocalPointPicker, { props: { src: "a.webp", modelValue: null } });
    stubImageRect(wrapper.get("img").element);
    await wrapper.get(".cursor-crosshair").trigger("click", { clientX: 10 + 100, clientY: 20 + 30 });
    // 100/200 across and 30/300 down: x 50%, y 10%. The old 3:4 cover box stored y 10% for a
    // point that was really 14% down a 2:3 picture.
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([{ x: 50, y: 10 }]);
  });

  it("clamps a click on the very edge into 0-100", async () => {
    const wrapper = mount(FocalPointPicker, { props: { src: "a.webp", modelValue: null } });
    stubImageRect(wrapper.get("img").element);
    await wrapper.get(".cursor-crosshair").trigger("click", { clientX: 5, clientY: 400 });
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([{ x: 0, y: 100 }]);
  });

  it("shows the whole picture at its own shape, not cropped into a fixed box", () => {
    const wrapper = mount(FocalPointPicker, { props: { src: "a.webp", modelValue: null, imageClass: "max-h-[70vh]" } });
    const img = wrapper.get("img");
    expect(img.classes()).not.toContain("object-cover");
    expect(img.classes()).toContain("h-auto");
    expect(img.classes()).toContain("max-h-[70vh]");
  });

  it("offers Clear only when the caller allows it", () => {
    const point = { x: 40, y: 20 };
    expect(mount(FocalPointPicker, { props: { src: "a.webp", modelValue: point } }).text()).toContain("Clear");
    expect(mount(FocalPointPicker, { props: { src: "a.webp", modelValue: point, clearable: false } }).text()).not.toContain("Clear");
  });
});
