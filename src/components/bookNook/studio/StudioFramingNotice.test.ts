// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import StudioFramingNotice from "./StudioFramingNotice.vue";

describe("StudioFramingNotice", () => {
  it("says nothing when the window is clean", () => {
    const w = mount(StudioFramingNotice, { props: { issues: [], names: new Map(), screen: "TV", canGentler: true } });
    expect(w.text()).toBe("");
  });

  it("names a dark strip for the phone in plain words, and offers a gentler breath that emits", async () => {
    const w = mount(StudioFramingNotice, { props: { issues: [{ kind: "dark-edge", px: 4 }], names: new Map(), screen: "phone", canGentler: true } });
    expect(w.text()).toContain("The phone's window reaches the edge of the picture: at its furthest breath a dark strip shows.");
    await w.find("button").trigger("click");
    expect(w.emitted("gentler")).toHaveLength(1);
  });

  it("names the floating cut-out and its side, and hides the button when breathing cannot get gentler", () => {
    const w = mount(StudioFramingNotice, {
      props: { issues: [{ kind: "floating", layerId: "chair-back-abc123", side: "bottom" }], names: new Map(), screen: "TV", canGentler: false },
    });
    expect(w.text()).toContain("The chair back's cut bottom edge shows inside the TV's window, so it seems to float.");
    expect(w.find("button").exists()).toBe(false);
  });

  // Bug: a cut-out the DM renamed was still called by its file-derived id in the notice.
  it("calls a renamed cut-out by the name the DM gave it", () => {
    const w = mount(StudioFramingNotice, {
      props: { issues: [{ kind: "floating", layerId: "chair-back-abc123", side: "bottom" }], names: new Map([["chair-back-abc123", "Floss's armchair"]]), screen: "TV", canGentler: false },
    });
    expect(w.text()).toContain("Floss's armchair's cut bottom edge shows inside the TV's window");
  });
});
