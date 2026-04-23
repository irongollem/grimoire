import type { SpellInsert } from "@/types/spell.types";
import {
  SPELL_SCHOOLS,
  SPELL_COMPONENTS,
  CASTING_TIME_OPTIONS,
  DURATION_OPTIONS,
  RANGE_OPTIONS,
  SPELL_CLASSES,
  type SpellSchool,
  type SpellComponent,
} from "@/types/spell.types";
import type { SpellAiGenerated } from "./types";

const SCHOOL_SET = new Set<string>(SPELL_SCHOOLS);
const COMPONENT_SET = new Set<string>(SPELL_COMPONENTS);
const CASTING_TIME_VALUES = new Set(CASTING_TIME_OPTIONS.map((o) => o.value));
const DURATION_VALUES = new Set(DURATION_OPTIONS.map((o) => o.value));
const RANGE_VALUES = new Set(RANGE_OPTIONS.map((o) => o.value));
const CLASS_SET = new Set<string>(SPELL_CLASSES);

const ATTACK_TYPES = new Set(["ranged_spell", "melee_spell", "save", "automatic", "none"]);
const SAVE_ATTRIBUTES = new Set(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);
const SAVE_EFFECTS = new Set(["half", "negates", "special"]);
const AOE_SHAPES = new Set(["sphere", "cone", "line", "cylinder", "cube", "emanation"]);

/**
 * Coerce an AI-produced spell into a `SpellInsert` the SpellList editor can
 * accept. Validates enum-shaped fields (school, casting time, duration, range,
 * components, classes) and falls back to "Special" + the raw string in the
 * matching `*_custom` field when the AI returns something off-list — which
 * happens occasionally for casting times like "Special: 1 round, when …".
 */
export function spellInsertFromAi(ai: SpellAiGenerated): SpellInsert {
  // ── School ──────────────────────────────────────────────────────────────
  const school: SpellSchool = SCHOOL_SET.has(ai.school)
    ? ai.school
    : "evocation";

  // ── Components ──────────────────────────────────────────────────────────
  const components = (ai.components ?? []).filter(
    (c): c is SpellComponent => COMPONENT_SET.has(c),
  );

  // ── Casting time ────────────────────────────────────────────────────────
  let casting_time = ai.casting_time;
  let casting_time_custom = ai.casting_time_custom ?? null;
  if (!CASTING_TIME_VALUES.has(casting_time)) {
    // Off-list value — preserve it in custom and switch to Special
    casting_time_custom = casting_time;
    casting_time = "Special";
  }
  // Reaction / Special are the only ones that should keep custom text
  if (casting_time !== "Reaction" && casting_time !== "Special") {
    casting_time_custom = null;
  }

  // ── Range ───────────────────────────────────────────────────────────────
  let range = ai.range;
  let range_custom = ai.range_custom ?? null;
  if (!RANGE_VALUES.has(range)) {
    range_custom = range;
    range = "Special";
  }
  if (range !== "Special") range_custom = null;

  // ── Duration ────────────────────────────────────────────────────────────
  let duration = ai.duration;
  let duration_custom = ai.duration_custom ?? null;
  if (!DURATION_VALUES.has(duration)) {
    duration_custom = duration;
    duration = "Special";
  }
  if (duration !== "Special") duration_custom = null;

  // ── Mechanics enum-guards ───────────────────────────────────────────────
  const attack_type = ai.attack_type && ATTACK_TYPES.has(ai.attack_type)
    ? ai.attack_type
    : null;
  const save_attribute =
    attack_type === "save" && ai.save_attribute && SAVE_ATTRIBUTES.has(ai.save_attribute)
      ? ai.save_attribute
      : null;
  const save_effect =
    attack_type === "save" && ai.save_effect && SAVE_EFFECTS.has(ai.save_effect)
      ? ai.save_effect
      : null;
  const aoe_shape = ai.aoe_shape && AOE_SHAPES.has(ai.aoe_shape)
    ? ai.aoe_shape
    : null;

  // ── Classes ─────────────────────────────────────────────────────────────
  const classes = (ai.classes ?? []).filter((c) => CLASS_SET.has(c));

  return {
    name: ai.name,
    level: Math.max(0, Math.min(9, Math.round(ai.level ?? 1))),
    school,
    casting_time,
    casting_time_custom,
    range,
    range_custom,
    components,
    material: components.includes("M") ? ai.material ?? null : null,
    duration,
    duration_custom,
    concentration: !!ai.concentration,
    ritual: !!ai.ritual,
    attack_type,
    save_attribute,
    save_effect,
    damage_rolls: ai.damage_rolls && ai.damage_rolls.length ? ai.damage_rolls : null,
    healing_dice: ai.healing_dice ?? null,
    target_description: ai.target_description ?? null,
    aoe_shape,
    aoe_size: aoe_shape ? ai.aoe_size ?? null : null,
    condition_inflicted: ai.condition_inflicted?.toLowerCase() ?? null,
    description: ai.description ?? "",
    higher_levels: ai.level === 0 ? null : ai.higher_levels ?? null,
    higher_level_damage: null,
    higher_level_healing: null,
    classes,
    tags: ai.tags ?? [],
    source: "Grimoire:AI",
    source_title: null,
    source_url: null,
    open5e_import: false,
    image_url: ai.image_url ?? null,
    image_focal_point: null,
  };
}
