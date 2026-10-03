import type { PlayerVisibleMonster } from "@/types/monster.types";
import type { WildshapeState } from "@/types/encounter.types";
import { parseCr } from "@/lib/utils";
import { hitPointsToMax } from "@/lib/dice/dice";
import type { RulesetKey } from "@/types/ruleset.types";

// Shared wild shape eligibility rules. These live here (not inlined per-view) so the
// DM encounter runner, the player character sheet and the player bestiary all agree
// on which beasts a druid may assume — see combat-encounters.md.

/**
 * Wild Shape by the book, per edition. One function derives every number the
 * sheet, the runner, the bestiary and the rest dialog need, so they cannot
 * disagree. Nothing here is a house rule: see the table in epic #959.
 */
export interface WildShapeRules {
  edition: RulesetKey;
  /** 0 below druid level 2; null = unlimited (2014 Archdruid, level 20). */
  maxUses: number | null;
  /** What a short rest restores: every use (2014) or one (2024). */
  shortRestRegain: "all" | 1;
  maxCr: number;
  flyAllowed: boolean;
  swimAllowed: boolean;
  /** 2024 Known Forms: 0 below level 2, 4 at 2, 6 at 4, 8 at 8. null in 2014 (any beast the druid has seen). */
  knownForms: number | null;
  /** "beast": take the beast's hit points (2014). "own": keep your own and gain temp HP (2024). */
  hpModel: "beast" | "own";
  /** Temp HP gained on assuming a form: 2024 druid level, 2024 Moon (level 3+) 3 x druid level; 0 in 2014. */
  tempHpOnShape: number;
  /** 2024 Circle of the Moon (level 3+): AC is at least 13 + WIS mod. null otherwise. */
  acFloor: number | null;
  /** Bonus action: always in 2024; 2014 only for Circle of the Moon. */
  bonusAction: boolean;
  /** floor(druidLevel / 2), both editions. */
  durationHours: number;
  /** 2014 Circle of the Moon, level 2+: Combat Wild Shape slot healing. */
  slotHealing: boolean;
  /** 2024, druid level 5+. */
  wildResurgence: boolean;
  /** 2014 Circle of the Moon, level 10+: Elemental Wild Shape. */
  elementalForms: boolean;
  /** 2024, druid level 20: Evergreen Wild Shape. */
  evergreen: boolean;
}

export function wildShapeRules(input: {
  edition: RulesetKey;
  druidLevel: number;
  isCircleOfMoon: boolean;
  wisMod: number;
}): WildShapeRules {
  const { edition, druidLevel: L, isCircleOfMoon, wisMod } = input;
  const is2024 = edition === "2024";
  // 2014 Moon gets Circle Forms at 2; 2024 Moon at 3.
  const moon = isCircleOfMoon && L >= (is2024 ? 3 : 2);
  const baseCr = L < 4 ? 0.25 : L < 8 ? 0.5 : 1;
  const moonCr = is2024 ? Math.floor(L / 3) : Math.max(1, Math.floor(L / 3));

  let maxUses: number | null;
  if (L < 2) maxUses = 0;
  else if (is2024) maxUses = L < 6 ? 2 : L < 17 ? 3 : 4;
  else maxUses = L >= 20 ? null : 2;

  return {
    edition,
    maxUses,
    shortRestRegain: is2024 ? 1 : "all",
    maxCr: moon ? moonCr : baseCr,
    flyAllowed: L >= 8,
    swimAllowed: is2024 || L >= 4,
    knownForms: is2024 ? (L < 2 ? 0 : L < 4 ? 4 : L < 8 ? 6 : 8) : null,
    hpModel: is2024 ? "own" : "beast",
    tempHpOnShape: is2024 && L >= 2 ? (moon ? 3 * L : L) : 0,
    acFloor: is2024 && moon ? 13 + wisMod : null,
    bonusAction: is2024 || isCircleOfMoon,
    durationHours: Math.floor(L / 2),
    slotHealing: !is2024 && isCircleOfMoon && L >= 2,
    wildResurgence: is2024 && L >= 5,
    elementalForms: !is2024 && isCircleOfMoon && L >= 10,
    evergreen: is2024 && L >= 20,
  };
}

