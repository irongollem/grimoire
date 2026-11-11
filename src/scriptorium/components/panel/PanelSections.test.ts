// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CoverPanelSection from "./CoverPanelSection.vue";
import DecorationPanelSection from "./DecorationPanelSection.vue";
import EmbedPanelSection from "./EmbedPanelSection.vue";
import PicturePanelSection from "./PicturePanelSection.vue";
import PlacementFields from "./PlacementFields.vue";
import type { PageFurnitureItem } from "@/scriptorium/types";

const stubs = { ArtPickerModal: true, ImageUpload: true, EmbedRevealControl: true };
const anchor = { page: 2, hasParagraph: true, canFree: true };

function buttons(w: ReturnType<typeof mount>, text: string) {
  return w.findAll("button").filter((b) => b.text() === text);
}
function press(w: ReturnType<typeof mount>, text: string) {
  const [b] = buttons(w, text);
  if (!b) throw new Error(`no button "${text}"`);
  return b.trigger("click");
}

function item(over: Partial<PageFurnitureItem> = {}): PageFurnitureItem {
  return { id: "f1", kind: "art", anchor: { type: "block", blockId: "b1" }, x: 10, y: 5, width: 40, z: "over", props: { src: "a.webp" }, ...over };
}

describe("PicturePanelSection", () => {
  const nodeProps = { src: "a.webp", layer: "text" as const, where: "In the text", canEdit: true, anchor: null, item: null };

  // Fails on: the in-text options being lost in the move from the toolbar: size, align, wrap.
  it("offers every in-the-text option the toolbar had: size, align, wrap", async () => {
    const w = mount(PicturePanelSection, { props: { ...nodeProps, nodeAttrs: { width: "330", dataAlign: "left", layoutMode: "inline" } }, global: { stubs } });
    for (const label of ["S", "M", "L", "XL", "Left", "Centre", "Right", "None"]) expect(buttons(w, label).length, label).toBeGreaterThan(0);
    await press(w, "XL");
    expect(w.emitted("nodeAttrs")?.at(-1)).toEqual([{ width: "650" }]);
    await press(w, "Centre");
    expect(w.emitted("nodeAttrs")?.at(-1)).toEqual([{ dataAlign: "center", layoutMode: "inline" }]);
  });

  // Fails on: gutter bleed and keep-with-text showing for a picture that is not wrapped, where they mean nothing.
  it("offers gutter bleed and keep with its text only for a wrapped picture", async () => {
    const plain = mount(PicturePanelSection, { props: { ...nodeProps, nodeAttrs: { layoutMode: "inline" } }, global: { stubs } });
    expect(plain.text()).not.toContain("Keep with its text");
    expect(plain.text()).not.toContain("column gutter");
    const wrapped = mount(PicturePanelSection, { props: { ...nodeProps, nodeAttrs: { layoutMode: "wrapLeft", keepWithText: false } }, global: { stubs } });
    expect(wrapped.text()).toContain("Keep with its text");
    await wrapped.find('input[type="checkbox"]').setValue(true);
    expect(wrapped.emitted("nodeAttrs")?.at(-1)).toEqual([{ gutterBleed: true }]);
  });

  // Fails on: Layer reporting a layer the picture is not in.
  it("reports the layer the writer picks", async () => {
    const w = mount(PicturePanelSection, { props: { ...nodeProps, nodeAttrs: { layoutMode: "inline" } }, global: { stubs } });
    await press(w, "Behind the text");
    expect(w.emitted("layer")).toEqual([["under"]]);
  });

  // Fails on: Strength showing for a picture in front, where it has no meaning, or Place and Stays going missing.
  it("on the page offers Strength only behind the text, with Place, Stays and Width", () => {
    const behind = mount(PicturePanelSection, { props: { ...nodeProps, layer: "under", where: "Placed on page 2", nodeAttrs: null, item: item({ z: "under" }), anchor }, global: { stubs } });
    expect(behind.text()).toContain("Strength");
    for (const label of ["Free", "Top left", "With its paragraph", "On page 2"]) expect(buttons(behind, label).length, label).toBe(1);
    expect(behind.text()).toContain("Width");
    const front = mount(PicturePanelSection, { props: { ...nodeProps, layer: "over", where: "Placed on page 2", nodeAttrs: null, item: item(), anchor }, global: { stubs } });
    expect(front.text()).not.toContain("Strength");
  });

  it("explains why Edit picture is unavailable", () => {
    const w = mount(PicturePanelSection, { props: { ...nodeProps, nodeAttrs: {}, canEdit: false, editHint: "Coming with the Illuminator move" }, global: { stubs } });
    const edit = w.findAll("button").find((b) => b.text() === "Edit picture…");
    expect(edit?.attributes("disabled")).toBeDefined();
    expect(edit?.attributes("title")).toBe("Coming with the Illuminator move");
  });
});

