import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import type { AiProvenance } from "@/ai/provenance";
import type { RulesetKey } from "@/types/ruleset.types";
import { FEATURE_TYPES, type ClassFeatureInsert, type FeatureType } from "@/types/feature.types";

/** What `generate-entity-text` returns for the `class_feature` generator (untrusted). */
export interface FeatureAiResult {
  name?: unknown;
  description?: unknown;
  feature_type?: unknown;
  prerequisite?: unknown;
  tags?: unknown;
  ai_provenance?: AiProvenance;
}

export interface FeatureDraftContext {
  ruleset: RulesetKey;
  campaignId: string | null;
}

/** A feature written for a class or subclass: which level grants it, and the row to create. */
export interface LevelledFeatureDraft {
  level: number;
  insert: ClassFeatureInsert;
}

const MAX_TAGS = 6;

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function textOrNull(v: unknown): string | null {
  return text(v) || null;
}

/** Whole numbers only; accepts numeric strings because models quote numbers. */
export function wholeNumber(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;
}

export function stringList(v: unknown, max: number, maxLength = 80): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of v) {
    const t = text(item).slice(0, maxLength);
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Unknown or missing feature types read as a passive feature. */
export function featureTypeFrom(raw: unknown): FeatureType {
  const key = text(raw).toLowerCase().replace(/[\s-]+/g, "_");
  return FEATURE_TYPES.find((t) => t === key) ?? "passive";
}

/** One feature row, or null when the model gave no usable name and rules text. */
export function featureInsertFromAi(ai: FeatureAiResult, ctx: FeatureDraftContext): ClassFeatureInsert | null {
  const name = text(ai.name).slice(0, 120);
  const description = text(ai.description);
  if (!name || !description) return null;
  return {
    name,
    description: toTiptapJson(description),
    feature_type: featureTypeFrom(ai.feature_type),
    source: "Grimoire:AI",
    prerequisite: textOrNull(ai.prerequisite),
    tags: stringList(ai.tags, MAX_TAGS, 40).map((t) => t.toLowerCase()),
    open5e_import: false,
    ruleset: ctx.ruleset,
    campaign_id: ctx.campaignId,
    ai_provenance: ai.ai_provenance ?? null,
  };
}

export interface LevelledFeatureOptions {
  /** When set, features at any other level are dropped. */
  allowedLevels?: readonly number[];
  maxPerLevel: number;
  maxTotal: number;
}

/**
 * The `features: [{level, name, feature_type, description}]` list of a class or
 * subclass. Levels outside 1-20 (or outside `allowedLevels`) are dropped, a
 * feature repeated at a level is dropped, and the result is ordered by level so
 * the created rows read in the order the character gains them.
 */
export function levelledFeaturesFromAi(
  raw: unknown,
  provenance: AiProvenance | undefined,
  ctx: FeatureDraftContext,
  opts: LevelledFeatureOptions,
): LevelledFeatureDraft[] {
  if (!Array.isArray(raw)) return [];
  const perLevel = new Map<number, Set<string>>();
  const out: LevelledFeatureDraft[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const level = wholeNumber(item.level);
    if (level === null || level < 1 || level > 20) continue;
    if (opts.allowedLevels && !opts.allowedLevels.includes(level)) continue;
    const insert = featureInsertFromAi({ ...item, ai_provenance: provenance }, ctx);
    if (!insert) continue;
    const seen = perLevel.get(level) ?? new Set<string>();
    const key = insert.name.toLowerCase();
    if (seen.has(key) || seen.size >= opts.maxPerLevel) continue;
    seen.add(key);
    perLevel.set(level, seen);
    out.push({ level, insert });
  }
  return out
    .map((draft, index) => ({ draft, index }))
    .sort((a, b) => a.draft.level - b.draft.level || a.index - b.index)
    .slice(0, opts.maxTotal)
    .map(({ draft }) => draft);
}

/** `{ "3": [id, id], "7": [id] }` from drafts and the ids their rows were created with, in the same order. */
export function featureIdsByLevel(
  drafts: readonly LevelledFeatureDraft[],
  ids: readonly string[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  drafts.forEach((draft, index) => {
    const id = ids[index];
    if (!id) return;
    const key = String(draft.level);
    out[key] = [...(out[key] ?? []), id];
  });
  return out;
}
