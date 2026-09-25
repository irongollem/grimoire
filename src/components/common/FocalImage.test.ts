import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FocalImage from "./FocalImage.vue";

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
