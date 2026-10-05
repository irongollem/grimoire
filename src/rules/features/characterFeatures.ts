import type { AbilityKey } from "@/rules/characterCreation";
import type { ClassFeature } from "@/types/feature.types";
import type { PartyMember } from "@/types/party.types";
import type { Activation, DamageRider, FeatureMechanics, Recharge, UsesCost } from "./mechanics.types";
import { parseMechanics } from "./mechanics";
import { ridersFor, riderDice, scalingAt, usesMaxAt, rechargeAt, type AttackShape } from "./resolve";

/**
 * What a character has from its features and feats (#976), derived from the
 * class definitions' per-level id lists plus the feats stored on the character.
 * Pure: the composable fetches, this decides. Mechanics are read through
 * `parseMechanics` because the jsonb is untrusted.
 */

export type StoredClassResources = PartyMember["class_resources"];

export type FeatureGrant =
  | {
      kind: "class" | "subclass";
      className: string;
      subclassName: string | null;
      /** The character's level in the granting class. */
      classLevel: number;
      /** Every class level (<= classLevel) at which the table lists the feature. */
      levelsGained: number[];
    }
  | { kind: "feat"; via: "level" | "origin"; atLevel: number | null };

export interface GrantedFeature {
  feature: ClassFeature;
  mechanics: FeatureMechanics;
  grant: FeatureGrant;
  scalingValue: string | null;
}

export interface GrantedClassInput {
  className: string;
  subclassName: string | null;
  levels: number;
  classMap: Record<string, string[]> | null;
  subclassMap: Record<string, string[]> | null;
}

export interface GrantedFeaturesInput {
  classes: GrantedClassInput[];
  /** Must also hold the replacement rows named in `class_choices.feature_swaps` (see `featureIdsNeeded`). */
  featuresById: ReadonlyMap<string, ClassFeature>;
  classChoices: Record<string, unknown>;
  levelChoices: Record<string, unknown>;
  /** Total character level; a feat has no granting class, so its levels are this. */
  characterLevel: number;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** Ids of the feats on the character; anything but a string array is ignored (untrusted jsonb). */
export function featIdsOf(classChoices: Record<string, unknown>): string[] {
  return isStringArray(classChoices.feats) ? classChoices.feats : [];
}

/**
 * `class_choices.feature_swaps`: replaced feature's conceptual_key -> id of the
 * optional feature taken instead. Untrusted jsonb, so non-string values drop.
 */
export function swapsOf(classChoices: Record<string, unknown>): Record<string, string> {
  const raw = classChoices.feature_swaps;
  const out: Record<string, string> = {};
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw)) if (typeof value === "string") out[key] = value;
  }
  return out;
}

/** Every distinct feature id a set of class/subclass maps and feats can grant. Used to fetch them. */
export function featureIdsNeeded(
  classes: GrantedClassInput[],
  classChoices: Record<string, unknown>,
): string[] {
  const ids = new Set<string>();
  for (const cls of classes) {
    for (const map of [cls.classMap, cls.subclassMap]) {
      if (!map) continue;
      for (const list of Object.values(map)) for (const id of list) ids.add(id);
    }
  }
  for (const id of featIdsOf(classChoices)) ids.add(id);
  // A Tasha's replacement sits in no class map, so its id is only known from the swap record.
  for (const id of Object.values(swapsOf(classChoices))) ids.add(id);
  return [...ids];
}

/** True when the value, anywhere inside it, is the string `id`. Level-up stores picks under several shapes. */
function mentions(value: unknown, id: string): boolean {
  if (value === id) return true;
  if (Array.isArray(value)) return value.some((v) => mentions(v, id));
  if (value !== null && typeof value === "object") return Object.values(value).some((v) => mentions(v, id));
  return false;
}

/** The character levels whose level-up entry mentions the id, ascending. */
function levelsMentioning(levelChoices: Record<string, unknown>, id: string): number[] {
  return Object.keys(levelChoices)
    .map(Number)
    .filter((n) => Number.isFinite(n) && mentions(levelChoices[String(n)], id))
    .sort((a, b) => a - b);
}

function scalingFor(mechanics: FeatureMechanics, level: number): string | null {
  return mechanics.scaling ? scalingAt(mechanics.scaling, level) : null;
}

/** id -> levels (<= maxLevel, ascending) at which a per-level map lists it, in first-gained order. */
function gainedLevels(map: Record<string, string[]> | null, maxLevel: number): Map<string, number[]> {
  const result = new Map<string, number[]>();
  if (!map) return result;
  const levels = Object.keys(map)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n <= maxLevel)
    .sort((a, b) => a - b);
  for (const level of levels) {
    for (const id of map[String(level)]) {
      const seen = result.get(id);
      if (seen) {
        if (!seen.includes(level)) seen.push(level);
      } else {
        result.set(id, [level]);
      }
    }
  }
  return result;
}

