import type { ClassFeatureInsert } from "@/types/feature.types";

export interface FeatureBatchOps<Parent> {
  createFeature: (insert: ClassFeatureInsert) => Promise<{ id: string }>;
  deleteFeature: (id: string) => Promise<void>;
  /** Writes the class or subclass row, given the new feature ids in draft order. */
  createParent: (featureIds: string[]) => Promise<Parent>;
}

/**
 * A generated class or subclass is several rows: the feature rows it points at,
 * then the row that holds their ids. If any write fails, the feature rows already
 * created are deleted so nothing is left orphaned, and the original error is rethrown.
 */
export async function createWithFeatures<Parent>(
  features: readonly ClassFeatureInsert[],
  ops: FeatureBatchOps<Parent>,
): Promise<Parent> {
  const created: string[] = [];
  try {
    for (const insert of features) {
      const row = await ops.createFeature(insert);
      created.push(row.id);
    }
    return await ops.createParent(created);
  } catch (e) {
    await Promise.allSettled(created.map((id) => ops.deleteFeature(id)));
    throw e;
  }
}
