import type { BrushPreset, DynamicControl, Varied } from "../engine/types";

export function varied(jitter = 0, control: DynamicControl = "off", minimum = 0): Varied {
  return { jitter, control, minimum };
}

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** A plain round brush; each importer overwrites what its file says. */
export function newBrush(index: number, name: string): BrushPreset {
  return {
    v: 1,
    id: `import:${index}`,
    name,
    group: "yours",
    tip: {
      source: { kind: "round", hardness: 0.8 },
      size: 24,
      angle: 0,
      roundness: 1,
      spacing: 0.1,
      flipX: false,
      flipY: false,
      followDirection: false,
    },
    shape: null,
    scatter: null,
    grain: null,
    transfer: { flow: 1, opacity: 1, flowDynamics: varied(), opacityDynamics: varied() },
    wetEdges: false,
    wetMix: null,
    colour: null,
    smoothing: 0.1,
    blend: "normal",
    fadeLength: 800,
  };
}

export const tipId = (index: number): string => `import:${index}:tip`;
export const grainId = (index: number): string => `import:${index}:grain`;
