import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import { LANGUAGE_GROUPS, TOOL_PROFICIENCY_GROUPS, type ProficiencyGroup } from "@/lib/proficiency-lists";
import { parseOriginFeatText } from "@/rules/backgroundAsi";
import { ABILITY_SCORE_KEYS, type AbilityScoreKey, type BackgroundInsert } from "@/types/background.types";
import { SKILLS } from "@/types/party.types";
import type { AiProvenance } from "@/ai/provenance";
import type { RulesetKey } from "@/types/ruleset.types";

/** What `generate-entity-text` returns for the `background` generator (untrusted). */
export interface BackgroundAiResult {
  name?: unknown;
  description?: unknown;
  skill_proficiencies?: unknown;
  tool_proficiencies?: unknown;
  languages?: unknown;
  equipment?: unknown;
  feature_name?: unknown;
  feature_description?: unknown;
  feat_grant_name?: unknown;
  feat_grant_description?: unknown;
  asi_ability_trio?: unknown;
  suggested_characteristics?: unknown;
  tags?: unknown;
  ai_provenance?: AiProvenance;
}

const MAX_SKILLS = 2;
const MAX_TAGS = 6;

function flatten(groups: readonly ProficiencyGroup[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const g of groups) for (const item of g.items) map.set(item.toLowerCase(), item);
  return map;
}
const TOOL_NAMES = flatten(TOOL_PROFICIENCY_GROUPS);
const LANGUAGE_NAMES = flatten(LANGUAGE_GROUPS);
const SKILL_BY_LOWER = new Map(SKILLS.flatMap((s) => [
  [s.label.toLowerCase(), s.label] as const,
  [s.key, s.label] as const,
]));

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function richOrNull(v: unknown): string | null {
  const t = text(v);
  return t ? toTiptapJson(t) : null;
}

function pick(raw: unknown, names: Map<string, string>, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (out.length >= max) break;
    const canonical = names.get(text(item).toLowerCase());
    if (canonical && !out.includes(canonical)) out.push(canonical);
  }
  return out;
}

/** Real skill labels only ("Sleight of Hand"), distinct, at most two. */
export function sanitizeSkills(raw: unknown): string[] {
  return pick(raw, SKILL_BY_LOWER, MAX_SKILLS);
}

/** Exactly three distinct abilities (full lowercase names), else null. */
export function sanitizeAbilityTrio(raw: unknown): AbilityScoreKey[] | null {
  if (!Array.isArray(raw)) return null;
  const out: AbilityScoreKey[] = [];
  for (const item of raw) {
    const key = ABILITY_SCORE_KEYS.find((k) => k === text(item).toLowerCase());
    if (key && !out.includes(key)) out.push(key);
  }
  return out.length === 3 ? out : null;
}

function tags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const t = text(item).toLowerCase();
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/**
 * Turn the model's background JSON into a row the backgrounds table accepts,
 * shaped for the table's edition. 2014: two skills, two tools or
 * languages between them, a feature, no feat and no ability trio. 2024: two skills, one
 * tool, an origin feat and a three-ability trio, no feature.
 */
export function backgroundInsertFromAi(
  ai: BackgroundAiResult,
  ctx: { ruleset: RulesetKey },
): BackgroundInsert {
  const is2024 = ctx.ruleset === "2024";
  // 2014: two proficiencies beyond the skills, from tools and languages combined
  // (a tool and a language, two languages, two tools). 2024: exactly one tool and
  // no languages, which the 2024 rules choose separately at character creation.
  const tools = pick(ai.tool_proficiencies, TOOL_NAMES, is2024 ? 1 : 2);
  const languages = is2024 ? [] : pick(ai.languages, LANGUAGE_NAMES, 2 - tools.length);
  const featName = is2024 ? text(ai.feat_grant_name) || null : null;
  const featureName = is2024 ? null : text(ai.feature_name) || null;

  return {
    name: text(ai.name),
    description: richOrNull(ai.description),
    skill_proficiencies: sanitizeSkills(ai.skill_proficiencies),
    tool_proficiencies: tools,
    languages,
    equipment: richOrNull(ai.equipment),
    feature_name: featureName,
    feature_description: featureName ? richOrNull(ai.feature_description) : null,
    feat_grant_name: featName,
    feat_grant_description: featName ? richOrNull(ai.feat_grant_description) : null,
    asi_ability_trio: is2024 ? sanitizeAbilityTrio(ai.asi_ability_trio) : null,
    origin_feat: parseOriginFeatText(featName),
    suggested_characteristics: richOrNull(ai.suggested_characteristics),
    tags: tags(ai.tags),
    source: "Grimoire:AI",
    image_url: null,
    focal_point: null,
    ruleset: ctx.ruleset,
    ai_provenance: ai.ai_provenance ?? null,
  };
}
