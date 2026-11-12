// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CoverPanelSection from "./CoverPanelSection.vue";

const stubs = { ArtPickerModal: true, ImageUpload: true };
const cover = (attrs: Record<string, unknown>) => mount(CoverPanelSection, { props: { attrs }, global: { stubs } });
const press = (w: ReturnType<typeof cover>, text: string) => {
  const b = w.findAll("button").find((x) => x.text() === text);
  if (!b) throw new Error(`no button "${text}"`);
  return b.trigger("click");
};

describe("CoverPanelSection (#1176 frame 05)", () => {
  // Fails on: the title and subtitle staying as inputs here after they moved onto the cover, so there are two places to write them.
  it("has no title or subtitle input: those are typed on the cover", () => {
    for (const variant of ["front", "inside", "part", "back"]) {
      const w = cover({ variant, title: "T", subtitle: "S" });
      expect(w.find('input[placeholder="Document Title"]').exists(), variant).toBe(false);
      expect(w.text(), variant).not.toContain("Subtitle");
    }
  });

  // Fails on: Title sits writing something other than its place, or a back cover offering a title place it does not have.
  it("sets where the title sits on a front cover only", async () => {
    const front = cover({ variant: "front" });
    await press(front, "Top");
    expect(front.emitted("update")).toEqual([[{ titlePlace: "top" }]]);
    expect(cover({ variant: "back" }).text()).not.toContain("Title sits");
  });

  // Fails on: a shade choice writing the wrong attr, or Shade showing where there is no art to shade.
  it("sets the shade under the title, and only over art", async () => {
    expect(cover({ variant: "front", backgroundImage: "" }).text()).not.toContain("Shade under the title");
    const w = cover({ variant: "front", backgroundImage: "a.webp" });
    await press(w, "Parchment");
    expect(w.emitted("update")).toEqual([[{ shade: "parchment" }]]);
  });

  // Fails on: the Cover title choice writing the wrong attr, or showing on a cover with no art or on a back cover.
  it("sets the cover title over a front cover's art only", async () => {
    expect(cover({ variant: "front", backgroundImage: "" }).text()).not.toContain("Cover title");
    expect(cover({ variant: "back", backgroundImage: "a.webp" }).text()).not.toContain("Cover title");
    const w = cover({ variant: "front", backgroundImage: "a.webp" });
    await press(w, "Light on the art");
    expect(w.emitted("update")).toEqual([[{ titleStyle: "light" }]]);
  });

  // Fails on: white letters left on the pale parchment shade, where they cannot be read.
  it("a light title takes the parchment shade away and cannot be given it back", async () => {
    const w = cover({ variant: "front", backgroundImage: "a.webp", shade: "parchment" });
    await press(w, "Light on the art");
    expect(w.emitted("update")).toEqual([[{ titleStyle: "light", shade: "none" }]]);
    const lit = cover({ variant: "front", backgroundImage: "a.webp", titleStyle: "light" });
    const parchment = lit.findAll("button").find((b) => b.text() === "Parchment");
    expect(parchment?.attributes("disabled")).toBeDefined();
  });

  // Fails on: a cover with no shade attr showing no shade selected in the panel.
  it("shows a cover with no shade as Dusk", () => {
    const w = cover({ variant: "front", backgroundImage: "a.webp" });
    const pressed = w.findAll("button").filter((b) => b.attributes("aria-pressed") === "true").map((b) => b.text());
    expect(pressed).toContain("Dusk");
  });

  // Fails on: Which cover not changing the cover's variant.
  it("changes which cover it is", async () => {
    const w = cover({ variant: "front" });
    await press(w, "Inside");
    expect(w.emitted("update")).toEqual([[{ variant: "inside" }]]);
  });

  // Fails on: the back cover's blurbs, tagline and link, or the part number, going missing from the panel (frame 16).
  it("keeps the part number and the back cover's blurbs, tagline and link", () => {
    expect(cover({ variant: "part" }).text()).toContain("Part number");
    const back = cover({ variant: "back" }).text();
    for (const label of ["Blurb 1", "Blurb 2", "Blurb 3", "Tagline", "Product URL"]) expect(back, label).toContain(label);
  });
});
