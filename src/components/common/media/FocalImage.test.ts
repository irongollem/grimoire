import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FocalImage from "./FocalImage.vue";
import ImageLightbox from "@/components/common/overlays/ImageLightbox.vue";

// initPlaceholderFocalPoints/getPlaceholderFocalPoint are mocked so the test
// exercises only the URL-parsing trap in resolvePlaceholder(), not the
// smartcrop fallback or the admin DB round-trip.
vi.mock("@/lib/placeholderFocalPoints", () => ({
  initPlaceholderFocalPoints: vi.fn().mockResolvedValue(undefined),
  getPlaceholderFocalPoint: vi.fn(),
}));

import { getPlaceholderFocalPoint } from "@/lib/placeholderFocalPoints";

const mockedGetFp = vi.mocked(getPlaceholderFocalPoint);

describe("FocalImage placeholder entity-type extraction", () => {
  beforeEach(() => {
    mockedGetFp.mockReset();
    mockedGetFp.mockReturnValue({ x: 10, y: 20 });
  });

  // `print: true` is the component's own escape hatch for skipping the
  // IntersectionObserver gate — Card Forge relies on it to resolve focal
  // points inside an off-screen container. Reused here so the placeholder
  // watcher fires immediately instead of waiting on a real viewport.
  it("extracts the entity type from a local placeholder path", async () => {
    mount(FocalImage, {
      props: {
        format: "portrait",
        placeholder: "/assets/placeholders/npc.webp",
        print: true,
      },
    });
    await flushPromises();

    expect(mockedGetFp).toHaveBeenCalledWith("npc");
  });

  // The trap: once art-manifest routing lands, a placeholder URL can be
  // CDN-shaped and content-hashed — e.g.
  // `https://cdn.example.com/app-art/assets/placeholders/npc.a1b2c3d4.webp`.
  // A naive "strip the last extension" parse returns "npc.a1b2c3d4" instead
  // of "npc", which silently stops matching admin-configured focal points.
  it("extracts the entity type from a CDN-shaped, content-hashed placeholder URL", async () => {
    mount(FocalImage, {
      props: {
        format: "portrait",
        placeholder: "https://cdn.example.com/app-art/assets/placeholders/npc.a1b2c3d4.webp",
        print: true,
      },
    });
    await flushPromises();

    expect(mockedGetFp).toHaveBeenCalledWith("npc");
  });
});

// A portrait placeholder in a short, wide frame (a party card) is taller than
// its container, so applyFocalPoint goes clipped and positions it with
// translateY. The placeholder <img> used to keep `h-full object-cover` and
// ignore that, cropping every portrait placeholder to its middle — the torso.
describe("FocalImage placeholder in a frame shorter than the image", () => {
  beforeEach(() => {
    mockedGetFp.mockReset();
    mockedGetFp.mockReturnValue({ x: 50, y: 15 }); // the face, near the top
  });

  it("shifts the placeholder to its focal point instead of cropping the middle", async () => {
    const wrapper = mount(FocalImage, {
      props: { format: "landscape", placeholder: "/assets/placeholders/character.webp", print: true },
      attachTo: document.body,
    });
    const root = wrapper.find("div").element as HTMLElement;
    const img = wrapper.find("img").element as HTMLImageElement;
    // Layout jsdom cannot compute: a 400×100 frame holding a 400×800 portrait.
    Object.defineProperty(root, "offsetHeight", { configurable: true, value: 100 });
    Object.defineProperty(img, "offsetWidth", { configurable: true, value: 400 });
    Object.defineProperty(img, "naturalWidth", { configurable: true, value: 400 });
    Object.defineProperty(img, "naturalHeight", { configurable: true, value: 800 });
    Object.defineProperty(img, "complete", { configurable: true, value: true });

    await flushPromises();
    await wrapper.find("img").trigger("load");

    const rendered = wrapper.find("img");
    // Focal y 15% of 800px = 120px; centred in a 100px frame → shifted up 70px.
    expect(rendered.attributes("style")).toContain("translateY(-70px)");
    expect(rendered.classes()).not.toContain("h-full");
    wrapper.unmount();
  });
});

