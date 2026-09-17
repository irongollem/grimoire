/**
 * Pure builder for the tile generator's `AiProvenance` record — colocated
 * (rather than living inline in index.ts) so it can be unit-tested without
 * pulling in Deno's `serve`/`createClient` runtime, which vitest cannot load.
 *
 * Every tile-pack slot shares the same `generatorType` — this pipeline mints
 * one asset kind ("tile") regardless of which slot/category it is for — and
 * this function is openai-only today (`generateSlot` in index.ts only ever
 * resolves an OpenAI key), so `provider`/`model` are effectively constant
 * too. Still threaded through as parameters rather than hardcoded here: they
 * come from the actual provider response (`ImageGenResult.usage.provider`)
 * and the generator's `MODEL` constant, so this stays correct if either ever
 * changes without this file needing to know why.
 */
import type { AiProvenance } from "../_shared/provenance/types.ts";

export function buildTileProvenance(provider: string, model: string, generatedAt: string = new Date().toISOString()): AiProvenance {
  return {
    generatorType: "tile",
    provider,
    model,
    generatedAt,
    edited: false,
  };
}
