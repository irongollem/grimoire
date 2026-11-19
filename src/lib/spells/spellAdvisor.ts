/**
 * Spell Level Advisor
 *
 * Suggests a level for a homebrew spell, so a DM can build something new without breaking the game, and says why.
 *
 * Where the numbers come from. Damage and healing follow the Dungeon Master's Guide (2014), "Creating a Spell",
 * Spell Damage table (`SPELL_DAMAGE_TABLE`), with its two rules: the table assumes half damage on a successful save
 * or a miss, and a spell that does nothing then may deal a quarter more. Everything else (how much an area, a
 * duration, a repeated save or a rider is worth) is this app's own weighting, tuned against the published SRD
 * spells: `npm run spells:advisor-check` runs every SRD spell whose fields can be read through the advisor and
 * reports how often the published level falls inside the suggested range. Run it after changing a weight.
 */

// ── Inputs ────────────────────────────────────────────────────────────────────

export type EffectType = "damage" | "healing" | "control" | "buff" | "utility";

/**
 * Intensity of a non-damage effect.
 * Maps to a base score bonus so the advisor can estimate level even without dice.
 *
 * control:
 *   weak     — minor debuff, disadvantage on one thing       (e.g. Bane, Vicious Mockery)
 *   moderate — restrained, frightened, halved speed          (e.g. Hold Person, Web, Slow)
 *   major    — incapacitated, stunned, banished              (e.g. Hold Monster, Banishment)
 *   extreme  — dominated, paralysed, petrified, instant KO   (e.g. Dominate Person, Power Word Stun)
 *
 * buff:
 *   weak     — minor bonus, +d4, guidance-level             (e.g. Guidance, Resistance)
 *   moderate — advantage, resistance, significant stat buff  (e.g. Bless, Shield, Enhance Ability)
 *   major    — extra attack, free movement, powerful AC      (e.g. Haste, Fly, Greater Invisibility)
 *   extreme  — extra action, immunity, raise dead            (e.g. Time Stop, True Resurrection)
 *
 * utility:
 *   weak     — minor convenience, limited info              (e.g. Prestidigitation, Detect Magic)
 *   moderate — solves a whole problem category              (e.g. Comprehend Languages, Darkvision)
 *   major    — major exploration/social advantage           (e.g. Teleportation Circle, Legend Lore)
 *   extreme  — world-altering, near-infinite range/scope    (e.g. Wish, Gate)
 */
export type EffectIntensity = "weak" | "moderate" | "major" | "extreme";

export type TargetingMode =
  | "self"       // self only (no targeting roll)
  | "single"     // one creature / object
  | "multi_2"    // up to 2 creatures
  | "multi_3"    // up to 3 creatures
  | "multi_4_5"  // up to 4–5 creatures
  | "aoe_small"  // cone ≤15 ft, line ≤30 ft, 5–10 ft radius
  | "aoe_medium" // 20 ft radius / 60 ft line
  | "aoe_large"; // 30+ ft radius, affects many targets

export type SaveType =
  | "automatic" // no save, no attack — always works (e.g. Magic Missile)
  | "attack_roll" // to-hit roll required (can miss)
  | "save_negates" // save completely negates the effect
  | "save_for_half"; // save halves damage (standard for big AoE)

export type DurationTier =
  | "instantaneous"
  | "conc_1min" // Concentration, up to 1 minute
  | "conc_10min" // Concentration, up to 10 minutes
  | "conc_1hour" // Concentration, up to 1 hour
  | "sustained_1min" // 1 minute, no concentration
  | "sustained_long"; // 8+ hours, no concentration

export interface AdvisorInputs {
  effectType: EffectType;
  effectIntensity: EffectIntensity; // for control / buff / utility — how powerful is the core effect?
  damageDice: string; // e.g. "3d6", "8d8+20" — for damage/healing spells
  targetingMode: TargetingMode;
  saveType: SaveType;
  durationTier: DurationTier;
  hasSecondaryEffect: boolean; // knockback, condition, rider effect
  requiresConcentration: boolean;
  isRitual: boolean;
  /** The target saves again each turn to end it (Hold Person). Absent means no. */
  repeatSave?: boolean;
  /** It ends when the target is harmed (Sleep, Hypnotic Pattern). */
  endsWhenHarmed?: boolean;
  /** Only some kinds of creature are affected (humanoids only). */
  limitedKinds?: boolean;
  /** The target can spend its action on a check to break free (Web, Entangle). */
  canBreakFree?: boolean;
}

