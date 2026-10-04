import {
  DUNGEON_FEATURE_TRIGGERS,
  DUNGEON_FEATURE_TYPES,
  FEATURE_GLYPHS,
} from "@/types/dungeonFeature.types";
import type {
  DungeonFeatureTrigger,
  DungeonFeatureType,
  FeatureGlyph,
} from "@/types/dungeonFeature.types";
import type { AiProvenance } from "@/ai/provenance";

/** Raw model output for the `feature` generator. Untrusted: every field may be
 *  missing or the wrong shape, so it is typed `unknown` and normalised below. */
export type DungeonFeatureAiRaw = Record<string, unknown>;

/** A dungeon feature the model designed, after validation. Prose fields are
 *  still plain text; the panel converts them to Tiptap JSON. */
export interface DungeonFeatureAiResult {
  name: string;
  feature_type: DungeonFeatureType;
  description: string | null;
  trigger_type: DungeonFeatureTrigger | null;
  trigger_description: string | null;
  perception_dc: number | null;
  investigation_dc: number | null;
  arcana_dc: number | null;
  feature_glyph: FeatureGlyph | null;
  contents_description: string | null;
  notes: string | null;
  tags: string[];
  image_prompt: string;
  ai_provenance?: AiProvenance;
}

const DC_MIN = 5;
const DC_MAX = 30;

function oneOf<T extends string>(list: readonly T[], value: unknown): T | null {
  if (typeof value !== "string") return null;
  const wanted = value.trim().toLowerCase();
  return list.find((item) => item.toLowerCase() === wanted) ?? null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function dc(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.min(DC_MAX, Math.max(DC_MIN, Math.round(n)));
}

function tags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const t of value) {
    if (typeof t !== "string") continue;
    const clean = t.trim().toLowerCase();
    if (clean) seen.add(clean);
  }
  return [...seen].slice(0, 8);
}

/** Validate the model's JSON into a safe result: unknown enums fall back
 *  (type to "Other", trigger and glyph to null), DCs are clamped to 5-30,
 *  tags are filtered. Throws when there is no usable name. */
export function normalizeDungeonFeature(raw: DungeonFeatureAiRaw): DungeonFeatureAiResult {
  const name = text(raw.name);
  if (!name) throw new Error("The generated feature had no name.");
  const provenance = raw.ai_provenance;
  return {
    name,
    feature_type: oneOf(DUNGEON_FEATURE_TYPES, raw.feature_type) ?? "Other",
    description: text(raw.description),
    trigger_type: oneOf(DUNGEON_FEATURE_TRIGGERS, raw.trigger_type),
    trigger_description: text(raw.trigger_description),
    perception_dc: dc(raw.perception_dc),
    investigation_dc: dc(raw.investigation_dc),
    arcana_dc: dc(raw.arcana_dc),
    feature_glyph: oneOf(FEATURE_GLYPHS, raw.feature_glyph),
    contents_description: text(raw.contents_description),
    notes: text(raw.notes),
    tags: tags(raw.tags),
    image_prompt: text(raw.image_prompt) ?? name,
    ...(provenance && typeof provenance === "object"
      ? { ai_provenance: provenance as AiProvenance }
      : {}),
  };
}
