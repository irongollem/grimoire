import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import RunnerPortrait from "./RunnerPortrait.vue";
import FocalImage from "@/components/common/FocalImage.vue";

describe("RunnerPortrait", () => {
  it("renders nothing for a combatant without a picture", () => {
    const wrapper = mount(RunnerPortrait, {
      props: { src: null, alt: "Goblin" },
      global: { stubs: { FocalImage: true } },
    });
    expect(wrapper.findComponent(FocalImage).exists()).toBe(false);
  });

  it("frames the picture as a portrait and asks for the AI label", () => {
    const wrapper = mount(RunnerPortrait, {
      props: { src: "https://cdn.example/goblin.webp", alt: "Goblin", focalPoint: { x: 0.4, y: 0.2 } },
      global: { stubs: { FocalImage: true } },
    });
    const image = wrapper.findComponent(FocalImage);
    expect(image.props("src")).toBe("https://cdn.example/goblin.webp");
    expect(image.props("alt")).toBe("Goblin");
    expect(image.props("focalPoint")).toEqual({ x: 0.4, y: 0.2 });
    expect(image.props("format")).toBe("portrait");
    expect(image.props("aiBadge")).toBe("right");
  });
});
