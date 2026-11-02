import type {
  GrantedClassInput,
  GrantedFeature,
  ResourcePool,
} from "@/rules/features/characterFeatures";

/**
 * The character as it will be once this level is taken, seen as the same
 * `GrantedClassInput` list the sheet reads (#976). Pure: the wizard resolves
 * definitions and hands them in; nothing here reads a store.
 */

export type FeatureMap = Record<string, string[]>;

export interface ClassRowInfo {
  id: string;
  className: string;
  subclassName: string | null;
  levels: number;
  classFeatures: FeatureMap | null;
  subclassFeatures: FeatureMap | null;
  /** The class's armor training as the definition lists it. */
  armorProficiencies: string[];
  /** The class definition's capabilities (`"wild_shape"`), as its character row carries them (#934). */
  capabilities: string[];
}

export interface ProjectionInput {
  rows: ClassRowInfo[];
  /** The existing row this level is taken in, or null when it adds a class. */
  chosenRowId: string | null;
  /** The class a new-class level adds; `startLevels` is the level its row will hold. */
  newClass: { className: string; classFeatures: FeatureMap | null; startLevels: number; capabilities: string[] } | null;
  /** The subclass picked at this level, for the chosen or the new class. */
  pickedSubclass: { name: string; features: FeatureMap | null } | null;
}

function asInput(row: ClassRowInfo): GrantedClassInput {
  return {
    className: row.className,
    subclassName: row.subclassName,
    levels: row.levels,
    classMap: row.classFeatures,
    subclassMap: row.subclassFeatures,
  };
}

export function projectClasses(input: ProjectionInput): { before: GrantedClassInput[]; after: GrantedClassInput[] } {
  const before = input.rows.map(asInput);
  const after = input.rows.map((row): GrantedClassInput => {
    if (row.id !== input.chosenRowId) return asInput(row);
    const picked = input.pickedSubclass;
    return {
      ...asInput(row),
      levels: row.levels + 1,
      ...(picked === null ? {} : { subclassName: picked.name, subclassMap: picked.features }),
    };
  });
  if (input.newClass !== null) {
    const picked = input.pickedSubclass;
    after.push({
      className: input.newClass.className,
      subclassName: picked === null ? null : picked.name,
      levels: input.newClass.startLevels,
      classMap: input.newClass.classFeatures,
      subclassMap: picked === null ? null : picked.features,
    });
  }
  return { before, after };
}

/**
 * The class rows once this level is taken, as Wild Shape reads them (#934): each
 * row's definition capabilities with the projected levels and subclass. Mirrors
 * `projectClasses`, so a character taking a first druid level, or one more, is a
 * druid at the level they are about to hold.
 */
export function projectWildShapeRows(
  input: ProjectionInput,
): { capabilities: string[]; subclass_name: string | null; levels: number }[] {
  const picked = input.pickedSubclass;
  const rows = input.rows.map((row) => {
    if (row.id !== input.chosenRowId) {
      return { capabilities: row.capabilities, subclass_name: row.subclassName, levels: row.levels };
    }
    return {
      capabilities: row.capabilities,
      subclass_name: picked === null ? row.subclassName : picked.name,
      levels: row.levels + 1,
    };
  });
  if (input.newClass !== null) {
    rows.push({
      capabilities: input.newClass.capabilities,
      subclass_name: picked === null ? null : picked.name,
      levels: input.newClass.startLevels,
    });
  }
  return rows;
}

/** Class and subclass features the chosen class gains at `classLevel`, each once. */
export function gainedAtLevel(granted: GrantedFeature[], className: string, classLevel: number): GrantedFeature[] {
  const seen = new Set<string>();
  const out: GrantedFeature[] = [];
  for (const g of granted) {
    if (g.grant.kind === "feat" || g.grant.className !== className) continue;
    if (!g.grant.levelsGained.includes(classLevel) || seen.has(g.feature.id)) continue;
    seen.add(g.feature.id);
    out.push(g);
  }
  return out;
}

export interface ScalingChange {
  featureId: string;
  featureName: string;
  label: string;
  from: string | null;
  to: string;
}

/** Features whose class-table value (Sneak Attack dice, Rage damage) differs once the level is taken. */
export function scalingChanges(before: GrantedFeature[], after: GrantedFeature[]): ScalingChange[] {
  const earlier = new Map(before.map((g) => [g.feature.id, g]));
  const out: ScalingChange[] = [];
  const seen = new Set<string>();
  for (const g of after) {
    if (g.scalingValue === null || g.mechanics.scaling === undefined || seen.has(g.feature.id)) continue;
    seen.add(g.feature.id);
    const was = earlier.get(g.feature.id);
    const from = was === undefined ? null : was.scalingValue;
    if (from === g.scalingValue) continue;
    out.push({
      featureId: g.feature.id,
      featureName: g.feature.name,
      label: g.mechanics.scaling.label,
      from,
      to: g.scalingValue,
    });
  }
  return out;
}

export interface PoolChange {
  key: string;
  label: string;
  from: number | "unlimited" | null;
  to: number | "unlimited";
}

/** Pools whose maximum differs between two states; a pool that did not exist before has `from: null`. */
export function poolChanges(before: ResourcePool[], after: ResourcePool[]): PoolChange[] {
  const earlier = new Map(before.map((p) => [p.key, p]));
  const out: PoolChange[] = [];
  for (const pool of after) {
    const was = earlier.get(pool.key);
    if (was !== undefined && was.max === pool.max) continue;
    out.push({ key: pool.key, label: pool.label, from: was === undefined ? null : was.max, to: pool.max });
  }
  return out;
}

/** The class list once a level is taken back: the row loses one level (and vanishes at none), and its subclass goes with the level that chose it. */
export function lowerClasses(rows: ClassRowInfo[], classRowId: string, clearSubclass: boolean): GrantedClassInput[] {
  return rows
    .map((row): ClassRowInfo => {
      if (row.id !== classRowId) return row;
      return {
        ...row,
        levels: row.levels - 1,
        ...(clearSubclass ? { subclassName: null, subclassFeatures: null } : {}),
      };
    })
    .filter((row) => row.levels > 0)
    .map(asInput);
}