export interface AdvisorResult {
  suggestedMin: number;
  suggestedMax: number;
  factors: string[]; // human-readable explanation per factor
  score: number; // the level before rounding, with its fraction
  /** False while there is nothing to weigh yet (a damage or healing spell with no dice): the range then means nothing. */
  estimated: boolean;
}

// ── Dice parser ───────────────────────────────────────────────────────────────
export { parseDiceAvg } from "@/lib/dice/dice";
import { parseDiceAvg } from "@/lib/dice/dice";

// ── The Spell Damage table ────────────────────────────────────────────────────
// DMG 2014 "Creating a Spell", Spell Damage: what a spell of each level deals to one target and to several, on the
// assumption of half damage on a successful save or a miss. The one source for the estimate and the reference
// table the panel shows.
export const SPELL_DAMAGE_TABLE: ReadonlyArray<{ level: number; label: string; oneTarget: string; manyTargets: string }> = [
  { level: 0, label: "Cantrip", oneTarget: "1d10", manyTargets: "1d6" },
  { level: 1, label: "1st", oneTarget: "2d10", manyTargets: "2d6" },
  { level: 2, label: "2nd", oneTarget: "3d10", manyTargets: "4d6" },
  { level: 3, label: "3rd", oneTarget: "5d10", manyTargets: "6d6" },
  { level: 4, label: "4th", oneTarget: "6d10", manyTargets: "7d6" },
  { level: 5, label: "5th", oneTarget: "8d10", manyTargets: "8d6" },
  { level: 6, label: "6th", oneTarget: "10d10", manyTargets: "11d6" },
  { level: 7, label: "7th", oneTarget: "11d10", manyTargets: "12d6" },
  { level: 8, label: "8th", oneTarget: "12d10", manyTargets: "13d6" },
  { level: 9, label: "9th", oneTarget: "15d10", manyTargets: "14d6" },
];

/**
 * Where an average sits on a column of the table, as a level with a fraction: halfway between the 2nd and 3rd
 * level rows reads 2.5. Below the cantrip row is 0; past the 9th the table's last step is carried on, so a spell
 * far above the table still reads as too strong for any level rather than as a tidy 9.
 */
export function levelOnDamageTable(avg: number, column: "oneTarget" | "manyTargets"): number {
  const rows = SPELL_DAMAGE_TABLE.map((row) => parseDiceAvg(row[column]));
  if (avg <= rows[0]) return 0;
  for (let level = 1; level < rows.length; level++) {
    if (avg <= rows[level]) return level - 1 + (avg - rows[level - 1]) / (rows[level] - rows[level - 1]);
  }
  const lastStep = rows[9] - rows[8];
  return 9 + (avg - rows[9]) / lastStep;
}

// ── Healing → level ───────────────────────────────────────────────────────────
// app convention, fitted to the SRD's healing spells and not the damage table: published healing sits far below
// published damage (Mass Cure Wounds heals 3d8 at 5th level, where the table gives several targets 8d6), and
// measured against the table the advisor put most healing spells two levels too low. The dice alone are counted;
// the caster's ability modifier on top is assumed.
const HEALING_UP_TO: ReadonlyArray<number> = [0, 10, 15, 20, 27, 35, 43, 51, 60];

function healingLevel(avg: number): number {
  const level = HEALING_UP_TO.findIndex((most) => avg <= most);
  return level === -1 ? 9 : Math.max(1, level);
}

const hitsSeveral = (mode: TargetingMode): boolean => mode !== "single" && mode !== "self";

