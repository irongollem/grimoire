import {
  RULE_CATEGORIES,
  type DmButton,
  type RuleCategory,
  type TrackerDef,
  type TrackerEffect,
  type TrackerItemTag,
  type TrackerLevel,
  type TrackerTriggers,
} from "@/types/rule.types";

/**
 * Turns the custom_rule generator's raw JSON into what the `rules` table
 * stores. Model output is untrusted: the category is checked against
 * RULE_CATEGORIES, text is trimmed, and the tracker is validated strictly. A
 * tracker that fails validation becomes null so the rule text still lands.
 */

export interface CustomRuleDraft {
  title: string;
  category: RuleCategory | null;
  /** Tiptap document (an object, as the `rules.content` jsonb column holds). */
  content: TiptapDoc;
  tags: string[];
  tracker: TrackerDef | null;
}

export interface TiptapDoc {
  type: "doc";
  content: Array<Record<string, unknown>>;
}

const EFFECT_TYPES = ["speed", "disadvantage_checks", "disadvantage_saves", "exhaustion", "note", "save"] as const;
const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
const LEVEL_COLORS = ["green", "yellow", "orange", "red", "blue", "purple"] as const;
const ITEM_TAG_MODES = ["on_consume", "suppresses_rest_tick"] as const;

const MAX_TAGS = 8;
const MAX_LEVELS = 8;
const MAX_BUTTONS = 6;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function int(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) ? v : null;
}

function oneOf<T extends string>(list: readonly T[], v: unknown): T | null {
  return typeof v === "string" ? (list.find((x) => x === v) ?? null) : null;
}

function normalizeEffect(raw: unknown): TrackerEffect | null {
  if (!isRecord(raw)) return null;
  const type = oneOf(EFFECT_TYPES, raw.type);
  const label = text(raw.label);
  if (!type || !label) return null;
  const effect: TrackerEffect = { type, label };
  if (type === "speed") {
    const value = int(raw.value);
    if (value === null) return null;
    effect.value = value;
  }
  if (type === "exhaustion") {
    const value = int(raw.value);
    if (value === null || value < 1 || value > 6) return null;
    effect.value = value;
  }
  if (type === "disadvantage_checks" || type === "disadvantage_saves") {
    const scope = text(raw.scope)
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => oneOf(ABILITIES, s));
    if (scope.length > 0) effect.scope = scope.join(",");
  }
  if (type === "save") {
    const ability = oneOf(ABILITIES, text(raw.ability).toUpperCase());
    const dcBase = int(raw.dcBase);
    if (!ability || dcBase === null || dcBase < 0 || dcBase > 30) return null;
    effect.ability = ability;
    effect.dcBase = dcBase;
    if (raw.dcAddTracker === true) effect.dcAddTracker = true;
  }
  return effect;
}

function normalizeLevels(raw: unknown, min: number, max: number): TrackerLevel[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_LEVELS) return null;
  const levels: TrackerLevel[] = [];
  let previous = -Infinity;
  for (const item of raw) {
    if (!isRecord(item)) return null;
    const value = int(item.value);
    const label = text(item.label);
    if (value === null || !label || value < min || value > max || value <= previous) return null;
    previous = value;
    const level: TrackerLevel = { value, label };
    const color = oneOf(LEVEL_COLORS, item.color);
    if (color) level.color = color;
    if (Array.isArray(item.effects)) {
      const effects = item.effects.map(normalizeEffect).filter((e): e is TrackerEffect => e !== null);
      if (effects.length > 0) level.effects = effects;
    }
    levels.push(level);
  }
  return levels;
}