describe("FocalImage AI badge", () => {
  const stubs = { AiImageBadge: { props: ["src", "corner"], template: '<i class="ai-chip" :data-corner="corner" />' } };

  it("renders no chip unless asked", () => {
    const wrapper = mount(FocalImage, {
      props: { format: "portrait", src: "https://cdn.example.com/a.webp", print: true },
      global: { stubs },
    });
    expect(wrapper.find(".ai-chip").exists()).toBe(false);
    expect(wrapper.get("div").classes()).not.toContain("relative");
  });

  it("puts the chip inside the root, in the requested corner", () => {
    const wrapper = mount(FocalImage, {
      props: { format: "portrait", src: "https://cdn.example.com/a.webp", print: true, aiBadge: "left" },
      global: { stubs },
    });
    const chip = wrapper.get(".ai-chip");
    expect(chip.attributes("data-corner")).toBe("left");
    expect(wrapper.get("div").element.contains(chip.element)).toBe(true);
    expect(wrapper.get("div").classes()).toContain("relative");
  });

  // The clamp must stay on the root: FocalImage detects "clipped" from its own root's
  // height, so a wrapper carrying `max-h-* overflow-hidden` made it ignore the focal point.
  it("keeps a caller's clamp classes on the root element, which stays the clipping frame", () => {
    const wrapper = mount(FocalImage, {
      props: { format: "portrait", src: "https://cdn.example.com/a.webp", print: true, aiBadge: "right" },
      attrs: { class: "w-full rounded-lg overflow-hidden max-h-112" },
      global: { stubs },
    });
    expect(wrapper.get("div").classes()).toEqual(expect.arrayContaining(["max-h-112", "overflow-hidden", "relative"]));
    expect(wrapper.get("img").element.parentElement).toBe(wrapper.get("div").element);
  });

  it("does not add relative beside a caller that already positions the root", () => {
    const wrapper = mount(FocalImage, {
      props: { format: "portrait", src: "https://cdn.example.com/a.webp", print: true, aiBadge: "right" },
      attrs: { class: "absolute inset-0" },
      global: { stubs },
    });
    expect(wrapper.get("div").classes()).not.toContain("relative");
    expect(wrapper.get("div").classes()).toContain("absolute");
  });
});

describe("FocalImage which file it asks for", () => {
  const url = "https://cdn.example/npc-portraits/u1/owl.webp";
  const srcOf = (props: Record<string, unknown>) =>
    mount(FocalImage, { props: { format: "portrait", src: url, ...props } }).get("img").attributes("src");

  it("asks for the size variant that fits the format, or the one the caller names", () => {
    expect(srcOf({})).toBe("https://cdn.example/npc-portraits/u1/owl_w400.webp");
    expect(srcOf({ format: "token" })).toBe("https://cdn.example/npc-portraits/u1/owl_w200.webp");
    expect(srcOf({ renderWidth: 600 })).toBe("https://cdn.example/npc-portraits/u1/owl_w600.webp");
  });

  it("prints the original, and never re-wraps a url that is already a variant", () => {
    expect(srcOf({ print: true })).toBe(url);
    const variant = "https://cdn.example/npc-portraits/u1/owl_w300.webp";
    expect(srcOf({ src: variant })).toBe(variant);
  });

  it("leaves local and relative sources alone", () => {
    expect(srcOf({ src: "/assets/placeholders/character.webp" })).toBe("/assets/placeholders/character.webp");
  });

  it("falls back to the original when the variant fails to load", async () => {
    const wrapper = mount(FocalImage, { props: { format: "portrait", src: url } });
    await wrapper.get("img").trigger("error");
    expect(wrapper.get("img").attributes("src")).toBe(url);
  });
});

