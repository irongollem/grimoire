import type { AiProvenance } from "@/ai/provenance";
import { publishedSubclassFeatureLevels } from "@/rules/subclassFeatureLevels";
import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import type { RulesetKey } from "@/types/ruleset.types";
import type { CustomSubclassInsert } from "@/levelup/customTypes";
import { sanitizeResources } from "./classAi";
import {
  featureIdsByLevel,
  levelledFeaturesFromAi,
  text,
  wholeNumber,
  type LevelledFeatureDraft,
} from "./featureAi";

/** What `generate-entity-text` returns for the `custom_subclass` generator (untrusted). */
export interface SubclassAiResult {
  subclass_name?: unknown;
  description?: unknown;
  features?: unknown;
  resources?: unknown;
  hp_per_level?: unknown;
  ai_provenance?: AiProvenance;
}

const MAX_FEATURES_PER_LEVEL = 3;
const MAX_FEATURES = 16;

/**
 * Levels at which a subclass of the parent class gains features. A Player's
 * Handbook class uses the book's own levels for the edition
 * (src/rules/subclassFeatureLevels.ts); a homebrew parent has no book to follow,
 * so it gets its grant level and then 6, 10 and 14, the most common rhythm.
 */
export function subclassFeatureLevels(parent: {
  parentClassName: string;
  subclassLevel: number;
  ruleset: RulesetKey;
}): number[] {
  const published = publishedSubclassFeatureLevels(parent.parentClassName, parent.ruleset);
  if (published) return [...published];
  const first = Math.min(20, Math.max(1, Math.round(parent.subclassLevel)));
  return [first, ...[6, 10, 14].filter((l) => l > first)];
}

export interface SubclassDraftContext {
  ruleset: RulesetKey;
  campaignId: string | null;
  parentClassName: string;
  /** The parent class's subclass level. */
  subclassLevel: number;
}

export interface SubclassDraft {
  /** The subclass row without its features: those are created first and then linked in. */
  base: CustomSubclassInsert;
  features: LevelledFeatureDraft[];
  problems: string[];
}

export function validateSubclassProgression(
  features: Readonly<Record<string, readonly unknown[]>>,
  subclassLevel: number,
  allowedLevels: readonly number[],
): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(features)) {
    if (!allowedLevels.includes(Number(key))) problems.push(`Features at level ${key} are not at a level this class grants subclass features.`);
  }
  if (!features[String(subclassLevel)]?.length) {
    problems.push(`The subclass grants nothing at level ${subclassLevel}.`);
  }
  return problems;
}

/** Turn the model's subclass JSON into a row shaped for the parent class's subclass levels. */
export function subclassDraftFromAi(ai: SubclassAiResult, ctx: SubclassDraftContext): SubclassDraft {
  const allowedLevels = subclassFeatureLevels(ctx);
  const features = levelledFeaturesFromAi(
    ai.features,
    ai.ai_provenance,
    ctx,
    { allowedLevels, maxPerLevel: MAX_FEATURES_PER_LEVEL, maxTotal: MAX_FEATURES },
  );
  const description = text(ai.description);
  const hp = wholeNumber(ai.hp_per_level);

  const base: CustomSubclassInsert = {
    class_name: ctx.parentClassName,
    subclass_name: text(ai.subclass_name).slice(0, 80),
    source: "Grimoire:AI",
    ruleset: ctx.ruleset,
    campaign_id: ctx.campaignId,
    description: description ? toTiptapJson(description) : null,
    features: featureIdsByLevel(features, features.map((_, i) => `pending-${i}`)),
    granted_spells: {},
    steps: [],
    resources: sanitizeResources(ai.resources),
    hp_per_level: hp !== null && hp >= 1 && hp <= 2 ? hp : null,
    ai_provenance: ai.ai_provenance ?? null,
  };

  const problems = validateSubclassProgression(base.features, ctx.subclassLevel, allowedLevels);
  if (!base.subclass_name) problems.unshift("The subclass has no name.");
  return { base, features, problems };
}

/** The subclass row with its `features` pointing at the created feature rows, in draft order. */
export function subclassWithFeatureIds(draft: SubclassDraft, ids: readonly string[]): CustomSubclassInsert {
  return { ...draft.base, features: featureIdsByLevel(draft.features, ids) };
}
