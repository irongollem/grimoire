/*
 * Which fields the options bar shows for the armed tool (#1181). The picker has no size, flow or smoothing:
 * it only reads a colour, so it shows a hint instead of controls that would do nothing.
 */
import type { PaintTool } from "../session/types";

export type OptionField = "mode" | "size" | "opacity" | "flow" | "smoothing";

export const TOOL_LABEL: Record<PaintTool, string> = { brush: "Brush", smudge: "Smudge", eraser: "Eraser", picker: "Colour picker" };

const FIELDS: Record<PaintTool, readonly OptionField[]> = {
  brush: ["mode", "size", "opacity", "flow", "smoothing"],
  // Smudge always mixes, so it has no blend mode.
  smudge: ["size", "opacity", "flow", "smoothing"],
  // An eraser's mode is "clear"; there is nothing to pick.
  eraser: ["size", "opacity", "flow", "smoothing"],
  picker: [],
};

export function visibleFields(tool: PaintTool): readonly OptionField[] {
  return FIELDS[tool];
}

export const PICKER_HINT = "Click to take a colour; Alt does it while painting.";

export const BRUSH_MODES = [
  { value: "normal", label: "Normal" },
  { value: "multiply", label: "Multiply" },
  { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" },
  { value: "soft-light", label: "Soft light" },
  { value: "colour", label: "Colour" },
  { value: "behind", label: "Behind" },
  { value: "clear", label: "Clear" },
] as const;

export const LAYER_BLENDS = [
  { value: "source-over", label: "Normal" },
  { value: "multiply", label: "Multiply" },
  { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" },
  { value: "soft-light", label: "Soft light" },
  { value: "color", label: "Colour" },
] as const;