/**
 * A character's Wild Shape rules from their row, class rows and edition: the
 * one place the druid profile, the edition and the Wisdom modifier meet, for
 * `useWildshapeDruid` and the runner's Evergreen check alike.
 */
export function wildShapeRulesFor(
  member: { class?: string | null; subclass?: string | null; level?: number | null; wis?: number | null } | null | undefined,
  classRows: readonly { class_name: string; subclass_name: string | null; levels: number }[],
  edition: RulesetKey,
): WildShapeRules {
  const profile = druidProfile(member, classRows);
  const wis = member?.wis;
  return wildShapeRules({
    edition,
    druidLevel: profile.druidLevel,
    isCircleOfMoon: profile.isCircleOfMoon,
    wisMod: wis === null || wis === undefined ? 0 : Math.floor((wis - 10) / 2),
  });
}

/** What Wild Shape needs to know about a character's druid class. */
export interface DruidProfile {
  isDruid: boolean;
  /** Levels in the Druid CLASS, not the character's total level. 0 if none. */
  druidLevel: number;
  isCircleOfMoon: boolean;
}

/**
 * Derive druid-ness, druid class level and circle from the `character_classes`
 * rows (the source of truth for a multiclass character), falling back to the
 * legacy `party_members` class/subclass/level fields for a character that has
 * no rows.
 *
 * Reading `member.class` and `member.level` directly is the bug this replaces:
 * taking Druid as a second class never rewrites `member.class`, so the druid
 * was not recognised at all, and the CR cap was computed from TOTAL level, so a
 * Fighter 6 / Druid 2 was offered CR 1½ forms instead of ¼. One function, so
 * the sheet, the bestiary and the encounter runner cannot disagree about it.
 */
export function druidProfile(
  member: { class?: string | null; subclass?: string | null; level?: number | null } | null | undefined,
  classRows: readonly { class_name: string; subclass_name: string | null; levels: number }[],
): DruidProfile {
  const druidRow = classRows.find((row) => row.class_name.toLowerCase().includes("druid"));
  const legacyDruid = member?.class?.toLowerCase().includes("druid") ?? false;
  return {
    isDruid: !!druidRow || legacyDruid,
    druidLevel: druidRow?.levels ?? (legacyDruid ? (member?.level ?? 1) : 0),
    isCircleOfMoon: (druidRow?.subclass_name ?? member?.subclass)?.toLowerCase().includes("moon") ?? false,
  };
}

/**
 * The overlay a character takes on when assuming `beast`: the beast's full hit
 * points, its AC, and its picture. Null when the beast's stats are withheld
 * from this viewer (a player-visible row with no stat block), because then
 * there is no hit point pool to take on.
 *
 * Pass the beast with its library art already merged (`withLibraryArt`). The
 * monster lists carry only the `library_monsters` row's own `image_url`, so a
 * beast whose picture lives in the art tables (a DM's override, typically)
 * shaped into a form with no picture.
 *
 * The one builder for the encounter runner and the player sheet, which each
 * had a copy.
 */
export function wildshapeStateFor(
  beast: Pick<PlayerVisibleMonster, "id" | "name" | "image_url" | "stat_block" | "monster_type">,
  rules: WildShapeRules,
): { form: WildshapeState; tempHp: number; usesCost: number } | null {
  const sb = beast.stat_block;
  if (!sb) return null;
  const usesCost = wildShapeFormCost(beast, rules);
  if (usesCost === null) return null;
  const beastAc = String(sb.armor_class ?? "10");
  const own = rules.hpModel === "own";
  const maxHp = own ? null : hitPointsToMax(sb.hit_points, 1);
  // The Moon's floor only helps when the beast's own AC is lower than it.
  const numericAc = Number.parseInt(beastAc, 10);
  const useFloor = rules.acFloor !== null && (Number.isNaN(numericAc) || rules.acFloor > numericAc);
  return {
    form: {
      monster_id: beast.id,
      beast_name: beast.name,
      beast_image_url: beast.image_url,
      beast_hp: maxHp,
      beast_max_hp: maxHp,
      beast_ac: useFloor ? String(rules.acFloor) : beastAc,
    },
    tempHp: rules.tempHpOnShape,
    usesCost,
  };
}