describe("PlacementFields", () => {
  // Fails on: Stays reporting the wrong choice, which would write the wrong anchor.
  it("Stays reports With its paragraph and On page, and disables the one that has nothing to stand on", async () => {
    const onPage = item({ anchor: { type: "page", chapterId: "c1", page: 2 } });
    const w = mount(PlacementFields, { props: { item: onPage, anchor: { page: 2, hasParagraph: false, canFree: true } } });
    const paragraph = w.findAll("button").find((b) => b.text() === "With its paragraph");
    expect(paragraph?.attributes("disabled")).toBeDefined();
    const w2 = mount(PlacementFields, { props: { item: onPage, anchor } });
    await press(w2, "With its paragraph");
    expect(w2.emitted("stays")).toEqual([["block"]]);
  });

  it("gives a watermark no width, place or stays: it spans the page by itself", () => {
    const w = mount(PlacementFields, { props: { item: item({ kind: "watermark" }), anchor } });
    expect(w.text()).toBe("");
  });
});

describe("DecorationPanelSection", () => {
  it("edits a watercolour's variant, tint and opacity, and a watermark's text and rotation, as props", async () => {
    const water = mount(DecorationPanelSection, { props: { item: item({ kind: "watercolor", props: { variant: 1, color: "#2a2018", opacity: 80 } }), anchor }, global: { stubs } });
    await water.find('input[type="range"][aria-label="Opacity"]').setValue("55");
    expect(water.emitted("patch")?.at(-1)).toEqual([{ props: { variant: 1, color: "#2a2018", opacity: 55 } }]);
    const mark = mount(DecorationPanelSection, { props: { item: item({ kind: "watermark", props: { text: "DRAFT", rotation: -30, opacity: 15 } }), anchor }, global: { stubs } });
    await mark.find('input[type="text"]').setValue("SECRET");
    expect(mark.emitted("patch")?.at(-1)).toEqual([{ props: { text: "SECRET", rotation: -30, opacity: 15 } }]);
  });

  it("edits an artist credit's name and corner, switches its layer and removes it", async () => {
    const w = mount(DecorationPanelSection, { props: { item: item({ kind: "artistCredit", z: "over", props: { artistName: "", position: "bottom-right" } }), anchor }, global: { stubs } });
    await w.find('input[type="text"]').setValue("Mira");
    expect(w.emitted("patch")?.at(-1)).toEqual([{ props: { artistName: "Mira", position: "bottom-right" } }]);
    await press(w, "Top left");
    expect(w.emitted("patch")?.at(-1)).toEqual([{ props: { artistName: "", position: "top-left" } }]);
    await press(w, "Behind the text");
    expect(w.emitted("patch")?.at(-1)).toEqual([{ z: "under" }]);
    await press(w, "Remove decoration");
    expect(w.emitted("remove")).toHaveLength(1);
  });
});

