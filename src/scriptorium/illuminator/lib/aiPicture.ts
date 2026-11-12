/*
 * The geometry of an AI picture action (#1176 story 10). Pure: no canvas, no network.
 *
 * The server takes one of three oblongs. The client downsizes the picture so its long edge is at most
 * MAX_SEND_EDGE and names the nearest oblong. Extending to the page edge instead pads the picture onto a
 * transparent canvas of a chosen oblong, the picture kept away from the edge it grows toward, and sends a
 * mask whose transparent pixels are the padding.
 */

export type AiSize = "1024x1024" | "1536x1024" | "1024x1536";
export type PageEdge = "top" | "right" | "bottom" | "left";

export const AI_SIZES: readonly { size: AiSize; width: number; height: number }[] = [
  { size: "1024x1024", width: 1024, height: 1024 },
  { size: "1536x1024", width: 1536, height: 1024 },
  { size: "1024x1536", width: 1024, height: 1536 },
];

/** Long edge a picture is sent at: the largest oblong's. */
export const MAX_SEND_EDGE = 1536;

export interface Box { x: number; y: number; width: number; height: number }

/** The oblong whose shape is nearest the picture's, comparing ratios on a log scale so 2:1 and 1:2 weigh alike. */
export function nearestAiSize(width: number, height: number): AiSize {
  const ratio = Math.log(width / height);
  let best = AI_SIZES[0];
  for (const candidate of AI_SIZES) {
    if (Math.abs(Math.log(candidate.width / candidate.height) - ratio) < Math.abs(Math.log(best.width / best.height) - ratio)) best = candidate;
  }
  return best.size;
}

/** The size a picture is drawn at to be sent: its own shape, long edge capped at `maxEdge`. */
export function sendDimensions(natural: { width: number; height: number }, maxEdge: number = MAX_SEND_EDGE): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(natural.width, natural.height));
  return { width: Math.max(1, Math.round(natural.width * scale)), height: Math.max(1, Math.round(natural.height * scale)) };
}

export function dimensionsOf(size: AiSize): { width: number; height: number } {
  const found = AI_SIZES.find((s) => s.size === size);
  if (!found) throw new Error(`Unknown size ${size}`);
  return { width: found.width, height: found.height };
}

export interface ExtendLayout {
  size: AiSize;
  /** The canvas sent: the picture on a transparent field. */
  canvas: { width: number; height: number };
  /** Where the picture sits on it; everything outside is the margin to invent. */
  picture: Box;
}

/**
 * Where a picture goes to grow toward a page edge, or null when it already fills the shape that edge needs
 * (a picture wider than 3:2 cannot grow sideways, one taller than 2:3 cannot grow up or down).
 * Sideways grows into the landscape oblong with the picture the full height; up or down into the portrait one
 * with the picture the full width. The picture sits on the side away from the edge.
 */
export function extendLayout(natural: { width: number; height: number }, edge: PageEdge): ExtendLayout | null {
  const aspect = natural.width / natural.height;
  const sideways = edge === "left" || edge === "right";
  const size: AiSize = sideways ? "1536x1024" : "1024x1536";
  const canvas = dimensionsOf(size);
  const width = sideways ? Math.round(canvas.height * aspect) : canvas.width;
  const height = sideways ? canvas.height : Math.round(canvas.width / aspect);
  // Under 4 px of margin is nothing to paint.
  if (sideways ? canvas.width - width < 4 : canvas.height - height < 4) return null;
  const x = edge === "right" ? 0 : edge === "left" ? canvas.width - width : 0;
  const y = edge === "bottom" ? 0 : edge === "top" ? canvas.height - height : 0;
  return { size, canvas, picture: { x, y, width, height } };
}
