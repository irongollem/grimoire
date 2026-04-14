/**
 * Ensures every named class feature exists in the class_features table.
 * Inserts any missing ones as passive open5e_import features.
 * Returns a Map<lowercaseName, uuid> for all requested names.
 */
import { supabase, getCurrentUser } from "@/lib/supabase";

export async function ensureClassFeatures(
  /** Map of feature name → source label (e.g. "Black Flag SRD") */
  neededFeatures: Map<string, string>,
): Promise<Map<string, string>> {
  const featureNameToId = new Map<string, string>();
  const allNeeded = [...neededFeatures.keys()];
  if (allNeeded.length === 0) return featureNameToId;

  const user = getCurrentUser();

  // Load existing in chunks to stay under Supabase URL length limits
  const CHUNK = 200;
  for (let i = 0; i < allNeeded.length; i += CHUNK) {
    const { data } = await supabase
      .from("class_features")
      .select("id, name")
      .in("name", allNeeded.slice(i, i + CHUNK));
    for (const f of data ?? []) {
      featureNameToId.set(f.name.toLowerCase(), f.id);
    }
  }

  // Insert any that don't exist yet
  const toCreate = allNeeded.filter(n => !featureNameToId.has(n.toLowerCase()));
  if (toCreate.length > 0) {
    const rows = toCreate.map(name => ({
      name,
      feature_type: "passive" as const,
      open5e_import: true,
      source: neededFeatures.get(name) ?? "Open5e",
      description: null,
      campaign_id: null,
      prerequisite: null,
      tags: [] as string[],
      user_id: user!.id,
    }));

    const BATCH = 100;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { data: inserted, error } = await supabase
        .from("class_features")
        .insert(rows.slice(i, i + BATCH))
        .select("id, name");
      if (error) throw error;
      for (const f of inserted ?? []) {
        featureNameToId.set(f.name.toLowerCase(), f.id);
      }
    }
  }

  return featureNameToId;
}

/** Collect all feature names across all previews into a name→source map */
export function collectFeatureNames(
  previews: { featureNamesByLevel: Record<string, string[]>; source: string }[],
): Map<string, string> {
  const needed = new Map<string, string>();
  for (const p of previews) {
    for (const names of Object.values(p.featureNamesByLevel)) {
      for (const name of names) {
        if (!needed.has(name)) needed.set(name, p.source || "Open5e");
      }
    }
  }
  return needed;
}