function normalizeTriggers(raw: unknown): TrackerTriggers | undefined {
  if (!isRecord(raw)) return undefined;
  const triggers: TrackerTriggers = {};
  const longRest = int(raw.onLongRest);
  const shortRest = int(raw.onShortRest);
  if (longRest !== null) triggers.onLongRest = longRest;
  if (shortRest !== null) triggers.onShortRest = shortRest;
  if (Array.isArray(raw.itemTags)) {
    const itemTags: TrackerItemTag[] = [];
    for (const item of raw.itemTags) {
      if (!isRecord(item)) continue;
      const tag = text(item.tag);
      const delta = int(item.delta);
      const mode = oneOf(ITEM_TAG_MODES, item.mode);
      if (tag && delta !== null && mode) itemTags.push({ tag, delta, mode });
    }
    if (itemTags.length > 0) triggers.itemTags = itemTags;
  }
  return Object.keys(triggers).length > 0 ? triggers : undefined;
}

function normalizeButtons(raw: unknown, min: number, max: number): DmButton[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const buttons: DmButton[] = [];
  for (const item of raw.slice(0, MAX_BUTTONS)) {
    if (!isRecord(item)) continue;
    const label = text(item.label);
    if (!label) continue;
    if (item.mode === "set") {
      const setValue = int(item.setValue);
      if (setValue === null || setValue < min || setValue > max) continue;
      buttons.push({ label, mode: "set", delta: 0, setValue, playerVisible: item.playerVisible === true });
    } else {
      const delta = int(item.delta);
      if (delta === null || delta === 0) continue;
      buttons.push({ label, mode: "delta", delta, playerVisible: item.playerVisible === true });
    }
  }
  return buttons.length > 0 ? buttons : undefined;
}

/** Strict tracker validation: any structural fault returns null. */
export function normalizeTracker(raw: unknown): TrackerDef | null {
  if (!isRecord(raw)) return null;
  const label = text(raw.label);
  const min = int(raw.min);
  const max = int(raw.max);
  if (!label || min === null || max === null || min >= max) return null;
  const type = raw.type === "level" || raw.type === "points" ? raw.type : null;
  if (!type) return null;

  const tracker: TrackerDef = { label, type, min, max };
  if (raw.start !== undefined && raw.start !== null) {
    const start = int(raw.start);
    if (start === null || start < min || start > max) return null;
    tracker.start = start;
  }
  if (type === "level") {
    const levels = normalizeLevels(raw.levels, min, max);
    if (!levels) return null;
    tracker.levels = levels;
  }
  const triggers = normalizeTriggers(raw.triggers);
  if (triggers) tracker.triggers = triggers;
  const dmButtons = normalizeButtons(raw.dmButtons, min, max);
  if (dmButtons) tracker.dmButtons = dmButtons;
  return tracker;
}

function heading(textValue: string): Record<string, unknown> {
  return { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: textValue }] };
}

function paragraphs(body: string): Array<Record<string, unknown>> {
  return body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] }));
}

function buildContent(summary: string, trigger: string, effect: string, exceptions: string): TiptapDoc {
  const content: Array<Record<string, unknown>> = [];
  if (summary) content.push(...paragraphs(summary));
  const sections: Array<[string, string]> = [
    ["When it applies", trigger],
    ["Effect", effect],
    ["Exceptions", exceptions],
  ];
  for (const [title, body] of sections) {
    if (!body) continue;
    content.push(heading(title), ...paragraphs(body));
  }
  return { type: "doc", content };
}

/** Returns null when the model gave nothing usable (no title or no effect). */
export function normalizeCustomRule(raw: unknown, allowTracker = true): CustomRuleDraft | null {
  if (!isRecord(raw)) return null;
  const title = text(raw.title);
  const effect = text(raw.effect);
  if (!title || !effect) return null;
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map(text).filter(Boolean).slice(0, MAX_TAGS)
    : [];
  return {
    title,
    category: oneOf(RULE_CATEGORIES, raw.category),
    content: buildContent(text(raw.summary), text(raw.trigger), effect, text(raw.exceptions)),
    tags,
    tracker: allowTracker ? normalizeTracker(raw.tracker) : null,
  };
}