// ── The weights ───────────────────────────────────────────────────────────────
// app convention, tuned against the SRD (`npm run spells:advisor-check`). Each is in spell levels.
export const ADVISOR_WEIGHTS = {
  /** Base level of a control effect by how much of a creature's turn it takes. */
  control: { weak: 1, moderate: 2, major: 4.5, extreme: 6 },
  buff: { weak: 0, moderate: 1, major: 3, extreme: 7 },
  utility: { weak: 0, moderate: 1, major: 3, extreme: 8 },
  /** What reaching more creatures adds to a control, buff or utility effect. Damage reads its own table column. */
  targets: { self: -0.5, single: 0, multi_2: 0.5, multi_3: 1, multi_4_5: 1.5, aoe_small: 0.5, aoe_medium: 1, aoe_large: 1.5 },
  /** A larger or smaller area than the table's unnamed "multiple targets", for damage. */
  damageArea: { aoe_small: -0.5, aoe_medium: 0, aoe_large: 0.5 },
  /** DMG: no effect on a save or a miss allows a quarter more damage, so such damage counts for less. */
  allOrNothingDamage: 1 / 1.25,
  /** Damage nothing can avoid counts for more by the same measure. */
  certainDamage: 1.25,
  /** A control effect that needs no save or attack at all. */
  controlNoSave: 1,
  /** Damage or healing that comes round after round while the spell lasts. */
  repeatingDamage: 1.5,
  concentration: -0.5,
  /** A control, buff or utility effect that outlasts a fight. */
  duration: { instantaneous: 0, conc_1min: 0, conc_10min: 0.5, conc_1hour: 0.5, sustained_1min: 0.5, sustained_long: 1 },
  rider: 0.5,
  ritual: -0.5,
  repeatSave: -0.5,
  endsWhenHarmed: -1,
  limitedKinds: -1,
  canBreakFree: -0.5,
} as const;

const INTENSITY_LABELS: Record<"control" | "buff" | "utility", Record<EffectIntensity, string>> = {
  control: {
    weak: "Weak control (prone, grappled, deafened, a minor penalty)",
    moderate: "Moderate control (restrained, frightened, blinded, poisoned, charmed)",
    major: "Major control (the creature loses its turn: paralyzed, stunned, incapacitated, banished)",
    extreme: "Extreme control (the creature is made a puppet, or removed for good)",
  },
  buff: {
    weak: "Weak buff (a small bonus, +d4)",
    moderate: "Moderate buff (advantage, resistance)",
    major: "Major buff (an extra attack, flight, haste)",
    extreme: "Extreme buff (an extra action, immunity, the dead raised)",
  },
  utility: {
    weak: "Minor utility (a convenience, limited information)",
    moderate: "Moderate utility (solves one kind of problem)",
    major: "Major utility (teleportation, deep lore)",
    extreme: "World-altering utility (Wish, Gate)",
  },
};

const signed = (n: number): string => {
  const whole = Math.trunc(Math.abs(n));
  const half = Math.abs(n) - whole >= 0.5 ? "½" : "";
  const size = `${whole === 0 && half ? "" : whole}${half}`;
  return `${n < 0 ? "-" : "+"}${size} level${Math.abs(n) > 1 ? "s" : ""}`;
};

// ── Main advisor ──────────────────────────────────────────────────────────────

