import type { ClassFeatureInsert } from "@/types/feature.types";

/** One feature a class or subclass grants: a row to create, or an existing one to point at. */
export type FeatureBatchItem = { insert: ClassFeatureInsert } | { existingId: string };

export interface FeatureBatchOps<Parent> {
  createFeature: (insert: ClassFeatureInsert) => Promise<{ id: string }>;
  deleteFeature: (id: string) => Promise<void>;
  /** Writes the class or subclass row, given every feature id (created or existing) in draft order. */
  createParent: (featureIds: string[]) => Promise<Parent>;
}

/**
 * A generated class or subclass is several rows: the feature rows it points at,
 * then the row that holds their ids. An item that names an existing row (the
 * official Ability Score Improvement) creates nothing. If any write fails, the
 * feature rows already created are deleted so nothing is left orphaned, and the
 * original error is rethrown. Existing rows are never deleted.
 */
export async function createWithFeatures<Parent>(
  features: readonly FeatureBatchItem[],
  ops: FeatureBatchOps<Parent>,
): Promise<Parent> {
  const created: string[] = [];
  const ids: string[] = [];
  try {
    for (const item of features) {
      if ("existingId" in item) {
        ids.push(item.existingId);
        continue;
      }
      const row = await ops.createFeature(item.insert);
      created.push(row.id);
      ids.push(row.id);
    }
    return await ops.createParent(ids);
  } catch (e) {
    await Promise.allSettled(created.map((id) => ops.deleteFeature(id)));
    throw e;
  }
}
