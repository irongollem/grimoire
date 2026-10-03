import type { ContentKind } from "@/composables/party/useCharacterContentReviews";

/**
 * What the DM is shown of a piece of content before approving it (#943, wave 4).
 *
 * `get_character_content_item` returns the stored row as plain jsonb, whose
 * shape differs by kind, so this turns it into labelled rows the dialog can
 * render without knowing any of them. Pure, and separate from the component so
 * each shape is tested directly.
 */

/**
 * How each field is shown. The stored shape differs by kind (and a library
 * species is not a homebrew one), so only fields worth a DM's attention are
 * listed; anything absent, empty or of an unexpected type is simply skipped.
 * `rich` fields hold Tiptap JSON or prose and go through the shared viewer.
 */
type FieldFormat =
  | "rich" | "text" | "list" | "traits" | "speed" | "dice" | "level"
  | "abilities" | "number" | "grants" | "variants" | "features" | "nestedSpells";
interface FieldSpec {
  key: string;
  label: string;
  format: FieldFormat;
}

const FIELDS: Record<ContentKind, FieldSpec[]> = {
  species: [
    { key: "description", label: "Description", format: "rich" },
    { key: "size", label: "Size", format: "text" },
    { key: "speed", label: "Speed", format: "speed" },
    // What a species changes on the sheet comes before its prose: these are
    // the lines a DM is approving.
    { key: "ability_score_increases", label: "Ability scores", format: "abilities" },
    { key: "natural_armor_ac", label: "Natural armor AC", format: "number" },
    { key: "traits", label: "Traits", format: "traits" },
    { key: "granted_spells", label: "Spells it grants", format: "grants" },
    { key: "subraces", label: "Variants", format: "variants" },
    { key: "languages", label: "Languages", format: "list" },
  ],
  background: [
    { key: "description", label: "Description", format: "rich" },
    { key: "skill_proficiencies", label: "Skills", format: "list" },
    { key: "tool_proficiencies", label: "Tools", format: "list" },
    { key: "languages", label: "Languages", format: "list" },
    { key: "equipment", label: "Equipment", format: "rich" },
    { key: "feature_name", label: "Feature", format: "text" },
    { key: "feature_description", label: "What the feature does", format: "rich" },
    { key: "feat_grant_name", label: "Feat granted", format: "text" },
    { key: "feat_grant_description", label: "What the feat does", format: "rich" },
  ],
  class: [
    { key: "description", label: "Description", format: "rich" },
    { key: "hit_die", label: "Hit die", format: "dice" },
    { key: "primary_ability", label: "Primary ability", format: "text" },
    { key: "saving_throws", label: "Saving throws", format: "list" },
    { key: "armor_proficiencies", label: "Armor", format: "list" },
    { key: "weapon_proficiencies", label: "Weapons", format: "list" },
    // A class is its features, and approving copies them too.
    { key: "nested_features", label: "Features", format: "features" },
  ],
  subclass: [
    { key: "class_name", label: "Subclass of", format: "text" },
    { key: "description", label: "Description", format: "rich" },
    { key: "nested_features", label: "Features", format: "features" },
    { key: "nested_spells", label: "Spells it grants", format: "nestedSpells" },
  ],
  spell: [
    { key: "level", label: "Level", format: "level" },
    { key: "school", label: "School", format: "text" },
    { key: "casting_time", label: "Casting time", format: "text" },
    { key: "range", label: "Range", format: "text" },
    { key: "duration", label: "Duration", format: "text" },
    { key: "components", label: "Components", format: "list" },
    { key: "classes", label: "Classes", format: "list" },
    { key: "description", label: "Description", format: "rich" },
    { key: "higher_levels", label: "At higher levels", format: "rich" },
  ],
  feat: [
    { key: "prerequisite", label: "Prerequisite", format: "text" },
    { key: "description", label: "Description", format: "rich" },
  ],
};

export interface ContentTrait {
  name: string;
  description: string | null;
}

export type ContentRow =
  | { label: string; kind: "rich" | "text"; text: string }
  | { label: string; kind: "list"; entries: string[] }
  | { label: string; kind: "traits"; traits: ContentTrait[] };

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry !== "") : [];
}

function traitList(value: unknown): ContentTrait[] {
  if (!Array.isArray(value)) return [];
  const traits: ContentTrait[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const name = nonEmptyString((entry as Record<string, unknown>).name);
    if (name) traits.push({ name, description: nonEmptyString((entry as Record<string, unknown>).description) });
  }
  return traits;
}