export function adviseLevelRange(inputs: AdvisorInputs): AdvisorResult {
  const W = ADVISOR_WEIGHTS;
  const factors: string[] = [];
  let score = 0;
  const add = (amount: number, why: string): void => {
    if (amount === 0) return;
    score += amount;
    factors.push(`${why} ${signed(amount)}`);
  };

  // Which of the two ways the estimate starts: from dice, or from how strong the DM says the effect is.
  const judged = inputs.effectType === "damage" || inputs.effectType === "healing" ? null : inputs.effectType;
  const dice = judged === null;
  const lasting = inputs.durationTier !== "instantaneous";

  if (dice) {
    const avg = parseDiceAvg(inputs.damageDice);
    const what = inputs.effectType === "damage" ? "damage" : "healing";
    if (avg > 0) {
      const column = hitsSeveral(inputs.targetingMode) ? "manyTargets" : "oneTarget";
      // The table's own assumption is half on a save or a miss; the other cases are measured against it.
      let counted = avg;
      let how = "";
      if (inputs.effectType === "damage") {
        if (inputs.saveType === "attack_roll" || inputs.saveType === "save_negates") {
          counted = avg * W.allOrNothingDamage;
          how = ", nothing on a miss or a save";
        } else if (inputs.saveType === "automatic") {
          counted = avg * W.certainDamage;
          how = ", which nothing avoids";
        }
      }
      if (inputs.effectType === "healing") {
        score = healingLevel(avg);
        factors.push(`~${Math.round(avg)} average healing, before the caster's modifier: about ${SPELL_DAMAGE_TABLE[score].label} level (healing is never a cantrip)`);
        add(W.targets[inputs.targetingMode], "It heals more than one creature");
      } else {
        score = levelOnDamageTable(counted, column);
        const row = SPELL_DAMAGE_TABLE[Math.max(0, Math.min(9, Math.round(score)))];
        factors.push(`~${Math.round(avg)} average damage${how} to ${column === "oneTarget" ? "one target" : "several targets"}: about ${row.level === 0 ? "a cantrip" : `${row.label} level`} (${row[column]} on the table)`);
      }
      if (inputs.effectType === "damage" && (inputs.targetingMode === "aoe_small" || inputs.targetingMode === "aoe_large")) {
        add(W.damageArea[inputs.targetingMode], inputs.targetingMode === "aoe_small" ? "A small area catches few" : "A large area catches many");
      }
      if (lasting) add(W.repeatingDamage, `The ${what} can come again while the spell lasts`);
    }
  }
  if (judged !== null) {
    const kind = judged;
    score = W[kind][inputs.effectIntensity];
    factors.push(`${INTENSITY_LABELS[kind][inputs.effectIntensity]}: base level ${score}`);
    const reach: Record<TargetingMode, string> = {
      self: "Only the caster",
      single: "",
      multi_2: "Up to 2 creatures",
      multi_3: "Up to 3 creatures",
      multi_4_5: "Up to 4 or 5 creatures",
      aoe_small: "A small area",
      aoe_medium: "A medium area",
      aoe_large: "A large area",
    };
    add(W.targets[inputs.targetingMode], reach[inputs.targetingMode]);
    if (kind === "control" && inputs.saveType === "automatic") add(W.controlNoSave, "No save and no attack roll: it always lands");
    add(W.duration[inputs.durationTier], "It outlasts a fight");
  }

  if (inputs.requiresConcentration) add(W.concentration, "Concentration: the caster can lose it, and holds no other");
  if (inputs.hasSecondaryEffect) add(W.rider, "A condition or other rider on top");
  if (inputs.repeatSave) add(W.repeatSave, "The target saves again each turn");
  if (inputs.endsWhenHarmed) add(W.endsWhenHarmed, "It ends when the target is harmed");
  if (inputs.limitedKinds) add(W.limitedKinds, "Only some kinds of creature are affected");
  if (inputs.canBreakFree) add(W.canBreakFree, "The target can break free with a check");
  if (inputs.isRitual) add(W.ritual, "It can be cast as a ritual");

  // ── Clamp and round to level range ────────────────────────────────────────
  const finalLevel = Math.max(0, Math.min(9, Math.round(score)));
  const min = Math.max(0, finalLevel - 1);
  const max = Math.min(9, finalLevel + 1);

  if (factors.length === 0) {
    factors.push(dice ? "Enter the dice to get an estimate" : "Nothing to estimate yet");
  }
  // Past the table: no level holds this, and the range alone ("8th to 9th") would hide that.
  if (score > 9.5) factors.push("This is stronger than a 9th-level spell: lower the dice or narrow the effect");

  return { suggestedMin: min, suggestedMax: max, factors, score, estimated: !dice || parseDiceAvg(inputs.damageDice) > 0 };
}

// ── Reference spells by level (for non-damage advisor display) ────────────────
// Shows 2-3 canonical SRD examples near each level so the user can sanity-check.
export const REFERENCE_SPELLS: Record<
  number,
  { control?: string; buff?: string; utility?: string }
> = {
  0: {
    buff: "Guidance, Resistance",
    utility: "Prestidigitation, Mage Hand, Light",
  },
  1: {
    control: "Bane, Command",
    buff: "Bless, Heroism, Shield",
    utility: "Detect Magic, Comprehend Languages",
  },
  2: {
    control: "Hold Person, Web",
    buff: "Enhance Ability, Blur",
    utility: "Darkvision, Locate Object",
  },
  3: {
    control: "Slow, Hypnotic Pattern",
    buff: "Haste, Protection from Energy",
    utility: "Fly, Clairvoyance, Tongues",
  },
  4: {
    control: "Banishment, Confusion",
    buff: "Freedom of Movement, Greater Invis.",
    utility: "Arcane Eye, Dimension Door",
  },
  5: {
    control: "Hold Monster, Dominate Person",
    buff: "Seeming, Steel Wind Strike",
    utility: "Teleportation Circle, Legend Lore",
  },
  6: {
    control: "Mass Suggestion, Eyebite",
    buff: "Heroes' Feast, True Seeing",
    utility: "Find the Path, Word of Recall",
  },
  7: {
    control: "Power Word Fortify, Symbol",
    buff: "Regenerate, Resurrection",
    utility: "Plane Shift, Teleport",
  },
  8: {
    control: "Dominate Monster, Feeblemind",
    buff: "Mind Blank, Holy Aura",
    utility: "Antipathy / Sympathy",
  },
  9: {
    control: "Power Word Stun, Imprisonment",
    buff: "Power Word Heal, Foresight",
    utility: "Wish, Gate",
  },
};

