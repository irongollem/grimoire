/*
 * The shapes a described picture can take (#1176, "Describe it").
 *
 * The image model only paints three oblongs, so every shape is painted at the nearest one and cut to its
 * own proportions by a centred crop in the picture's recipe. The generated file stays untouched, which
 * keeps its AI mark and provenance true. Pure: no canvas, no network.
 */
import { AI_SIZES, nearestAiSize, type AiSize } from "@/scriptorium/illuminator/lib/aiPicture";
import type { CropStep } from "@/scriptorium/illuminator/lib/treatment";

export type DescribeShapeId = "page" | "tall" | "square" | "landscape" | "banner" | "column";

export interface DescribeShape {
  id: DescribeShapeId;
  label: string;
  /** Width over height of the picture as the book will show it. */
  aspect: number;
  /** The oblong painted, and so what the cost is for. */
  aiSize: AiSize;
  /** The centred cut that turns the painted oblong into this shape, or null when it is already that shape. */
  crop: CropStep | null;
}

const WHOLE = 0.9999;

function aspectOf(size: AiSize): number {
  const found = AI_SIZES.find((s) => s.size === size);
  if (!found) throw new Error(`Unknown size ${size}`);
  return found.width / found.height;
}

/** The centred part of a `painted` oblong that has the `target` proportions, as fractions of it. */
export function centredCrop(painted: number, target: number): CropStep | null {
  const w = target > painted ? 1 : target / painted;
  const h = target > painted ? painted / target : 1;
  if (w >= WHOLE && h >= WHOLE) return null;
  return { type: "crop", x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

function shape(id: DescribeShapeId, label: string, aspect: number): DescribeShape {
  const aiSize = nearestAiSize(aspect, 1);
  return { id, label, aspect, aiSize, crop: centredCrop(aspectOf(aiSize), aspect) };
}

/** The six shapes for a book whose page is `pageAspect` (width over height) wide. */
export function describeShapes(pageAspect: number): DescribeShape[] {
  return [
    shape("page", "Full page", pageAspect),
    shape("tall", "Tall", 2 / 3),
    shape("square", "Square", 1),
    shape("landscape", "Landscape", 3 / 2),
    shape("banner", "Wide banner", 3),
    shape("column", "Narrow column", 1 / 3),
  ];
}

export function shapeById(shapes: readonly DescribeShape[], id: string): DescribeShape | null {
  return shapes.find((s) => s.id === id) ?? null;
}
