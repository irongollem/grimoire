/**
 * Gemini's own supported `imageConfig.aspectRatio` values (verified against
 * Google's Gemini API image-generation docs, 26 Sep 2026) and the
 * nearest-match chooser for them. Shared between the edge function
 * (`imageGen.ts`'s `sizeToAspect`, and `style-map/index.ts`'s server-side
 * validation) and the client (`src/cartographer/bake.ts`, fitting the AI
 * styler's input to whatever bucket the request will actually land on) via
 * the `@edge-shared` alias — one source of truth rather than two copies
 * that can drift, the same pattern `provenance/mark.ts` already uses across
 * this boundary. Deliberately tiny and free of secrets/network calls, since
 * unlike most of this directory it also ships in the browser bundle.
 */
export interface GeminiAspectRatio {
  label: string;
  ratio: number;
}

export const GEMINI_ASPECT_RATIOS: readonly GeminiAspectRatio[] = [
  { label: "1:1", ratio: 1 },
  { label: "3:2", ratio: 3 / 2 },
  { label: "2:3", ratio: 2 / 3 },
  { label: "3:4", ratio: 3 / 4 },
  { label: "4:3", ratio: 4 / 3 },
  { label: "4:5", ratio: 4 / 5 },
  { label: "5:4", ratio: 5 / 4 },
  { label: "9:16", ratio: 9 / 16 },
  { label: "16:9", ratio: 16 / 9 },
  { label: "21:9", ratio: 21 / 9 },
];

/**
 * The nearest Gemini aspect-ratio bucket to `width/height`, by log-space
 * distance (`Math.log(requested / candidate.ratio)`) rather than plain
 * linear difference — a ratio twice as wide as a bucket and one twice as
 * tall are equally far from it under this metric; a linear one would favor
 * wide buckets over tall ones at the same proportional distance.
 */
export function nearestGeminiAspect(width: number, height: number): GeminiAspectRatio {
  const requested = width > 0 && height > 0 ? width / height : 1;
  let best = GEMINI_ASPECT_RATIOS[0];
  let bestDistance = Infinity;
  for (const candidate of GEMINI_ASPECT_RATIOS) {
    const distance = Math.abs(Math.log(requested / candidate.ratio));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/** How far (the same log-space distance `nearestGeminiAspect` uses) a
 *  request's aspect may sit from its nearest bucket and still count as
 *  "padded to a Gemini ratio". Wide enough to absorb the independent
 *  per-edge multiple-of-16 rounding a sender applies after padding to an
 *  exact ratio (a few pixels of drift on a >1000px edge is nowhere near
 *  this), narrow enough to still reject an aspect that was never padded to
 *  any bucket at all — adjacent buckets sit at least ~0.1 apart in this
 *  metric. */
const ASPECT_TOLERANCE = 0.05;

/**
 * Whether `width x height`'s aspect ratio is close enough to one of
 * Gemini's own supported buckets to have plausibly been padded to it —
 * `style-map/index.ts`'s server-side check that a Gemini-bound upload
 * actually is what the client claims, rather than an arbitrary ratio.
 */
export function isValidGeminiAspectRatio(width: number, height: number): boolean {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return false;
  const requested = width / height;
  return GEMINI_ASPECT_RATIOS.some(
    (candidate) => Math.abs(Math.log(requested / candidate.ratio)) <= ASPECT_TOLERANCE,
  );
}