/** Human-readable CR label, rendering fractional CRs as fractions. */
export function wildshapeCrDisplay(cr: number): string {
  if (cr === 0.125) return "1/8";
  if (cr === 0.25) return "1/4";
  if (cr === 0.5) return "1/2";
  return String(cr);
}

const ELEMENTAL_FORMS = new Set(["air elemental", "earth elemental", "fire elemental", "water elemental"]);

/**
 * Uses a form costs, or null when it is not a legal form: 1 for an eligible
 * beast; 2 for an air, earth, fire or water elemental under 2014 Elemental
 * Wild Shape.
 *
 * Takes `PlayerVisibleMonster` because this runs on the player's own bestiary,
 * where an unrevealed creature arrives with a null `stat_block` (#842). A full
 * `Monster` still satisfies it, so every DM caller is unaffected.
 */
export function wildShapeFormCost(monster: Pick<PlayerVisibleMonster, "name" | "monster_type" | "stat_block">, rules: WildShapeRules): number | null {
  if (rules.elementalForms && ELEMENTAL_FORMS.has(monster.name.trim().toLowerCase())) return 2;
  if ((monster.monster_type ?? "").toLowerCase() !== "beast") return null;
  if (parseCr(monster.stat_block?.challenge_rating) > rules.maxCr) return null;
  const speed = (monster.stat_block?.speed ?? "").toLowerCase();
  if (!rules.flyAllowed && speed.includes("fly")) return null;
  if (!rules.swimAllowed && speed.includes("swim")) return null;
  return 1;
}

/** Known Forms (2024) stored on the character: class_choices.wild_shape_known_forms (monster ids). */
export function knownFormIds(classChoices: Record<string, unknown> | null | undefined): string[] {
  const raw = classChoices?.wild_shape_known_forms;
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
}

/**
 * The forms a druid can take right now: 2014, discovered or pinned; 2024,
 * known or pinned. Each with its cost; sorted by CR.
 */
export function availableWildShapeForms<M extends PlayerVisibleMonster>(input: {
  monsters: readonly M[];
  rules: WildShapeRules;
  discoveredIds: ReadonlySet<string>;
  pinnedIds: ReadonlySet<string>;
  knownIds: ReadonlySet<string>;
}): { monster: M; usesCost: number }[] {
  const { monsters, rules, discoveredIds, pinnedIds, knownIds } = input;
  const out: { monster: M; usesCost: number }[] = [];
  for (const monster of monsters) {
    const seen = rules.edition === "2024" ? knownIds.has(monster.id) : discoveredIds.has(monster.id);
    if (!seen && !pinnedIds.has(monster.id)) continue;
    const usesCost = wildShapeFormCost(monster, rules);
    if (usesCost !== null) out.push({ monster, usesCost });
  }
  return out.sort((a, b) => parseCr(a.monster.stat_block?.challenge_rating) - parseCr(b.monster.stat_block?.challenge_rating));
}

/** Known Forms after learning `id`: unchanged when it is already known or the roster is full. */
export function learnKnownForm(known: readonly string[], id: string, cap: number): string[] {
  if (known.includes(id) || known.length >= cap) return [...known];
  return [...known, id];
}

/** Known Forms after swapping `oldId` for `newId`, in the same slot; unchanged if `oldId` is absent or `newId` already known. */
export function replaceKnownForm(known: readonly string[], oldId: string, newId: string): string[] {
  if (!known.includes(oldId) || known.includes(newId)) return [...known];
  return known.map((id) => (id === oldId ? newId : id));
}

/** Known Forms with `id` forgotten (an unresolvable id the DM deleted, say). */
export function forgetKnownForm(known: readonly string[], id: string): string[] {
  return known.filter((k) => k !== id);
}
