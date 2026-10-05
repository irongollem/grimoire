import type { ClassFeature } from "@/types/feature.types";

/**
 * Feats share the `class_features` table with class and subclass features;
 * nothing but their identity tells them apart. The Open5e importer
 * (`open5eFeatImport.ts`) keys a feat `<document>_<slug>` with no class
 * segment, whereas the class importer keys a feature `<document>_<class>_<slug>`
 * (`srd-2024_paladin_aura-of-courage`). Legacy migrated rows (`legacy:`) are
 * class features by construction.
 */
const FEAT_RECORD_KEY = /^[a-z0-9-]+_[^_]+$/;

export function isFeat(feature: Pick<ClassFeature, "source_record_key">): boolean {
  const key = feature.source_record_key;
  if (!key || key.startsWith("legacy:")) return false;
  return FEAT_RECORD_KEY.test(key);
}

/** Feats matching a search term, by name. The list is already edition-scoped by its source query. */
export function filterFeats(features: readonly ClassFeature[], search: string): ClassFeature[] {
  const term = search.toLowerCase().trim();
  return features.filter(f => isFeat(f) && (!term || f.name.toLowerCase().includes(term)));
}
