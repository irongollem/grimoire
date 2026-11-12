import { STOCK_PAPERS } from "@/scriptorium/papers/papers";
import type {
  BrushPreset,
  ColourDynamics,
  DynamicControl,
  Grain,
  Scatter,
  ShapeDynamics,
  TipSettings,
  Transfer,
  Varied,
  WetMix,
} from "../engine/types";

/** What can drive a value, in the words the panel shows. */
export const CONTROL_OPTIONS: ReadonlyArray<{ value: DynamicControl; label: string }> = [
  { value: "off", label: "Off" },
  { value: "pressure", label: "Pen pressure" },
  { value: "tilt", label: "Pen tilt" },
  { value: "rotation", label: "Pen rotation" },
  { value: "direction", label: "Stroke direction" },
  { value: "fade", label: "Fade" },
];

export const GRAIN_MODES: ReadonlyArray<{ value: Grain["mode"]; label: string }> = [
  { value: "paper", label: "Stays on the paper" },
  { value: "moving", label: "Moves with the stroke" },
];

/** The sections that can be switched off, with what switching one on starts from. */
export type OptionalSection = "shape" | "scatter" | "grain" | "wetMix" | "colour";

const off = (): Varied => ({ jitter: 0, control: "off", minimum: 0 });

const DEFAULTS: {
  shape: () => ShapeDynamics;
  scatter: () => Scatter;
  grain: () => Grain;
  wetMix: () => WetMix;
  colour: () => ColourDynamics;
} = {
  shape: () => ({ size: off(), angle: off(), roundness: off() }),
  scatter: () => ({ amount: 0.3, bothAxes: true, count: 1, countJitter: 0 }),
  grain: () => ({ id: STOCK_PAPERS[0]?.grainId ?? "cold-press", scale: 1, depth: 0.4, mode: "paper" }),
  wetMix: () => ({ dilution: 0.3, charge: 1, pull: 0.3 }),
  colour: () => ({ hue: 0.05, saturation: 0.1, value: 0.1 }),
};

/** Switches a section on (to its starting values) or off (to null), leaving the rest untouched. */
export function withSection(brush: BrushPreset, section: OptionalSection, on: boolean): BrushPreset {
  if (on === (brush[section] !== null)) return brush;
  return { ...brush, [section]: on ? DEFAULTS[section]() : null };
}

export function withTip(brush: BrushPreset, patch: Partial<TipSettings>): BrushPreset {
  return { ...brush, tip: { ...brush.tip, ...patch } };
}

export type ShapeKey = keyof ShapeDynamics;

export function withShape(brush: BrushPreset, key: ShapeKey, patch: Partial<Varied>): BrushPreset {
  const shape = brush.shape ?? DEFAULTS.shape();
  return { ...brush, shape: { ...shape, [key]: { ...shape[key], ...patch } } };
}

export function withScatter(brush: BrushPreset, patch: Partial<Scatter>): BrushPreset {
  return { ...brush, scatter: { ...(brush.scatter ?? DEFAULTS.scatter()), ...patch } };
}

export function withGrain(brush: BrushPreset, patch: Partial<Grain>): BrushPreset {
  return { ...brush, grain: { ...(brush.grain ?? DEFAULTS.grain()), ...patch } };
}

export function withTransfer(brush: BrushPreset, patch: Partial<Pick<Transfer, "flow" | "opacity">>): BrushPreset {
  return { ...brush, transfer: { ...brush.transfer, ...patch } };
}

export function withTransferDynamics(brush: BrushPreset, key: "flowDynamics" | "opacityDynamics", patch: Partial<Varied>): BrushPreset {
  return { ...brush, transfer: { ...brush.transfer, [key]: { ...brush.transfer[key], ...patch } } };
}

export function withWetMix(brush: BrushPreset, patch: Partial<WetMix>): BrushPreset {
  return { ...brush, wetMix: { ...(brush.wetMix ?? DEFAULTS.wetMix()), ...patch } };
}

