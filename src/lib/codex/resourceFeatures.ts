import type { AiProvenance } from "@/ai/provenance";
import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import type { FeatureUses, Recharge, UsesAmount } from "@/rules/features/mechanics.types";
import type { RulesetKey } from "@/types/ruleset.types";
import { isRecord, text, wholeNumber, type NewFeatureDraft } from "./featureAi";

/**
 * A class resource as the model still writes it (`resources: [{label, rest,
 * scaling, ...}]`). Resources are not stored any more: each one becomes the
 * `mechanics.uses` of a feature, which is where the sheet and the rests read it.
 */
export interface AiResource {
  key: string;
  label: string;
  rest: "short" | "long";
  scaling: "fixed" | "per_level" | "table";
  fixed_value?: number;
  /** Length 20, index = class level - 1. */
  table_values?: number[];
}

const MAX_RESOURCES = 6;

function slugKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

export function sanitizeResources(raw: unknown): AiResource[] {
  if (!Array.isArray(raw)) return [];
  const out: AiResource[] = [];
  const keys = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const label = text(item.label).slice(0, 60);
    const key = slugKey(text(item.key) || label);
    if (!label || !key || keys.has(key)) continue;
    const rest = text(item.rest).toLowerCase() === "short" ? "short" : "long";
    const scaling = text(item.scaling).toLowerCase();
    if (scaling === "per_level") {
      out.push({ key, label, rest, scaling: "per_level" });
    } else if (scaling === "table") {
      // A null cell (non-numeric model output) drops the filtered list below 20,
      // which invalidates the whole resource rather than becoming a 0.
      const table = Array.isArray(item.table_values)
        ? item.table_values.map(wholeNumber).filter((n): n is number => n !== null)
        : [];
      if (table.length !== 20 || table.some((n) => n < 0 || n > 99)) continue;
      out.push({ key, label, rest, scaling: "table", table_values: table });
    } else {
      const value = wholeNumber(item.fixed_value);
      out.push({
        key, label, rest, scaling: "fixed",
        fixed_value: value !== null && value >= 0 && value <= 99 ? value : 1,
      });
    }
    keys.add(key);
    if (out.length >= MAX_RESOURCES) break;
  }
  return out;
}

/** The first class level at which the resource has any uses. */
export function firstLevelOf(resource: AiResource): number {
  if (resource.scaling !== "table" || !resource.table_values) return 1;
  const index = resource.table_values.findIndex((n) => n > 0);
  return index === -1 ? 1 : index + 1;
}

function amountOf(resource: AiResource): UsesAmount {
  if (resource.scaling === "per_level") return { kind: "class_level", multiplier: 1 };
  if (resource.scaling === "fixed") return { kind: "fixed", value: resource.fixed_value ?? 1 };
  // Only the levels where the table changes are listed, as a by-level amount reads the nearest one below.
  const values: Record<string, number> = {};
  let previous = 0;
  (resource.table_values ?? []).forEach((n, i) => {
    if (n !== previous) values[String(i + 1)] = n;
    previous = n;
  });
  return { kind: "by_level", values };
}

export function usesFromResource(resource: AiResource): FeatureUses {
  const recharge: Recharge = resource.rest === "short" ? "short" : "long";
  return { key: resource.key, label: resource.label, amount: amountOf(resource), recharge, pool: false };
}

export interface ResourceContext {
  ruleset: RulesetKey;
  campaignId: string | null;
  provenance: AiProvenance | undefined;
  /** When set, a resource's feature is placed on the nearest of these levels at or after its own. */
  allowedLevels?: readonly number[];
}

function placedLevel(level: number, allowed: readonly number[] | undefined): number | null {
  if (!allowed) return level;
  const sorted = [...allowed].sort((a, b) => a - b);
  return sorted.find((l) => l >= level) ?? sorted[sorted.length - 1] ?? null;
}

/**
 * The drafted features with each resource folded in as `mechanics.uses`. A
 * resource named like a drafted feature becomes that feature's uses; any other
 * resource becomes a feature of its own, granted at the first level it has uses.
 * The result keeps level order.
 */
export function withResourceFeatures(
  features: readonly NewFeatureDraft[],
  resources: readonly AiResource[],
  ctx: ResourceContext,
): NewFeatureDraft[] {
  const out = features.map((f) => ({ level: f.level, insert: { ...f.insert } }));
  for (const resource of resources) {
    const uses = usesFromResource(resource);
    const owner = out.find(
      (f) => f.insert.name.trim().toLowerCase() === resource.label.toLowerCase() && !f.insert.mechanics?.uses,
    );
    if (owner) {
      owner.insert.mechanics = { ...owner.insert.mechanics, uses };
      continue;
    }
    const level = placedLevel(firstLevelOf(resource), ctx.allowedLevels);
    if (level === null) continue;
    out.push({
      level,
      insert: {
        name: resource.label,
        description: toTiptapJson(
          `You have a limited number of uses of ${resource.label}, shown on your character sheet. They come back on a ${resource.rest} rest.`,
        ),
        source: "Grimoire:AI",
        prerequisite: null,
        tags: [],
        open5e_import: false,
        ruleset: ctx.ruleset,
        campaign_id: ctx.campaignId,
        ai_provenance: ctx.provenance ?? null,
        kind: "feature",
        mechanics: { uses },
      },
    });
  }
  return out
    .map((draft, index) => ({ draft, index }))
    .sort((a, b) => a.draft.level - b.draft.level || a.index - b.index)
    .map(({ draft }) => draft);
}
