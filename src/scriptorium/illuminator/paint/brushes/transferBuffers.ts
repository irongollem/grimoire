import type { ImportResult } from "../import/types";

/**
 * The pixel buffers of an import's pictures, each once. Presets that share a tip share its buffer, and a buffer
 * listed twice in a transfer makes `postMessage` throw, which in the worker would lose the whole import.
 */
export function transferBuffers(result: ImportResult): ArrayBuffer[] {
  const seen = new Set<ArrayBuffer>();
  for (const b of result.brushes) {
    if (b.tip) seen.add(b.tip.alpha.buffer as ArrayBuffer);
    if (b.grain) seen.add(b.grain.value.buffer as ArrayBuffer);
  }
  return [...seen];
}
