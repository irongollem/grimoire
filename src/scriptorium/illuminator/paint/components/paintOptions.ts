/*
 * The options bar's values for the armed tool (#1181): an override the bar set, else the brush's own. Size is
 * in document pixels, the rest are 0 to 1 fractions. Pure, so the rule "a set override wins" has one home.
 */
import type { BrushPreset } from "../engine/types";
import type { PaintTool, ToolOverrides } from "../session/types";

export interface OptionValues {
  size: number;
  opacity: number;
  flow: number;
  smoothing: number;
}

export function effectiveValues(brush: BrushPreset, overrides: ToolOverrides): OptionValues {
  return {
    size: overrides.size ?? brush.tip.size,
    opacity: overrides.opacity ?? brush.transfer.opacity,
    flow: overrides.flow ?? brush.transfer.flow,
    smoothing: brush.smoothing,
  };
}

/** The outline the stage draws under the pen, in document pixels. */
export function cursorOf(brush: BrushPreset, overrides: ToolOverrides, tool: PaintTool): { size: number; angle: number; roundness: number } | null {
  if (tool === "picker") return null;
  return { size: overrides.size ?? brush.tip.size, angle: brush.tip.angle, roundness: brush.tip.roundness };
}