describe("CoverPanelSection", () => {
  // Fails on: a cover edit waiting for an Apply the panel no longer has.
  it("a cover's title edit saves without an Apply", async () => {
    const w = mount(CoverPanelSection, { props: { attrs: { variant: "front", title: "", subtitle: "" } }, global: { stubs } });
    await w.find('input[placeholder="Document Title"]').setValue("The Understage");
    expect(w.emitted("update")).toEqual([[{ title: "The Understage" }]]);
    expect(buttons(w, "Apply")).toHaveLength(0);
    expect(buttons(w, "Cancel")).toHaveLength(0);
  });

  it.each([
    ["front", ["Title", "Subtitle", "Background art"]],
    ["inside", ["Title", "Subtitle", "Background art"]],
    ["part", ["Part number", "Subtitle"]],
    ["back", ["Subtitle", "Blurb 1", "Blurb 2", "Blurb 3", "Tagline", "Product URL", "Background art"]],
  ])("a %s cover has the fields the cover dialog had", (variant, labels) => {
    const w = mount(CoverPanelSection, { props: { attrs: { variant } }, global: { stubs } });
    for (const label of labels) expect(w.text().toLowerCase(), label).toContain(label.toLowerCase());
    if (variant === "part") expect(w.text()).not.toContain("Background art");
  });

  // Fails on: the darken-behind-the-title option showing on a cover with no art, or on a cover that is not the front.
  it("offers Darken behind the title only on a front cover that has art", async () => {
    const bare = mount(CoverPanelSection, { props: { attrs: { variant: "front", backgroundImage: "" } }, global: { stubs } });
    expect(bare.text()).not.toContain("Darken behind the title");
    const inside = mount(CoverPanelSection, { props: { attrs: { variant: "inside", backgroundImage: "a.webp" } }, global: { stubs } });
    expect(inside.text()).not.toContain("Darken behind the title");
    const front = mount(CoverPanelSection, { props: { attrs: { variant: "front", backgroundImage: "a.webp", titleScrim: true } }, global: { stubs } });
    await front.find('input[type="checkbox"]').setValue(false);
    expect(front.emitted("update")).toEqual([[{ titleScrim: false }]]);
  });

  it("writes back-cover blurbs from their text areas", async () => {
    const w = mount(CoverPanelSection, { props: { attrs: { variant: "back", blurb1: "" } }, global: { stubs } });
    await w.find("textarea").setValue("A door in the dark.");
    expect(w.emitted("update")).toEqual([[{ blurb1: "A door in the dark." }]]);
  });
});

describe("EmbedPanelSection", () => {
  const embed = (attrs: Record<string, unknown>) => mount(EmbedPanelSection, { props: { attrs }, global: { stubs } });

  // Fails on: a hover-toolbar option lost in the move to the panel.
  it("a monster has every control the entry's toolbar had", () => {
    const w = embed({ entityType: "monster" });
    for (const label of ["Auto", "Column", "Wide", "Cutout", "Picture", "Top", "Bottom", "Open", "Detach…"]) expect(buttons(w, label).length, label).toBeGreaterThan(0);
    for (const label of ["Show the art", "Show the lore", "Starts a new page"]) expect(w.text(), label).toContain(label);
    expect(w.findComponent({ name: "EmbedRevealControl" }).exists()).toBe(true);
  });

  // Fails on: sizing, lore or art shown for an entity they do nothing for.
  it("shows only the controls an entity type has", () => {
    const npc = embed({ entityType: "npc" });
    expect(npc.text()).not.toContain("Show the lore");
    expect(buttons(npc, "Wide")).toHaveLength(1);
    const spell = embed({ entityType: "spell" });
    expect(spell.text()).not.toContain("Show the art");
    expect(buttons(spell, "Wide")).toHaveLength(0);
    const deity = embed({ entityType: "deity" });
    expect(deity.text()).toContain("Show the art");
    expect(buttons(deity, "Cutout")).toHaveLength(0);
  });

  it("hides the art choice while the art is off, and turns art on and off", async () => {
    const off = embed({ entityType: "monster", showArt: false });
    expect(buttons(off, "Cutout")).toHaveLength(0);
    await off.findAll('input[type="checkbox"]')[0].setValue(true);
    expect(off.emitted("update")?.at(-1)).toEqual([{ showArt: true }]);
  });

  it("asks to open and detach", async () => {
    const w = embed({ entityType: "monster" });
    await press(w, "Open");
    await press(w, "Detach…");
    expect(w.emitted("open")).toHaveLength(1);
    expect(w.emitted("detach")).toHaveLength(1);
  });
});
