import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MapFrame from "./MapFrame.vue";

describe("MapFrame", () => {
  it("renders the slot content once the image loads successfully", async () => {
    const wrapper = mount(MapFrame, {
      props: { mapUrl: "https://example.test/map.webp" },
      slots: { default: `<div data-testid="overlay">pin</div>` },
    });

    await wrapper.find("img").trigger("load");

    expect(wrapper.find("img").exists()).toBe(true);
    expect(wrapper.find("[data-testid='overlay']").exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Map unavailable");
  });

  it("renders a quiet placeholder and withholds the slot when the image fails to load (#828)", async () => {
    const wrapper = mount(MapFrame, {
      props: { mapUrl: "https://example.test/broken.webp" },
      slots: { default: `<div data-testid="overlay">pin</div>` },
    });

    await wrapper.find("img").trigger("error");

    // The broken <img> is gone — replaced by the placeholder, not left to
    // show the browser's own broken-image glyph.
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).toContain("Map unavailable");
    // The overlay slot must not render against unmeasured dimensions — see
    // the comment at MapFrame.vue's slot for why this is load-bearing.
    expect(wrapper.find("[data-testid='overlay']").exists()).toBe(false);
  });

  it("clears the failed state and tries again when mapUrl changes", async () => {
    const wrapper = mount(MapFrame, {
      props: { mapUrl: "https://example.test/broken.webp" },
      slots: { default: `<div data-testid="overlay">pin</div>` },
    });

    await wrapper.find("img").trigger("error");
    expect(wrapper.find("img").exists()).toBe(false);

    await wrapper.setProps({ mapUrl: "https://example.test/fixed.webp" });

    // A DM who fixes the URL gets a fresh attempt without reloading the page.
    expect(wrapper.find("img").exists()).toBe(true);
    expect(wrapper.find("img").attributes("src")).toBe("https://example.test/fixed.webp");
    expect(wrapper.text()).not.toContain("Map unavailable");
    expect(wrapper.find("[data-testid='overlay']").exists()).toBe(true);
  });

  it("exposes imageFailed so a consumer with a better fallback can react to it", async () => {
    const wrapper = mount(MapFrame, {
      props: { mapUrl: "https://example.test/broken.webp" },
    });

    expect(wrapper.vm.imageFailed).toBe(false);
    await wrapper.find("img").trigger("error");
    expect(wrapper.vm.imageFailed).toBe(true);
  });
});