describe("FocalImage lightbox", () => {
  const url = "https://cdn.example/npc-portraits/u1/owl.webp";
  let imagesPreloaded = 0;
  // Holds each preload open until the test lets it finish, so a second click or a src change can land mid-load.
  let finishPreloads: Array<() => void> = [];

  beforeEach(() => {
    imagesPreloaded = 0;
    finishPreloads = [];
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        decode() {
          imagesPreloaded++;
          return new Promise<void>((resolve) => finishPreloads.push(resolve));
        }
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const lightboxSrc = (wrapper: ReturnType<typeof mount>) => wrapper.findComponent(ImageLightbox).props("src");

  it("opens the original picture, not the thumbnail variant, when the image is clicked", async () => {
    const wrapper = mount(FocalImage, { props: { format: "portrait", src: url, lightbox: true }, global: { stubs: { ImageLightbox: true } } });
    await wrapper.get("div").trigger("click");
    finishPreloads.forEach((finish) => finish());
    await flushPromises();
    expect(lightboxSrc(wrapper)).toBe(url);
  });

  it("does nothing on a click unless the lightbox was asked for", async () => {
    const wrapper = mount(FocalImage, { props: { format: "portrait", src: url } });
    await wrapper.get("div").trigger("click");
    await flushPromises();
    expect(wrapper.findComponent(ImageLightbox).exists()).toBe(false);
    expect(imagesPreloaded).toBe(0);
  });

  it("a second click while the picture is still loading does not load it twice", async () => {
    const wrapper = mount(FocalImage, { props: { format: "portrait", src: url, lightbox: true }, global: { stubs: { ImageLightbox: true } } });
    await wrapper.get("div").trigger("click");
    await wrapper.get("div").trigger("click");
    finishPreloads.forEach((finish) => finish());
    await flushPromises();
    expect(imagesPreloaded).toBe(1);
  });

  it("does not open a picture the image has since moved off", async () => {
    const wrapper = mount(FocalImage, { props: { format: "portrait", src: url, lightbox: true }, global: { stubs: { ImageLightbox: true } } });
    await wrapper.get("div").trigger("click");
    await wrapper.setProps({ src: "https://cdn.example/npc-portraits/u1/other.webp" });
    finishPreloads.forEach((finish) => finish());
    await flushPromises();
    expect(lightboxSrc(wrapper)).toBeNull();
  });
});

describe("FocalImage where it crops", () => {
  /** A frame of the given height holding an image drawn at `shown` x `renderedH`, whose own file is `natural` x `natural`. */
  async function loaded(layout: { frameH: number; shownW: number; shownH: number; natural: number }, focalPoint: { x: number; y: number }) {
    const wrapper = mount(FocalImage, {
      props: { format: "portrait", src: "/local/pic.webp", focalPoint, print: true },
      attachTo: document.body,
    });
    const root = wrapper.find("div").element as HTMLElement;
    const img = wrapper.find("img").element as HTMLImageElement;
    Object.defineProperty(root, "offsetHeight", { configurable: true, value: layout.frameH });
    Object.defineProperty(img, "offsetWidth", { configurable: true, value: layout.shownW });
    Object.defineProperty(img, "offsetHeight", { configurable: true, value: layout.shownH });
    Object.defineProperty(img, "naturalWidth", { configurable: true, value: layout.natural });
    Object.defineProperty(img, "naturalHeight", { configurable: true, value: layout.natural });
    await flushPromises();
    await wrapper.find("img").trigger("load");
    return wrapper;
  }

  it("a picture that covers the box by height pans vertically to the focal point, and stays centred across", async () => {
    // 400x400 file in a 200x100 box: scaled to cover = 200x200, so 100px spare vertically, none across.
    const w = await loaded({ frameH: 0, shownW: 200, shownH: 100, natural: 400 }, { x: 10, y: 100 });
    expect(w.get("img").attributes("style")).toContain("object-position: 50% 100%");
    w.unmount();
  });

  it("a picture that covers the box by width pans across, and stays centred vertically", async () => {
    // 400x400 file in a 100x200 box: scaled to cover = 200x200, so 100px spare across, none vertically.
    const w = await loaded({ frameH: 0, shownW: 100, shownH: 200, natural: 400 }, { x: 0, y: 90 });
    expect(w.get("img").attributes("style")).toContain("object-position: 0% 50%");
    w.unmount();
  });

  it("only switches to the clipped layout when the image is more than 2px taller than its frame", async () => {
    // Image drawn 200 wide from a square file is 200 tall.
    const justOver = await loaded({ frameH: 198, shownW: 200, shownH: 200, natural: 400 }, { x: 50, y: 50 });
    expect(justOver.get("img").attributes("style") ?? "").toContain("object-position");
    justOver.unmount();

    const clearlyOver = await loaded({ frameH: 100, shownW: 200, shownH: 200, natural: 400 }, { x: 50, y: 100 });
    expect(clearlyOver.get("img").attributes("style")).toContain("translateY(-100px)");
    clearlyOver.unmount();
  });
});
