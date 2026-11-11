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

  describe("quick edits", () => {
    const edges = (w: ReturnType<typeof mount>) => {
      const patch = w.emitted("nodeAttrs")?.at(-1)?.[0] as { illuminate: { steps: { type: string; style?: string }[] }; original: string };
      return patch;
    };

    // Fails on: the first edit not keeping the file it started from, so Reset has nothing to put back.
    it("writes a torn-paper recipe over the original when Torn paper is chosen on an untouched picture", async () => {
      const w = mount(PicturePanelSection, { props: { ...nodeProps, nodeAttrs: { src: "a.webp" } }, global: { stubs } });
      await press(w, "Torn paper");
      const patch = edges(w);
      expect(patch.original).toBe("a.webp");
      expect(patch.illuminate.steps).toMatchObject([{ type: "edges", style: "paper" }]);
    });

    // Fails on: art on the page receiving a recipe object, which furniture props cannot hold.
    it("writes the recipe of art on the page as JSON text into its props", async () => {
      const w = mount(PicturePanelSection, {
        props: { ...nodeProps, layer: "over", where: "Placed on page 2", nodeAttrs: null, item: item(), anchor },
        global: { stubs },
      });
      await press(w, "Sepia");
      const patch = w.emitted("item")?.at(-1)?.[0] as { props: Record<string, string> };
      expect(patch.props.original).toBe("a.webp");
      expect(JSON.parse(patch.props.illuminate).steps[0].type).toBe("grade");
    });

    // Fails on: Reset offered on a picture that was never edited, or doing anything but putting the original back.
    it("offers Reset only for an edited picture, and it puts the original back", async () => {
      const plain = mount(PicturePanelSection, { props: { ...nodeProps, nodeAttrs: { src: "a.webp" } }, global: { stubs } });
      expect(buttons(plain, "Reset to the original picture")).toHaveLength(0);
      const edited = mount(PicturePanelSection, {
        props: { ...nodeProps, src: "bake.webp", nodeAttrs: { src: "bake.webp", original: "a.webp", illuminate: { v: 1, seed: 1, steps: [] } } },
        global: { stubs },
      });
      await press(edited, "Reset to the original picture");
      expect(edited.emitted("nodeAttrs")?.at(-1)).toEqual([{ original: null, illuminate: null, bakedFor: null, src: "a.webp" }]);
    });

    // Fails on: Warmth writing the slider's 0-100 straight into a -1 to +1 value.
    it("maps Warmth from the panel's 0 to 100 onto the recipe's -1 to +1", async () => {
      const w = mount(PicturePanelSection, { props: { ...nodeProps, nodeAttrs: { src: "a.webp" } }, global: { stubs } });
      const warmth = w.find('input[aria-label="Warmth"]');
      await warmth.setValue(100);
      const patch = edges(w);
      expect(patch.illuminate.steps[0]).toMatchObject({ type: "grade", options: { temperature: 1 } });
    });

    // Fails on: "More tools" being a dead end, so the workbench cannot be reached from the panel.
    it("opens the workbench from More tools and from Edit picture", async () => {
      const w = mount(PicturePanelSection, { props: { ...nodeProps, nodeAttrs: { src: "a.webp" } }, global: { stubs } });
      await press(w, "More tools: open the Illuminator…");
      await press(w, "Edit picture…");
      expect(w.emitted("edit")).toHaveLength(2);
    });

    // Fails on: quick edits showing for a picture the canvas cannot read, where every edit would fail to bake.
    it("hides the quick edits for a picture that cannot be edited", () => {
      const w = mount(PicturePanelSection, { props: { ...nodeProps, nodeAttrs: { src: "https://elsewhere/a.png" }, canEdit: false }, global: { stubs } });
      expect(w.find('[data-testid="panel-picture-edit"]').exists()).toBe(false);
    });
  });

  it("explains why Edit picture is unavailable", () => {
    const w = mount(PicturePanelSection, { props: { ...nodeProps, nodeAttrs: {}, canEdit: false, editHint: "Only pictures in your library can be edited" }, global: { stubs } });
    const edit = w.findAll("button").find((b) => b.text() === "Edit picture…");
    expect(edit?.attributes("disabled")).toBeDefined();
    expect(edit?.attributes("title")).toBe("Only pictures in your library can be edited");
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
  it.each([
    ["front", ["Art"]],
    ["inside", ["Art"]],
    ["part", ["Part number"]],
    ["back", ["Blurb 1", "Blurb 2", "Blurb 3", "Tagline", "Product URL", "Art"]],
  ])("a %s cover keeps the fields it has that are not typed on the cover", (variant, labels) => {
    const w = mount(CoverPanelSection, { props: { attrs: { variant } }, global: { stubs } });
    for (const label of labels) expect(w.text().toLowerCase(), label).toContain(label.toLowerCase());
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
    for (const label of ["Auto", "One column", "Full width", "Cutout", "Picture", "Top", "Bottom", "Open", "Detach…"]) expect(buttons(w, label).length, label).toBeGreaterThan(0);
    for (const label of ["Show the art", "Show the lore", "Starts a new page"]) expect(w.text(), label).toContain(label);
    expect(w.findComponent({ name: "EmbedRevealControl" }).exists()).toBe(true);
  });

  // Fails on: sizing, lore or art shown for an entity they do nothing for.
  it("shows only the controls an entity type has", () => {
    const npc = embed({ entityType: "npc" });
    expect(npc.text()).not.toContain("Show the lore");
    expect(buttons(npc, "Full width")).toHaveLength(1);
    const spell = embed({ entityType: "spell" });
    expect(spell.text()).not.toContain("Show the art");
    expect(buttons(spell, "Full width")).toHaveLength(0);
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
