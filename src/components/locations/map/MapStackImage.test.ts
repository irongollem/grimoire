import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MapStackImage from "./MapStackImage.vue";
import type { MapStack } from "@/lib/locations/mapStack";

function stackOf(over: Partial<MapStack>): MapStack {
  return {
    picture: null,
    drawing: null,
    primary: null,
    frameCalibration: null,
    blank: null,
    hasAnyLayer: false,
    ...over,
  };
}

/** happy-dom's HTMLImageElement doesn't derive naturalWidth/Height from a
 *  `src` the way a real browser would, so a `load` test sets them by hand
 *  before firing the event — the same trick any DOM-measurement test needs. */
function setNatural(img: Element, w: number, h: number) {
  Object.defineProperty(img, "naturalWidth", { value: w, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: h, configurable: true });
}

describe("MapStackImage", () => {
  it("renders nothing for a stack with no layer at all", () => {
    const wrapper = mount(MapStackImage, { props: { stack: stackOf({}) } });
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.find("div").exists()).toBe(false);
  });

  it("emits measured immediately with cols*cellPx for a blank grid", () => {
    const stack = stackOf({
      blank: { cols: 10, rows: 6, cellPx: 64 },
      hasAnyLayer: true,
    });
    const wrapper = mount(MapStackImage, { props: { stack } });
    expect(wrapper.emitted("measured")).toEqual([[640, 384]]);
    // The ground is an SVG with an intrinsic ratio: attributes, not a style.
    const ground = wrapper.find("svg");
    expect(ground.element.tagName.toLowerCase()).toBe("svg");
    expect(ground.attributes("width")).toBe("640");
    expect(ground.attributes("height")).toBe("384");
    expect(ground.attributes("viewBox")).toBe("0 0 640 384");
  });

  it("places the picture under the drawing with a % style from placePicture once both are measured", async () => {
    const stack = stackOf({
      picture: { kind: "picture", url: "/picture.webp", calibration: { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 } },
      drawing: { kind: "drawing", url: "/drawing.webp", calibration: { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 } },
      primary: { kind: "drawing", url: "/drawing.webp", calibration: { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 } },
      hasAnyLayer: true,
    });
    const wrapper = mount(MapStackImage, { props: { stack } });

    const imgs = wrapper.findAll("img");
    expect(imgs).toHaveLength(2);
    const pictureImg = imgs.find((i) => i.attributes("src") === "/picture.webp")!;
    const drawingImg = imgs.find((i) => i.attributes("src") === "/drawing.webp")!;

    // Before both natural sizes are known, the picture covers the whole box.
    expect(pictureImg.attributes("style")).toContain("width: 100%");
    // Paint order: the Picture is absolutely positioned, so the Drawing must
    // be positioned too or it paints beneath the Picture it should show
    // through to (found in the wave-1 visual pass).
    expect(wrapper.find('img[alt="Location map"]').classes()).toContain("relative");

    setNatural(drawingImg.element as HTMLImageElement, 1000, 1000);
    await drawingImg.trigger("load");
    setNatural(pictureImg.element as HTMLImageElement, 1000, 1000);
    await pictureImg.trigger("load");

    // Same calibration on both ends, same natural size → the picture exactly
    // fills the drawing's box: a 0/0/100%/100% placement, but now COMPUTED
    // via placePicture rather than the pre-measurement fallback.
    const style = pictureImg.attributes("style")!;
    expect(style).toContain("left: 0%");
    expect(style).toContain("top: 0%");
    expect(style).toContain("width: 100%");
    expect(style).toContain("height: 100%");
    expect(wrapper.emitted("measured")).toEqual([[1000, 1000]]);
  });

  it("keeps the primary's box in flow (visibility, not display) when hidden", () => {
    const stack = stackOf({
      picture: { kind: "picture", url: "/picture.webp", calibration: null },
      primary: { kind: "picture", url: "/picture.webp", calibration: null },
      hasAnyLayer: true,
    });
    const wrapper = mount(MapStackImage, {
      props: { stack, visible: { picture: false, drawing: true } },
    });
    const img = wrapper.find("img");
    expect(img.exists()).toBe(true);
    expect(img.attributes("style")).toContain("visibility: hidden");
    // Still present with its sizing classes — display is never set to none.
    expect(img.attributes("style")).not.toContain("display: none");
    expect(img.classes()).toContain("block");
  });

  it("emits failed when the primary image errors, and nothing for a blank grid's own load", async () => {
    const stack = stackOf({
      picture: { kind: "picture", url: "/broken.webp", calibration: null },
      primary: { kind: "picture", url: "/broken.webp", calibration: null },
      hasAnyLayer: true,
    });
    const wrapper = mount(MapStackImage, { props: { stack } });
    await wrapper.find("img").trigger("error");
    expect(wrapper.emitted("failed")).toHaveLength(1);
  });
});