export function withColour(brush: BrushPreset, patch: Partial<ColourDynamics>): BrushPreset {
  return { ...brush, colour: { ...(brush.colour ?? DEFAULTS.colour()), ...patch } };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const controlLabel = (c: DynamicControl) => CONTROL_OPTIONS.find((o) => o.value === c)?.label.toLowerCase() ?? c;

/** One line saying what a section is doing now, shown beside its name when it is closed. */
export function sectionSummary(brush: BrushPreset, section: keyof SectionSummaries): string {
  return SUMMARIES[section](brush);
}

type SectionSummaries = typeof SUMMARIES;

function variedPart(name: string, v: Varied): string | null {
  const bits: string[] = [];
  if (v.jitter > 0) bits.push(`${pct(v.jitter)} jitter`);
  if (v.control !== "off") bits.push(`by ${controlLabel(v.control)}`);
  return bits.length ? `${name} ${bits.join(", ")}` : null;
}

const SUMMARIES = {
  tip: (b: BrushPreset) => {
    const kind = b.tip.source.kind === "round" ? (b.tip.source.hardness >= 0.75 ? "Hard round" : "Soft round") : "Image tip";
    return `${kind}, ${Math.round(b.tip.size)} px, spacing ${pct(b.tip.spacing)}`;
  },
  shape: (b: BrushPreset) => {
    if (!b.shape) return "Every dab is the tip as set";
    const parts = [variedPart("Size", b.shape.size), variedPart("Angle", b.shape.angle), variedPart("Roundness", b.shape.roundness)];
    return parts.filter((p): p is string => p !== null).join("; ") || "Nothing varies yet";
  },
  scatter: (b: BrushPreset) =>
    b.scatter
      ? `${pct(b.scatter.amount)} ${b.scatter.bothAxes ? "both ways" : "across"}, ${b.scatter.count} ${b.scatter.count === 1 ? "dab" : "dabs"} a step`
      : "Dabs sit on the path",
  grain: (b: BrushPreset) =>
    b.grain ? `Depth ${pct(b.grain.depth)}, ${b.grain.mode === "paper" ? "stays on the paper" : "moves with the stroke"}` : "Paint lies smooth",
  wetEdges: (b: BrushPreset) => (b.wetEdges ? "Paint pools at the edge" : "Edges stay even"),
  transfer: (b: BrushPreset) => `Flow ${pct(b.transfer.flow)}, opacity ${pct(b.transfer.opacity)}`,
  wetMix: (b: BrushPreset) =>
    b.wetMix ? `Dilution ${pct(b.wetMix.dilution)}, charge ${pct(b.wetMix.charge)}, pull ${pct(b.wetMix.pull)}` : "Colours do not mix",
  colour: (b: BrushPreset) =>
    b.colour ? `Hue ${pct(b.colour.hue)}, saturation ${pct(b.colour.saturation)}, value ${pct(b.colour.value)}` : "Every dab is the chosen colour",
  smoothing: (b: BrushPreset) => (b.smoothing === 0 ? "Follows the pen exactly" : `Steadies the line ${pct(b.smoothing)}`),
};

/** The stock tips offered in the tip grid: id and the name under it. The round tip is a computed one. */
export const TIP_CHOICES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "round", label: "Round" },
  { id: "soft-round", label: "Soft round" },
  { id: "round-wet", label: "Wet round" },
  { id: "flat-bristle", label: "Flat bristle" },
  { id: "dry-comb", label: "Dry comb" },
  { id: "sponge", label: "Sponge" },
  { id: "charcoal", label: "Charcoal" },
  { id: "ink-round", label: "Ink round" },
];

/** The tip a grid cell stands for; "round" keeps its hardness if the brush already had a round tip. */
export function tipSourceFor(brush: BrushPreset, id: string): TipSettings["source"] {
  if (id !== "round") return { kind: "image", id };
  return brush.tip.source.kind === "round" ? brush.tip.source : { kind: "round", hardness: 1 };
}

/** Which grid cell the brush's tip is. */
export function selectedTipId(brush: BrushPreset): string {
  return brush.tip.source.kind === "round" ? "round" : brush.tip.source.id;
}

/** The grain choices: the paper grains by their paper's name. */
export const GRAIN_CHOICES: ReadonlyArray<{ id: string; label: string }> = STOCK_PAPERS.map((p) => ({ id: p.grainId, label: p.name }));
