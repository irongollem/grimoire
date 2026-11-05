// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("./addCutout/AddCutoutDialog.vue", () => ({
  default: { props: ["open"], emits: ["added", "close", "update"], template: '<div data-testid="dlg" :data-open="open" @click="$emit(\'added\', \'x-1\')" />' },
}));

import StudioLayers from "./StudioLayers.vue";
import { newScene } from "@/lib/bookNook/edit";

const scene = newScene({ id: "n", title: "N", room: { url: "r", width: 2000, height: 1000 } });

describe("StudioLayers Add a cut-out", () => {
  it("opens the dialog instead of a bare file input, and selects what it adds", async () => {
    const w = mount(StudioLayers, { props: { scene, selection: null, hidden: new Set<string>(), nookId: "n1" } });
    expect(w.find('input[type="file"]').exists()).toBe(false);
    expect(w.find("[data-testid=dlg]").attributes("data-open")).toBe("false");
    await w.findAll("button").find((b) => b.text() === "Add a cut-out")!.trigger("click");
    expect(w.find("[data-testid=dlg]").attributes("data-open")).toBe("true");
    await w.find("[data-testid=dlg]").trigger("click");
    expect(w.emitted("added")?.[0]).toEqual([{ kind: "layer", id: "x-1" }]);
  });
});

describe("StudioLayers order", () => {
  // Bug: the list took the first layer as the picture, so a Far part (the view behind a transparent sky, which
  // sorts before the plate) was listed as "The picture" and the room as a cut-out.
  it("finds the picture by its id when a Far part sorts before it", () => {
    const far = { kind: "layer" as const, id: "vista-ab12cd", name: "The view", src: "v", depth: 0.3, anchor: { x: 0.5, y: 0.5 }, at: { x: 1000, y: 500 }, width: 2000 };
    const withFar = { ...scene, stack: [far, ...scene.stack] };
    const w = mount(StudioLayers, { props: { scene: withFar, selection: null, hidden: new Set<string>(), nookId: "n1" } });
    const picture = w.find("[aria-labelledby=studio-layers-picture]").text();
    const cutouts = w.find("[aria-labelledby=studio-layers-cutouts]").text();
    expect(picture).toContain("The picture");
    expect(picture).not.toContain("The view");
    expect(cutouts).toContain("The view");
  });
});
