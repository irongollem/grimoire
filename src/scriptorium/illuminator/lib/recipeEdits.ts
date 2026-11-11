/*
 * Quick edits over a picture's recipe (#1176 story 9b, frame 11).
 *
 * The panel's Edges, Colour and Vignette groups never keep a second model of a
 * picture: each reads the recipe (IlluminateSettings) and returns a new one.
 * A style, a preset or a slider is only a way to write the same steps the
 * workbench writes, so a picture edited in the panel and then in the workbench
 * stays one recipe. Pure: no canvas, no DOM.
 *
 * How a panel choice maps onto steps:
 *  - Torn paper: an `edges` step, style "paper" (tornPaper.ts).
 *  - Torn (classic): an `edges` step, style "classic" with visible strokes.
 *  - Faded: the same classic step with the strokes smoothed out (variation 0),
 *    which is what a fade is in edgeTreatment.ts.
 *  - Straight: no `edges` step.
 *  - A colour preset: the `grade` step; the sliders move one value of it.
 *  - Vignette: the `vignette` step, its strength.
 */
import { DEFAULT_COLOUR_GRADING, GRADING_PRESETS, type ColourGradingOptions } from "./colourGrading";
import { DEFAULT_EDGE_OPTIONS, type EdgeOptions } from "./edgeTreatment";
import { DEFAULT_PAPER_SIDE, PAPER_SIDES, type PaperSide, type PaperSideOptions } from "./tornPaper";
import { DEFAULT_VIGNETTE } from "./vignette";
import {
  normaliseSettings,
  type ClassicEdgesStep,
  type EdgesStep,
  type GradeStep,
  type IlluminateSettings,
  type IlluminateStep,
  type PaperEdgesStep,
  type StepType,
  type VignetteStep,
} from "./treatment";

export type EdgeStyle = "paper" | "classic" | "faded" | "straight";
export const EDGE_STYLES: readonly { value: EdgeStyle; label: string }[] = [
  { value: "paper", label: "Torn paper" },
  { value: "classic", label: "Torn (classic)" },
  { value: "faded", label: "Faded" },
  { value: "straight", label: "Straight" },
];

/** The panel's starting values for a new torn-paper side, tuned against the prototype. */
export const PAPER_PANEL_SIDE: Omit<PaperSideOptions, "enabled"> = { roughness: 0.6, depth: 0.45, fibres: 0.55, shadow: 0.5 };
/** A fade is a smooth gradient: no visible strokes, a wide band and few hard edges. */
export const FADED_SIDE: Omit<EdgeOptions, "enabled"> = { roughness: 0.15, fadeWidth: 0.55, tearDepth: 0.3, passes: 8, variation: 0 };
/** Variation at or below this reads as a smooth fade rather than torn strokes. */
const FADE_VARIATION = 0.05;

export function emptySettings(seed: number = Math.floor(Math.random() * 1e9)): IlluminateSettings {
  return { v: 1, seed, steps: [] };
}

function stepOf<T extends IlluminateStep>(settings: IlluminateSettings | null, type: T["type"]): T | null {
  const found = settings?.steps.find((s) => s.type === type);
  return found ? (found as T) : null;
}

/** The recipe with one step set, replacing any of its type. */
export function withStep(settings: IlluminateSettings | null, step: IlluminateStep): IlluminateSettings {
  const base = settings ?? emptySettings();
  return normaliseSettings({ ...base, steps: [...base.steps.filter((s) => s.type !== step.type), step] });
}

export function withoutStep(settings: IlluminateSettings | null, type: StepType): IlluminateSettings {
  const base = settings ?? emptySettings();
  return { ...base, steps: base.steps.filter((s) => s.type !== type) };
}

// ─── Edges ──────────────────────────────────────────────────────────────────

const edgesOf = (s: IlluminateSettings | null) => stepOf<EdgesStep>(s, "edges");

export function edgeStyleOf(settings: IlluminateSettings | null): EdgeStyle {
  const edges = edgesOf(settings);
  if (!edges) return "straight";
  if (edges.style === "paper") return "paper";
  const active = PAPER_SIDES.map((side) => edges[side]).filter((o) => o.enabled);
  return active.length > 0 && active.every((o) => o.variation <= FADE_VARIATION) ? "faded" : "classic";
}