function speedText(value: unknown): string | null {
  if (typeof value === "number") return `${value} ft.`;
  if (typeof value !== "object" || value === null) return null;
  const parts = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0)
    .map(([mode, feet]) => `${mode} ${feet} ft.`);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** A species stores its bonuses as prose (`{ description: "+2 WIS" }`) or as a score per ability. */
function abilitiesText(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const prose = nonEmptyString(record.description);
  if (prose) return prose;
  const parts = Object.entries(record)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] !== 0)
    .map(([ability, bonus]) => `${ability.toUpperCase()} ${bonus > 0 ? "+" : ""}${bonus}`);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** One line per innate spell: its name, how often, and from which level when that is not the first. */
function grantList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const grant = entry as Record<string, unknown>;
    const name = nonEmptyString(grant.spell_name);
    if (!name) continue;
    const uses = typeof grant.uses_per_day === "number" ? `${grant.uses_per_day}/day` : "at will";
    const from = typeof grant.min_level === "number" && grant.min_level > 1 ? `, from level ${grant.min_level}` : "";
    const variant = nonEmptyString(grant.subrace);
    lines.push(`${name} (${uses}${from})${variant ? `, ${variant} only` : ""}`);
  }
  return lines;
}

/** A variant and its own traits, flattened into the trait list's shape so they read the same way. */
function variantList(value: unknown): ContentTrait[] {
  if (!Array.isArray(value)) return [];
  const rows: ContentTrait[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const variant = entry as Record<string, unknown>;
    const name = nonEmptyString(variant.name);
    if (!name) continue;
    const bonuses = abilitiesText(variant.ability_score_increases);
    rows.push({ name: bonuses ? `${name} (${bonuses})` : name, description: nonEmptyString(variant.description) });
    for (const trait of traitList(variant.traits)) rows.push({ name: `${name}: ${trait.name}`, description: trait.description });
  }
  return rows;
}

/** A feature or spell that comes with a class or subclass, headed by the level it arrives at. */
function nestedList(value: unknown): ContentTrait[] {
  if (!Array.isArray(value)) return [];
  const rows: ContentTrait[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const nested = entry as Record<string, unknown>;
    const name = nonEmptyString(nested.name);
    if (!name) continue;
    const level = nonEmptyString(nested.level);
    rows.push({ name: level ? `Level ${level}: ${name}` : name, description: nonEmptyString(nested.description) });
  }
  return rows;
}

function levelText(value: unknown): string | null {
  if (typeof value !== "number") return null;
  return value === 0 ? "Cantrip" : `Level ${value}`;
}

function rowFor(spec: FieldSpec, value: unknown): ContentRow | null {
  const { label } = spec;
  switch (spec.format) {
    case "rich": {
      const text = nonEmptyString(value);
      return text ? { label, kind: "rich", text } : null;
    }
    case "text": {
      const text = nonEmptyString(value);
      return text ? { label, kind: "text", text } : null;
    }
    case "list": {
      const entries = stringList(value);
      return entries.length > 0 ? { label, kind: "list", entries } : null;
    }
    case "traits": {
      const traits = traitList(value);
      return traits.length > 0 ? { label, kind: "traits", traits } : null;
    }
    case "speed": {
      const text = speedText(value);
      return text ? { label, kind: "text", text } : null;
    }
    case "dice":
      return typeof value === "number" ? { label, kind: "text", text: `d${value}` } : null;
    case "number":
      return typeof value === "number" ? { label, kind: "text", text: String(value) } : null;
    case "abilities": {
      const text = abilitiesText(value);
      return text ? { label, kind: "text", text } : null;
    }
    case "grants": {
      const entries = grantList(value);
      return entries.length > 0 ? { label, kind: "list", entries } : null;
    }
    case "variants": {
      const traits = variantList(value);
      return traits.length > 0 ? { label, kind: "traits", traits } : null;
    }
    case "features":
    case "nestedSpells": {
      const traits = nestedList(value);
      return traits.length > 0 ? { label, kind: "traits", traits } : null;
    }
    case "level": {
      const text = levelText(value);
      return text ? { label, kind: "text", text } : null;
    }
  }
}

/** The rows worth a DM's attention for one item, in the order they are shown. */
export function contentRows(kind: ContentKind, item: Record<string, unknown>): ContentRow[] {
  return FIELDS[kind].flatMap((spec) => {
    const row = rowFor(spec, item[spec.key]);
    return row ? [row] : [];
  });
}

/** Its stored name, which is what the player called it; a class or subclass keeps its name under another key. */
export function contentName(item: Record<string, unknown>): string | null {
  return nonEmptyString(item.name) ?? nonEmptyString(item.subclass_name) ?? nonEmptyString(item.class_name);
}
