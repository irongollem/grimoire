import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MapPictureControls from "./MapPictureControls.vue";

const base = { hasPicture: true, moving: false, battleMap: false, busy: false };
const buttons = (w: ReturnType<typeof mount>) => w.findAll("button").map((b) => b.text());

describe("MapPictureControls", () => {
  it("offers Upload before there is a picture, and only that and the flag", () => {
    const w = mount(MapPictureControls, { props: { ...base, hasPicture: false } });
    expect(buttons(w)).toEqual(["Upload"]);
  });

  it("offers Replace, Line up the grid and Remove once there is one", () => {
    expect(buttons(mount(MapPictureControls, { props: base }))).toEqual(["Replace", "Line up the grid", "Remove"]);
  });

  it("reports the chosen file and clears the input so the same file can be chosen again", async () => {
    const w = mount(MapPictureControls, { props: base });
    const file = new File(["x"], "m.png");
    const input = w.get('input[type="file"]');
    Object.defineProperty(input.element, "files", { value: [file], configurable: true });
    await input.trigger("change");
    expect(w.emitted("upload")![0]).toEqual([file]);
  });

  it("reports nothing when the file dialog is dismissed", async () => {
    const w = mount(MapPictureControls, { props: base });
    await w.get('input[type="file"]').trigger("change");
    expect(w.emitted("upload")).toBeUndefined();
  });

  it("says a moving map plays on this device and players see the still", () => {
    const w = mount(MapPictureControls, { props: { ...base, moving: true } });
    expect(w.text()).toContain("Players see the still.");
    expect(mount(MapPictureControls, { props: base }).text()).not.toContain("Players see the still.");
  });

  it("states the battle-map flag in the frame's words and reports a change", async () => {
    const w = mount(MapPictureControls, { props: base });
    expect(w.text()).toContain("This is a battle map, not a region");
    await w.get('input[type="checkbox"]').setValue(true);
    expect(w.emitted("update:battleMap")![0]).toEqual([true]);
  });

  it("reports Line up the grid and Remove", async () => {
    const w = mount(MapPictureControls, { props: base });
    await w.findAll("button").find((b) => b.text() === "Line up the grid")!.trigger("click");
    await w.findAll("button").find((b) => b.text() === "Remove")!.trigger("click");
    expect(w.emitted("line-up")).toHaveLength(1);
    expect(w.emitted("remove")).toHaveLength(1);
  });
});