/** Which sides are torn or faded now. */
export function edgeSidesOf(settings: IlluminateSettings | null): Record<PaperSide, boolean> {
  const edges = edgesOf(settings);
  return {
    top: edges?.top.enabled ?? false,
    right: edges?.right.enabled ?? false,
    bottom: edges?.bottom.enabled ?? false,
    left: edges?.left.enabled ?? false,
  };
}

function paperStep(enabled: Record<PaperSide, boolean>, from: PaperEdgesStep | null): PaperEdgesStep {
  const side = (s: PaperSide): PaperSideOptions => ({ ...(from?.[s] ?? { ...DEFAULT_PAPER_SIDE, ...PAPER_PANEL_SIDE }), enabled: enabled[s] });
  return { type: "edges", style: "paper", top: side("top"), right: side("right"), bottom: side("bottom"), left: side("left") };
}

function classicStep(enabled: Record<PaperSide, boolean>, base: Omit<EdgeOptions, "enabled">, from: ClassicEdgesStep | null): ClassicEdgesStep {
  const side = (s: PaperSide): EdgeOptions => ({ ...(from?.[s] ?? { ...DEFAULT_EDGE_OPTIONS, ...base }), enabled: enabled[s] });
  return { type: "edges", style: "classic", top: side("top"), right: side("right"), bottom: side("bottom"), left: side("left") };
}

const ALL_SIDES: Record<PaperSide, boolean> = { top: true, right: true, bottom: true, left: true };

/** Choose an edge style. The sides already torn stay torn; a picture with none starts with all four. */
export function setEdgeStyle(settings: IlluminateSettings | null, style: EdgeStyle): IlluminateSettings {
  if (style === "straight") return withoutStep(settings, "edges");
  const had = edgeSidesOf(settings);
  const sides = Object.values(had).some(Boolean) ? had : ALL_SIDES;
  const current = edgesOf(settings);
  if (style === edgeStyleOf(settings)) return settings ?? emptySettings();
  if (style === "paper") return withStep(settings, paperStep(sides, current?.style === "paper" ? current : null));
  if (style === "faded") return withStep(settings, classicStep(sides, FADED_SIDE, null));
  // Classic keeps its own values when it is what was there (a Faded recipe is classic too, but smooth).
  return withStep(settings, classicStep(sides, DEFAULT_EDGE_OPTIONS, null));
}

/** Tear or keep one side. With no side left torn there is no edges step at all. */
export function toggleEdgeSide(settings: IlluminateSettings | null, side: PaperSide): IlluminateSettings {
  const style = edgeStyleOf(settings);
  const sides = { ...edgeSidesOf(settings), [side]: !edgeSidesOf(settings)[side] };
  if (!Object.values(sides).some(Boolean)) return withoutStep(settings, "edges");
  const current = edgesOf(settings);
  if (style === "straight" || !current) return withStep(settings, paperStep({ top: false, right: false, bottom: false, left: false, [side]: true }, null));
  if (current.style === "paper") return withStep(settings, paperStep(sides, current));
  return withStep(settings, classicStep(sides, style === "faded" ? FADED_SIDE : DEFAULT_EDGE_OPTIONS, current));
}

export type EdgeSlider = "roughness" | "depth" | "fibres" | "shadow";

/** The slider names a style offers; Depth is how far the tear reaches, or how wide the fade is. */
export function edgeSlidersFor(style: EdgeStyle): readonly EdgeSlider[] {
  if (style === "paper") return ["roughness", "depth", "fibres", "shadow"];
  if (style === "straight") return [];
  return ["roughness", "depth"];
}

/** The value a slider shows: the first torn side's, since the panel sets all torn sides together. */
export function edgeSliderValue(settings: IlluminateSettings | null, slider: EdgeSlider): number {
  const edges = edgesOf(settings);
  const first = edges ? PAPER_SIDES.map((s) => edges[s]).find((o) => o.enabled) : undefined;
  if (!edges || !first) return 0;
  if (edges.style === "paper") return (first as PaperSideOptions)[slider];
  const o = first as EdgeOptions;
  if (slider === "roughness") return o.roughness;
  return edgeStyleOf(settings) === "faded" ? o.fadeWidth : o.tearDepth;
}

