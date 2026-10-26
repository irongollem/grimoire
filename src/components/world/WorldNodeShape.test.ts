import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import WorldNodeShape from "./WorldNodeShape.vue";

const mountShape = (props: Record<string, unknown>) =>
  mount(WorldNodeShape, {
    props: { name: "Toll-men", ...props } as never,
    global: { stubs: { FocalImage: { props: ["src"], template: '<img class="stub" :src="src" />' } } },
    attachTo: document.createElementNS("http://www.w3.org/2000/svg", "svg") as unknown as HTMLElement,
  });

describe("WorldNodeShape art", () => {
  it("clips a faction's emblem to the shield and keeps the outline on top", () => {
    const w = mountShape({ kind: "faction", image: "e.png" });
    const box = w.get("foreignObject div");
    expect(box.attributes("style")).toContain("clip-path");
    expect(w.find(".stub").attributes("src")).toBe("e.png");
    expect(w.findAll("path").at(-1)?.attributes("fill")).toBe("none");
    expect(w.find("image").exists()).toBe(false);
  });

  it("falls back to the initial without an emblem", () => {
    const w = mountShape({ kind: "faction" });
    expect(w.find("foreignObject").exists()).toBe(false);
    expect(w.text()).toContain("T");
  });

  it("draws a deity's image inside the ring, or its initial", () => {
    expect(mountShape({ kind: "deity", image: "d.png" }).find(".stub").exists()).toBe(true);
    const bare = mountShape({ kind: "deity" });
    expect(bare.find(".stub").exists()).toBe(false);
    expect(bare.text()).toContain("T");
  });

  it("keeps an NPC a plain circle at rest and draws the portrait only when asked", () => {
    expect(mountShape({ kind: "npc", image: "n.png" }).find(".stub").exists()).toBe(false);
    expect(mountShape({ kind: "npc", image: "n.png", portrait: true }).find(".stub").exists()).toBe(true);
  });
});
