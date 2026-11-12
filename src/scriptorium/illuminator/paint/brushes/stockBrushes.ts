import type { BrushGroup, BrushPreset, TipSource, Varied } from "../engine/types";

/*
 * The stock brushes (#1181), tuned on the prototype engine. Image tips and the paper grain are
 * app art: these are art paths, and whatever fetches them must pass them through `artUrl()`
 * (production serves art only from the CDN).
 */

const STOCK_TIP_IDS = ["round-wet", "flat-bristle", "dry-comb", "sponge", "charcoal", "ink-round", "soft-round"] as const;

export const STOCK_TIP_PATHS: Readonly<Record<string, string>> = Object.fromEntries(
  STOCK_TIP_IDS.map((id) => [id, `/assets/paintbox/tips/${id}.webp`]),
);


const FADE_LENGTH = 800;

function varied(jitter = 0, control: Varied["control"] = "off", minimum = 0): Varied {
  return { jitter, control, minimum };
}

interface Spec {
  id: string;
  name: string;
  group: BrushGroup;
  source: TipSource;
  size: number;
  spacing: number;
  flow: number;
  flowControl?: Varied["control"];
  sizeVaried?: Varied;
  angleJitter?: number;
  followDirection?: boolean;
  angle?: number;
  scatter?: number;
  grainDepth?: number;
  wetEdges?: boolean;
  blend?: BrushPreset["blend"];
  smoothing?: number;
}

function brush(s: Spec): BrushPreset {
  return {
    v: 1,
    id: s.id,
    name: s.name,
    group: s.group,
    tip: {
      source: s.source,
      size: s.size,
      angle: s.angle ?? 0,
      roundness: 1,
      spacing: s.spacing,
      flipX: false,
      flipY: false,
      followDirection: s.followDirection ?? false,
    },
    shape: {
      size: s.sizeVaried ?? varied(),
      angle: varied(s.angleJitter ?? 0),
      roundness: varied(),
    },
    scatter: s.scatter === undefined ? null : { amount: s.scatter, bothAxes: true, count: 1, countJitter: 0 },
    grain: s.grainDepth === undefined ? null : { id: "cold-press", scale: 1, depth: s.grainDepth, mode: "paper" },
    transfer: { flow: s.flow, opacity: 1, flowDynamics: varied(0, s.flowControl ?? "off"), opacityDynamics: varied() },
    wetEdges: s.wetEdges ?? false,
    wetMix: null,
    colour: null,
    smoothing: s.smoothing ?? 0.1,
    blend: s.blend ?? "normal",
    fadeLength: FADE_LENGTH,
  };
}

const image = (id: string): TipSource => ({ kind: "image", id });

export const STOCK_BRUSHES: readonly BrushPreset[] = [
  brush({
    id: "round-wash",
    name: "Round wash",
    group: "watercolour",
    source: image("soft-round"),
    size: 80,
    spacing: 0.04,
    flow: 0.1,
    flowControl: "pressure",
    angleJitter: 1,
    sizeVaried: varied(0.12, "pressure", 0.5),
    wetEdges: true,
    grainDepth: 0.35,
    blend: "multiply",
  }),
  brush({
    id: "flat-bristle",
    name: "Flat bristle",
    group: "bristle",
    source: image("flat-bristle"),
    size: 95,
    spacing: 0.025,
    flow: 0.35,
    flowControl: "pressure",
    followDirection: true,
    angle: 90,
    sizeVaried: varied(0, "pressure", 0.5),
    grainDepth: 0.15,
  }),
  brush({
    id: "dry-brush",
    name: "Dry brush",
    group: "dry",
    source: image("dry-comb"),
    size: 120,
    spacing: 0.01,
    flow: 0.75,
    followDirection: true,
    angle: 90,
    sizeVaried: varied(0.08, "pressure", 0.6),
    grainDepth: 0.35,
  }),
  brush({
    id: "sea-sponge",
    name: "Sea sponge",
    group: "texture",
    source: image("sponge"),
    size: 70,
    spacing: 0.35,
    flow: 0.6,
    angleJitter: 1,
    scatter: 0.25,
    sizeVaried: varied(0.3, "off", 0.5),
  }),
  brush({
    id: "charcoal",
    name: "Charcoal",
    group: "dry",
    source: image("charcoal"),
    size: 38,
    spacing: 0.08,
    flow: 0.35,
    flowControl: "pressure",
    angleJitter: 1,
    sizeVaried: varied(0, "pressure", 0.3),
    grainDepth: 0.6,
  }),
  brush({
    id: "ink-round",
    name: "Ink round",
    group: "ink",
    source: image("ink-round"),
    size: 26,
    spacing: 0.04,
    flow: 1,
    sizeVaried: varied(0, "pressure", 0.08),
    smoothing: 0.2,
  }),
  brush({
    id: "hard-round",
    name: "Hard round",
    group: "basic",
    source: { kind: "round", hardness: 0.9 },
    size: 30,
    spacing: 0.1,
    flow: 1,
    sizeVaried: varied(0, "pressure", 0),
  }),
  brush({
    id: "soft-round",
    name: "Soft round",
    group: "basic",
    source: { kind: "round", hardness: 0 },
    size: 60,
    spacing: 0.1,
    flow: 1,
    sizeVaried: varied(0, "pressure", 0.2),
  }),
  brush({
    id: "soft-airbrush",
    name: "Soft airbrush",
    group: "basic",
    source: { kind: "round", hardness: 0 },
    size: 200,
    spacing: 0.1,
    flow: 0.08,
    flowControl: "pressure",
  }),
  brush({
    id: "wet-stipple",
    name: "Wet stipple",
    group: "texture",
    source: image("round-wet"),
    size: 40,
    // Wide, so the tip's dark rim never chains into rings.
    spacing: 0.8,
    flow: 0.7,
    angleJitter: 1,
    scatter: 0.3,
  }),
];
