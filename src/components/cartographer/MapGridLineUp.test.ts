import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MapGridLineUp from "./MapGridLineUp.vue";
import { calibrationFor } from "@/lib/mapBring/pictureGrid";
import type { GridCalibration } from "@/types/location.types";

// A 3000 x 2000 picture in a 1500 x 1000 frame: one screen pixel is two picture pixels, no letterbox.
const natural = { width: 3000, height: 2000 };

function mountLineUp(props: { boxMode?: boolean; locked?: boolean } = {}) {
  let current: GridCalibration = calibrationFor(natural, 30);
  const wrapper = mount(MapGridLineUp, {
    props: {
      natural,
      modelValue: current,
      "onUpdate:modelValue": (v: GridCalibration) => { current = v; wrapper.setProps({ modelValue: v }); },
      ...props,
    },
    slots: { default: '<img alt="" />' },
  });
  const svg = wrapper.get("svg").element as SVGSVGElement;
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1500, height: 1000, right: 1500, bottom: 1000, x: 0, y: 0, toJSON: () => ({}) });
  svg.setPointerCapture = () => {};
  const at = (type: string, x: number, y: number) => wrapper.get("svg").trigger(type, { clientX: x, clientY: y, button: 0, pointerId: 1 });
  return { wrapper, at, calibration: () => current };
}

describe("MapGridLineUp", () => {
  it("drags the grid by the distance the pointer moved, in picture pixels", async () => {
    const { at, calibration } = mountLineUp();
    await at("pointerdown", 100, 100);
    await at("pointermove", 125, 110); // 25 and 10 screen px = 50 and 20 picture px
    await at("pointerup", 125, 110);
    expect(calibration().origin_x_pct).toBeCloseTo(50 / 3000, 6);
    expect(calibration().origin_y_pct).toBeCloseTo(20 / 2000, 6);
  });

  it("nudges one picture pixel per arrow key, ten with Shift", async () => {
    const { wrapper, calibration } = mountLineUp();
    await wrapper.get("[role=application]").trigger("keydown", { key: "ArrowRight" });
    expect(calibration().origin_x_pct).toBeCloseTo(1 / 3000, 6);
    await wrapper.get("[role=application]").trigger("keydown", { key: "ArrowDown", shiftKey: true });
    expect(calibration().origin_y_pct).toBeCloseTo(10 / 2000, 6);
  });

  it("measures one square from a box and says it is done", async () => {
    const { wrapper, at, calibration } = mountLineUp({ boxMode: true });
    await at("pointerdown", 50, 70); // picture (100, 140)
    await at("pointermove", 100, 120);
    await at("pointerup", 100, 120); // picture (200, 240): a 100 x 100 square
    expect(calibration().cells_per_image_width).toBeCloseTo(30, 6);
    expect(calibration().origin_x_pct).toBeCloseTo(0, 6);
    expect(calibration().origin_y_pct).toBeCloseTo(40 / 2000, 6);
    expect(wrapper.emitted("box-done")).toHaveLength(1);
  });

  it("stays in box mode after a slip of the hand too small to be a square", async () => {
    const { wrapper, at, calibration } = mountLineUp({ boxMode: true });
    const before = calibration();
    await at("pointerdown", 50, 50);
    await at("pointerup", 51, 51);
    expect(calibration()).toEqual(before);
    expect(wrapper.emitted("box-done")).toBeUndefined();
  });

  it("does not move a grid the file stated (Universal VTT): drag and keys do nothing", async () => {
    const { wrapper, at, calibration } = mountLineUp({ locked: true });
    const before = calibration();
    await at("pointerdown", 100, 100);
    await at("pointermove", 125, 130); // 50 and 60 picture px: not a whole square, so it would show
    await wrapper.get("[role=application]").trigger("keydown", { key: "ArrowLeft" });
    expect(calibration()).toEqual(before);
  });

  it("draws a line at every square edge, the picture's own edges included: 31 across and 21 down for 30 x 20 squares", () => {
    const { wrapper } = mountLineUp();
    expect(wrapper.findAll("line").length).toBe(31 + 21);
  });
});
