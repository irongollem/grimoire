/**
 * Single provenance shape for AI-generated/assisted content (EU AI Act Art
 * 50(2) — machine-readable disclosure of AI-generated or manipulated
 * content; see context/compliance/provenance-architecture.md, issues
 * #605/#606).
 *
 * One `AiProvenance` object is the source of truth for three otherwise-
 * disconnected surfaces:
 *  - persisted verbatim into the `ai_provenance jsonb` column on every
 *    content table that stores generator output (npcs, monsters, items, …);
 *  - the input to `buildXmpPacket` (xmp.ts), embedded into generated image
 *    bytes (embed.ts) before upload, so the mark survives export/download/
 *    reshare independent of the DB row;
 *  - read back by the `AiGeneratedBadge` UI component to render the
 *    disclosure wherever a viewer isn't the generator.
 *
 * There is exactly one shape for all three uses on purpose: a second shape
 * for e.g. the DB column would drift from what the badge or the XMP packet
 * expects, and drift here is a compliance gap, not just a bug.
 */
export interface AiProvenance {
  /** Which generator produced this, e.g. "npc", "monster-portrait", "chronicle-recap" — free-form, one value per generator surface. */
  generatorType: string;
  /** AI provider, e.g. "openai", "google", "anthropic". */
  provider: string;
  /** Provider-reported model id, e.g. "gpt-image-1", "gemini-2.5-flash-image". */
  model: string;
  /** ISO 8601 timestamp of generation. */
  generatedAt: string;
  /**
   * Flips true on a material human edit made after generation. Never
   * reverts to false, and the record itself is never deleted — the
   * campaign's "no AI" toggle stops new marking, it does not unlabel
   * history (architecture doc §3).
   */
  edited: boolean;
}