/** Move one slider on every torn side. */
export function setEdgeSlider(settings: IlluminateSettings | null, slider: EdgeSlider, value: number): IlluminateSettings {
  const edges = edgesOf(settings);
  if (!edges) return settings ?? emptySettings();
  if (edges.style === "paper") {
    const side = (o: PaperSideOptions): PaperSideOptions => (o.enabled ? { ...o, [slider]: value } : o);
    return withStep(settings, { ...edges, top: side(edges.top), right: side(edges.right), bottom: side(edges.bottom), left: side(edges.left) });
  }
  const field = slider === "roughness" ? "roughness" : edgeStyleOf(settings) === "faded" ? "fadeWidth" : "tearDepth";
  const side = (o: EdgeOptions): EdgeOptions => (o.enabled ? { ...o, [field]: value } : o);
  return withStep(settings, { ...edges, top: side(edges.top), right: side(edges.right), bottom: side(edges.bottom), left: side(edges.left) });
}

// ─── Colour ─────────────────────────────────────────────────────────────────

export type ColourPreset = "none" | "Sepia" | "Moonlit" | "Vivid" | "Ink sketch";
export const COLOUR_PRESETS: readonly { value: ColourPreset; label: string }[] = [
  { value: "none", label: "As painted" },
  ...GRADING_PRESETS.map((p) => ({ value: p.label as ColourPreset, label: p.label })),
];

const gradeOf = (s: IlluminateSettings | null) => stepOf<GradeStep>(s, "grade");

/** The preset the colour is on. The Warmth and Contrast sliders move a preset without leaving it, so only the other three values name it. */
export function colourPresetOf(settings: IlluminateSettings | null): ColourPreset | "custom" {
  const grade = gradeOf(settings);
  if (!grade) return "none";
  const o = grade.options;
  const match = GRADING_PRESETS.find((p) => p.values.brightness === o.brightness && p.values.saturation === o.saturation && p.values.hue === o.hue);
  return match ? (match.label as ColourPreset) : "custom";
}

/** "custom" is only ever read (a hand-made grade); choosing it changes nothing. */
export function setColourPreset(settings: IlluminateSettings | null, preset: ColourPreset | "custom"): IlluminateSettings {
  if (preset === "none") return withoutStep(settings, "grade");
  const found = GRADING_PRESETS.find((p) => p.label === preset);
  if (!found) return settings ?? emptySettings();
  return withStep(settings, { type: "grade", options: { ...found.values } });
}

export type GradeSlider = "temperature" | "contrast";

export function gradeValue(settings: IlluminateSettings | null, slider: GradeSlider): number {
  return gradeOf(settings)?.options[slider] ?? DEFAULT_COLOUR_GRADING[slider];
}

/** Move Warmth or Contrast. Back to neutral on a picture with no other grading removes the step. */
export function setGradeValue(settings: IlluminateSettings | null, slider: GradeSlider, value: number): IlluminateSettings {
  const options = { ...(gradeOf(settings)?.options ?? DEFAULT_COLOUR_GRADING), [slider]: value };
  const neutral = (Object.keys(DEFAULT_COLOUR_GRADING) as (keyof ColourGradingOptions)[]).every((k) => options[k] === DEFAULT_COLOUR_GRADING[k]);
  return neutral ? withoutStep(settings, "grade") : withStep(settings, { type: "grade", options });
}

// ─── Vignette ───────────────────────────────────────────────────────────────

export function vignetteStrength(settings: IlluminateSettings | null): number {
  return stepOf<VignetteStep>(settings, "vignette")?.options.strength ?? 0;
}

/** Zero is no vignette at all, so a picture with no darkening carries no step. */
export function setVignetteStrength(settings: IlluminateSettings | null, strength: number): IlluminateSettings {
  if (strength <= 0) return withoutStep(settings, "vignette");
  const { enabled: _enabled, ...defaults } = DEFAULT_VIGNETTE;
  const current = stepOf<VignetteStep>(settings, "vignette");
  return withStep(settings, { type: "vignette", options: { ...(current?.options ?? defaults), strength } });
}
