import { describe, expect, it } from "vitest";
import type { BrushPreset } from "../engine/types";
import {
  CONTROL_OPTIONS,
  GRAIN_CHOICES,
  TIP_CHOICES,
  sectionSummary,
  selectedTipId,
  tipSourceFor,
  withGrain,
  withSection,
  withShape,
  withTransferDynamics,
} from "./brushSettings";
import { STOCK_BRUSHES, STOCK_TIP_PATHS } from "../brushes/stockBrushes";

const V = { jitter: 0, control: "off", minimum: 0 } as const;
const base: BrushPreset = {
  v: 1, id: "t", name: "t", group: "basic",
  tip: { source: { kind: "round", hardness: 0.4 }, size: 24, angle: 0, roundness: 1, spacing: 0.1, flipX: false, flipY: false, followDirection: false },
  shape: null, scatter: null, grain: null, transfer: { flow: 0.5, opacity: 1, flowDynamics: V, opacityDynamics: V },
  wetEdges: false, wetMix: null, colour: null, smoothing: 0, blend: "normal", fadeLength: 0,
};

describe("section switches", () => {
  // Fails if switching a section on leaves it null (the controls would have nothing to edit).
  it("switching on gives the section values; switching off clears them", () => {
    const on = withSection(base, "scatter", true);
    expect(on.scatter).not.toBeNull();
    expect(withSection(on, "scatter", false).scatter).toBeNull();
  });

  // Fails if switching on an already-on section resets what the DM set.
  it("switching on an already-on section keeps its values", () => {
    const tuned = withGrain(base, { depth: 0.9 });
    expect(withSection(tuned, "grain", true)).toBe(tuned);
  });

  // Fails if an edit mutates the brush it was given (the panel would change a prop in place).
  it("edits return a new brush and leave the old one alone", () => {
    const next = withShape(base, "size", { control: "pressure", minimum: 0.3 });
    expect(next).not.toBe(base);
    expect(base.shape).toBeNull();
    expect(next.shape?.size).toEqual({ jitter: 0, control: "pressure", minimum: 0.3 });
    expect(next.shape?.angle).toEqual(V);
  });

  // Fails if flow and opacity dynamics are swapped.
  it("edits the named transfer dynamics only", () => {
    const next = withTransferDynamics(base, "opacityDynamics", { jitter: 0.5 });
    expect(next.transfer.opacityDynamics.jitter).toBe(0.5);
    expect(next.transfer.flowDynamics.jitter).toBe(0);
  });
});

describe("tip grid", () => {
  // Fails if picking Round on a round tip resets its hardness.
  it("round keeps the hardness the brush already had", () => {
    expect(tipSourceFor(base, "round")).toEqual({ kind: "round", hardness: 0.4 });
    expect(tipSourceFor(base, "sponge")).toEqual({ kind: "image", id: "sponge" });
    expect(selectedTipId(base)).toBe("round");
    expect(selectedTipId({ ...base, tip: { ...base.tip, source: { kind: "image", id: "sponge" } } })).toBe("sponge");
  });

  // Fails if the grid offers a tip the engine has no art for, or leaves a stock tip out.
  it("offers exactly the round tip plus every stock tip", () => {
    expect(TIP_CHOICES.map((t) => t.id).filter((id) => id !== "round").sort()).toEqual(Object.keys(STOCK_TIP_PATHS).sort());
  });

  // Fails if a stock brush's grain is not choosable, so its panel would show no selection.
  it("offers every grain a stock brush uses", () => {
    for (const b of STOCK_BRUSHES) if (b.grain) expect(GRAIN_CHOICES.map((g) => g.id)).toContain(b.grain.id);
  });
});

describe("summaries", () => {
  // Fails if an off section still describes values it no longer has.
  it("an off section says so, an on one says what it does", () => {
    expect(sectionSummary(base, "scatter")).toBe("Dabs sit on the path");
    expect(sectionSummary(withSection(base, "scatter", true), "scatter")).toContain("30%");
    expect(sectionSummary(base, "shape")).toBe("Every dab is the tip as set");
    expect(sectionSummary(withShape(base, "size", { control: "pressure", jitter: 0.2 }), "shape")).toBe("Size 20% jitter, by pen pressure");
  });

  // Fails if the control list loses an entry the engine understands.
  it("the control list covers every dynamic control, Off first", () => {
    expect(CONTROL_OPTIONS.map((o) => o.value)).toEqual(["off", "pressure", "tilt", "rotation", "direction", "fade"]);
  });
});
