import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AiGeneratedBadge from "./AiGeneratedBadge.vue";

function mountBadge(props: Record<string, unknown>) {
  return mount(AiGeneratedBadge, { props: props as never });
}

describe("AiGeneratedBadge", () => {
  it("renders the chip from a held record", () => {
    const w = mountBadge({ variant: "chip", provenance: { provider: "meshy" }, corner: "left" });
    expect(w.text()).toContain("AI");
    expect(w.find("span").classes()).toContain("left-1.5");
    expect(w.find("span").attributes("title")).toContain("Provider: meshy");
  });

  it("keeps the line variant on a held record", () => {
    const w = mountBadge({ variant: "line", provenance: { edited: true } });
    expect(w.text()).toContain("AI-assisted, edited by the DM");
  });

  it("renders nothing for a null record", () => {
    expect(mountBadge({ variant: "chip", provenance: null }).find("span").exists()).toBe(false);
  });
});