export function grantedFeatures(input: GrantedFeaturesInput): GrantedFeature[] {
  const out: GrantedFeature[] = [];
  const swaps = swapsOf(input.classChoices);

  for (const cls of input.classes) {
    const sources = [
      { kind: "class" as const, map: cls.classMap },
      { kind: "subclass" as const, map: cls.subclassMap },
    ];
    for (const source of sources) {
      const emitted = new Set<string>();
      for (const [id, levelsGained] of gainedLevels(source.map, cls.levels)) {
        let feature = input.featuresById.get(id);
        if (!feature) continue;
        let { mechanics } = parseMechanics(feature.mechanics);
        // An optional feature is never granted by default; it arrives only through a swap record below.
        if (mechanics.replaces !== undefined) continue;
        // A swap puts the replacement where the replaced feature stood, at the same levels.
        const key = feature.conceptual_key;
        const swappedId = key !== null && key !== undefined && Object.hasOwn(swaps, key) ? swaps[key] : null;
        const replacement = swappedId === null ? undefined : input.featuresById.get(swappedId);
        if (replacement) {
          feature = replacement;
          mechanics = parseMechanics(replacement.mechanics).mechanics;
        }
        if (emitted.has(feature.id)) continue;
        emitted.add(feature.id);
        out.push({
          feature,
          mechanics,
          grant: {
            kind: source.kind,
            className: cls.className,
            subclassName: cls.subclassName,
            classLevel: cls.levels,
            levelsGained,
          },
          scalingValue: scalingFor(mechanics, cls.levels),
        });
      }
    }
  }

  const originId = typeof input.classChoices.origin_feat_id === "string" ? input.classChoices.origin_feat_id : null;
  const feats: { granted: GrantedFeature; sortLevel: number }[] = [];
  let originUsed = false;
  const takenCount = new Map<string, number>();
  featIdsOf(input.classChoices).forEach((id) => {
    const feature = input.featuresById.get(id);
    if (!feature) return;
    const { mechanics } = parseMechanics(feature.mechanics);
    // The origin feat is the first occurrence of its id; it is the background's, not a level's.
    const isOrigin = originId === id && !originUsed;
    if (isOrigin) originUsed = true;
    let atLevel: number | null = null;
    if (!isOrigin) {
      const nth = takenCount.get(id) ?? 0;
      takenCount.set(id, nth + 1);
      const levels = levelsMentioning(input.levelChoices, id);
      atLevel = nth < levels.length ? levels[nth] : null;
    }
    feats.push({
      granted: {
        feature,
        mechanics,
        grant: { kind: "feat", via: isOrigin ? "origin" : "level", atLevel },
        scalingValue: scalingFor(mechanics, input.characterLevel),
      },
      sortLevel: atLevel === null ? 0 : atLevel,
    });
  });
  feats.sort((a, b) => a.sortLevel - b.sortLevel);
  for (const f of feats) out.push(f.granted);
  return out;
}

/** The level a feature's numbers read: the granting class's, or the character's for a feat. */
function levelOf(granted: GrantedFeature, characterLevel: number): number {
  return granted.grant.kind === "feat" ? characterLevel : granted.grant.classLevel;
}

export interface ResourcePool {
  key: string;
  label: string;
  max: number | "unlimited";
  recharge: Recharge;
  shortRestRegain: number | null;
  pool: boolean;
  /** Names of the features that feed the pool. */
  sources: string[];
}

export interface PoolContext {
  proficiencyBonus: number;
  abilityScores: Record<AbilityKey, number>;
  characterLevel: number;
}

function biggerMax(a: number | "unlimited", b: number | "unlimited"): boolean {
  if (a === "unlimited") return false;
  if (b === "unlimited") return true;
  return b > a;
}

/**
 * One pool per `uses.key`. A key two features share (Channel Divinity from
 * Cleric and Paladin) is one pool at the larger maximum: the multiclassing rule
 * is that gaining the feature again gives no additional uses.
 */
export function resourcePools(granted: GrantedFeature[], ctx: PoolContext): ResourcePool[] {
  const pools = new Map<string, ResourcePool>();
  for (const g of granted) {
    const uses = g.mechanics.uses;
    if (!uses) continue;
    const classLevel = levelOf(g, ctx.characterLevel);
    const max = usesMaxAt(uses, {
      classLevel,
      proficiencyBonus: ctx.proficiencyBonus,
      abilityScores: ctx.abilityScores,
    });
    const recharge = rechargeAt(uses, classLevel);
    const regain = uses.short_rest_regain === undefined ? null : uses.short_rest_regain;
    const existing = pools.get(uses.key);
    if (!existing) {
      pools.set(uses.key, {
        key: uses.key,
        label: uses.label,
        max,
        recharge,
        shortRestRegain: regain,
        pool: uses.pool,
        sources: [g.feature.name],
      });
      continue;
    }
    if (!existing.sources.includes(g.feature.name)) existing.sources.push(g.feature.name);
    if (biggerMax(existing.max, max)) {
      existing.max = max;
      existing.label = uses.label;
      existing.recharge = recharge;
    }
    if (regain !== null && (existing.shortRestRegain === null || regain > existing.shortRestRegain)) {
      existing.shortRestRegain = regain;
    }
    if (uses.pool) existing.pool = true;
  }
  return [...pools.values()];
}

