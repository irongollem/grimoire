import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import type { AiProvenance } from "@/ai/provenance";
import type { RulesetKey } from "@/types/ruleset.types";
import type { ClassFeatureInsert } from "@/types/feature.types";
import { parseMechanics } from "@/rules/features/mechanics";
import { ACTIVATIONS, type Activation, type FeatureMechanics } from "@/rules/features/mechanics.types";

/** What `generate-entity-text` returns for the `class_feature` generator (untrusted). */
export interface FeatureAiResult {
  name?: unknown;
  description?: unknown;
  /** How it is used: action, bonus_action, reaction or special. Passive is the absence of one. */
  activation?: unknown;
  /** Optional full `FeatureMechanics` (uses, riders, choices, ...); validated, never trusted. */
  mechanics?: unknown;
  prerequisite?: unknown;
  tags?: unknown;
  ai_provenance?: AiProvenance;
}

export interface FeatureDraftContext {
  ruleset: RulesetKey;
  campaignId: string | null;
}

/** A feature written for a class or subclass: which level grants it, and the row to create. */
export interface NewFeatureDraft {
  level: number;
  insert: ClassFeatureInsert;
}

/**
 * What a class or subclass grants at a level: a row the generation writes, or an
 * existing one it points at (the official Ability Score Improvement).
 */
export type LevelledFeatureDraft = NewFeatureDraft | ExistingFeatureDraft;

export interface ExistingFeatureDraft {
  level: number;
  existingId: string;
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

/** "Bonus Action" and "bonus_action" both read as the bonus action; anything else is passive (no activation). */
export function activationFrom(raw: unknown): Activation | null {
  const key = text(raw).toLowerCase().replace(/[\s-]+/g, "_");
  return ACTIVATIONS.find((a) => a === key) ?? null;
}

/**
 * The model's mechanics, kept only as far as `parseMechanics` accepts them. A
 * generation never fails over a half-formed part: that part is left out and the
 * rules text still carries it. The stated `activation` wins over one inside `mechanics`.
 */
export function mechanicsFromAi(ai: Pick<FeatureAiResult, "activation" | "mechanics">): FeatureMechanics {
  const raw: Record<string, unknown> = isRecord(ai.mechanics) ? { ...ai.mechanics } : {};
  const activation = activationFrom(ai.activation);
  if (activation) raw.activation = activation;
  return parseMechanics(raw).mechanics;
}

/** One feature row, or null when the model gave no usable name and rules text. */
export function featureInsertFromAi(ai: FeatureAiResult, ctx: FeatureDraftContext): ClassFeatureInsert | null {
  const name = text(ai.name).slice(0, 120);
  const description = text(ai.description);
  if (!name || !description) return null;
  return {
    name,
    description: toTiptapJson(description),
    source: "Grimoire:AI",
    prerequisite: textOrNull(ai.prerequisite),
    tags: stringList(ai.tags, MAX_TAGS, 40).map((t) => t.toLowerCase()),
    open5e_import: false,
    ruleset: ctx.ruleset,
    campaign_id: ctx.campaignId,
    ai_provenance: ai.ai_provenance ?? null,
    kind: "feature",
    mechanics: mechanicsFromAi(ai),
  };
}

export interface LevelledFeatureOptions {
  /** When set, features at any other level are dropped. */
  allowedLevels?: readonly number[];
  maxPerLevel: number;
  maxTotal: number;
}

/**
 * The `features: [{level, name, activation, description, mechanics?}]` list of a class or
 * subclass. Levels outside 1-20 (or outside `allowedLevels`) are dropped, a
 * feature repeated at a level is dropped, and the result is ordered by level so
 * the created rows read in the order the character gains them.
 */
export function levelledFeaturesFromAi(
  raw: unknown,
  provenance: AiProvenance | undefined,
  ctx: FeatureDraftContext,
  opts: LevelledFeatureOptions,
): NewFeatureDraft[] {
  if (!Array.isArray(raw)) return [];
  const perLevel = new Map<number, Set<string>>();
  const out: NewFeatureDraft[] = [];
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