// ── School design tips ────────────────────────────────────────────────────────
// General design principles used by D&D writers per school.
// These are qualitative — shown in the advisor to guide the homebrew author.
export const SCHOOL_DESIGN_TIPS: Record<string, { title: string; tips: string[] }> = {
  abjuration: {
    title: "Abjuration",
    tips: [
      "Core purpose: protection, prevention, and counterspelling.",
      "Typical mechanics: temporary HP, AC bonuses, damage resistance, negating other spells.",
      "Most abjurations are reactions or short-duration buffs; concentration is common for the bigger ones.",
      "Avoid overlap with the Armor of Agathys / Shield / Counterspell design space without a meaningful twist.",
    ],
  },
  conjuration: {
    title: "Conjuration",
    tips: [
      "Core purpose: bringing creatures or matter to you, or moving yourself elsewhere.",
      "Summon spells: balance the summoned creature's CR roughly equal to spell level - 1.",
      "Teleportation spells are premium utility; keep range limited or add a destination restriction.",
      "Conjured objects/terrain (e.g. Web, Grease) need a clear area size, material property, and removal condition.",
    ],
  },
  divination: {
    title: "Divination",
    tips: [
      "Core purpose: information and foresight; no direct damage.",
      "Value scales with information quality: targeting one creature < targeting an area < campaign-scope knowledge.",
      "Most divinations should be ritual-eligible; they rarely need concentration.",
      "Be careful with scrying effects; unlimited range information is a 5th-level benchmark (Scrying).",
    ],
  },
  enchantment: {
    title: "Enchantment",
    tips: [
      "Core purpose: directly influencing the minds of others.",
      "Most enchantments are Wisdom saves (the mental defense stat).",
      "Charm vs. dominate is the key axis: charm = friendly, dominate = puppet; domination is ~2 levels higher.",
      "The more creatures affected or the less agency they retain, the higher the level should be.",
      "Consider humanoids-only restrictions to keep lower-level spells balanced.",
    ],
  },
  evocation: {
    title: "Evocation",
    tips: [
      "Core purpose: raw elemental energy, usually damage.",
      "Use the damage benchmark table as the primary guide for level.",
      "Saving throw + half damage is the standard for AoE. No-save should cost +1 level.",
      "Elemental type matters for balance: fire/lightning are common and often resisted; psychic/force are rare and rarely resisted.",
      "Cantrips should have a rider effect (push, slow, damage type variety) to stay competitive.",
    ],
  },
  illusion: {
    title: "Illusion",
    tips: [
      "Core purpose: deception: false sensory information.",
      "Illusions that deal no direct harm are generally 1-2 levels lower than equivalent control spells.",
      "Interaction checks (Investigation vs. spell DC) should be part of the spell text.",
      "Silent Image (1st) → Major Image (3rd) → Programmed Illusion (6th) is the canonical complexity ladder.",
      'Illusory damage that is "real" to the target is extremely powerful; treat as full damage spells.',
    ],
  },
  necromancy: {
    title: "Necromancy",
    tips: [
      "Core purpose: life force manipulation (both dealing necrotic damage and raising undead).",
      "Necrotic damage is rarely resisted, so benchmark slightly above equivalent fire damage.",
      "Undead summoning scales with undead CR and quantity; Animate Dead is 3rd because the undead persist.",
      "Life-drain effects (steal HP and give to caster) are powerful; the healing component adds ~1 level.",
      "Resurrection spells are off the normal scale; cost is in material components, not level alone.",
    ],
  },
  transmutation: {
    title: "Transmutation",
    tips: [
      "Core purpose: changing the physical properties of creatures or objects.",
      "Buffs that grant a wholly new capability (flight, water breathing) follow the utility scale, not the buff scale.",
      "Polymorphing a target is Concentration + powerful transformation; a 4th-level benchmark (Polymorph).",
      "Physical stat boosts (+2 STR etc.) are weaker than advantage; keep them at 2nd–3rd level.",
      "Object-only transmutations (heat metal, stone shape) can be lower level as they don't affect action economy.",
    ],
  },
};