function restOf(recharge: Recharge): "short" | "long" {
  return recharge === "turn" || recharge === "short" ? "short" : "long";
}

/**
 * The `class_resources` object the character should hold. Unlimited pools are
 * left out (the sheet shows "Unlimited"); `current` is kept, clamped to the new
 * max, and a new key starts full; keys no pool produces are dropped.
 */
export function classResourcesFor(pools: ResourcePool[], stored: StoredClassResources): StoredClassResources {
  const next: StoredClassResources = {};
  for (const pool of pools) {
    if (pool.max === "unlimited") continue;
    const previous = Object.hasOwn(stored, pool.key) ? stored[pool.key] : null;
    const current = previous === null ? pool.max : Math.min(Math.max(previous.current, 0), pool.max);
    next[pool.key] = {
      current,
      max: pool.max,
      rest: restOf(pool.recharge),
      ...(pool.shortRestRegain === null ? {} : { short_rest_regain: pool.shortRestRegain }),
    };
  }
  return next;
}

export function classResourcesChanged(a: StoredClassResources, b: StoredClassResources): boolean {
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return true;
  return keysA.some((key) => {
    if (!Object.hasOwn(b, key)) return true;
    const x = a[key];
    const y = b[key];
    return (
      x.current !== y.current ||
      x.max !== y.max ||
      x.rest !== y.rest ||
      x.short_rest_regain !== y.short_rest_regain
    );
  });
}

export interface ActionEntry {
  featureId: string;
  featureName: string;
  name: string;
  activation: Activation;
  spends: UsesCost | null;
  toggleKey: string | null;
  isSubAction: boolean;
}

export function actionsByActivation(granted: GrantedFeature[]): Record<Activation, ActionEntry[]> {
  const result: Record<Activation, ActionEntry[]> = { action: [], bonus_action: [], reaction: [], special: [] };
  // A feature gained twice (a feat taken again, a key in class and subclass) is one thing to do.
  const seen = new Set<string>();
  for (const g of granted) {
    if (seen.has(g.feature.id)) continue;
    seen.add(g.feature.id);
    const m = g.mechanics;
    const spends = m.spends ?? m.toggle?.spends;
    // A feature that only groups its sub-actions (Cunning Action: Dash,
    // Disengage, Hide) is not a thing to do of its own: listing it beside them
    // says the same thing twice. One that spends or switches something is.
    const onlyGroups = (m.actions?.length ?? 0) > 0 && !spends && !m.toggle;
    if (m.activation && !onlyGroups) {
      result[m.activation].push({
        featureId: g.feature.id,
        featureName: g.feature.name,
        name: g.feature.name,
        activation: m.activation,
        spends: spends ? { key: spends.key, amount: spends.amount } : null,
        toggleKey: m.toggle ? m.toggle.key : null,
        isSubAction: false,
      });
    }
    for (const sub of m.actions ?? []) {
      result[sub.activation].push({
        featureId: g.feature.id,
        featureName: g.feature.name,
        name: sub.name,
        activation: sub.activation,
        spends: sub.spends ? { key: sub.spends.key, amount: sub.spends.amount } : null,
        toggleKey: null,
        isSubAction: true,
      });
    }
  }
  return result;
}

export function activeToggles(classChoices: Record<string, unknown>): Set<string> {
  const on = new Set<string>();
  const suffix = "_active";
  for (const [key, value] of Object.entries(classChoices)) {
    if (value === true && key.endsWith(suffix) && key.length > suffix.length) {
      on.add(key.slice(0, -suffix.length));
    }
  }
  return on;
}

export interface OfferedRider {
  featureId: string;
  rider: DamageRider;
  dice: string | null;
}

export function damageRidersFor(
  granted: GrantedFeature[],
  attack: AttackShape,
  toggles: ReadonlySet<string>,
  slotLevel?: number,
): OfferedRider[] {
  const offered: OfferedRider[] = [];
  const seen = new Set<string>();
  for (const g of granted) {
    if (seen.has(g.feature.id) || !g.mechanics.riders) continue;
    seen.add(g.feature.id);
    for (const rider of ridersFor(g.mechanics.riders, attack, toggles)) {
      offered.push({ featureId: g.feature.id, rider, dice: riderDice(rider, { scalingValue: g.scalingValue, slotLevel }) });
    }
  }
  return offered;
}
