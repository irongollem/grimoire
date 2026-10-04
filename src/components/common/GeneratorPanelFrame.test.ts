import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GeneratorPanelFrame from "./GeneratorPanelFrame.vue";

function mountFrame(props: { open: boolean }, slots: Record<string, string> = { default: "<p>Body text</p>" }) {
  return mount(GeneratorPanelFrame, {
    props: { title: "Thing Generator", ...props },
    slots,
  });
}

describe("GeneratorPanelFrame", () => {
  it("renders nothing when closed", () => {
    const w = mountFrame({ open: false });
    expect(w.find("aside").exists()).toBe(false);
    expect(w.find(".bg-black\\/60").exists()).toBe(false);
  });

  it("shows the title and the body slot when open", () => {
    const w = mountFrame({ open: true });
    expect(w.find("h2").text()).toBe("Thing Generator");
    expect(w.text()).toContain("Body text");
  });

  it("emits close when the overlay is clicked", async () => {
    const w = mountFrame({ open: true });
    await w.find(".bg-black\\/60").trigger("click");
    expect(w.emitted("close")).toHaveLength(1);
  });

  it("emits close when the close button is clicked", async () => {
    const w = mountFrame({ open: true });
    await w.find("button[aria-label='Close']").trigger("click");
    expect(w.emitted("close")).toHaveLength(1);
  });

  it("draws the footer bar only when a footer slot is given", () => {
    const without = mountFrame({ open: true });
    expect(without.find(".border-t").exists()).toBe(false);

    const withFooter = mountFrame({ open: true }, { default: "<p>Body</p>", footer: "<button>Go</button>" });
    expect(withFooter.find(".border-t").exists()).toBe(true);
    expect(withFooter.find(".border-t").text()).toContain("Go");
  });
});
