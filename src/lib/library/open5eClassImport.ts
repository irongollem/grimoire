import { fetchAllFromDocuments, fetchSupported5eDocumentKeys } from "@/lib/library/open5eApi";
import type { Open5eDocumentRef } from "@/lib/library/open5eApi";

// The Open5e v2 `/v2/classes/` shape and its fetch. What becomes of the records
// (rows, identity, mechanics) is decided in officialClassContent.ts; this file
// only reaches Open5e, so the plan stays pure and testable.

export interface Open5eV2ClassFeature {
  key: string;
  name: string;
  desc: string;
  /** Only CLASS_LEVEL_FEATURE entries are features a class grants at a level. */
  feature_type: string;
  /** Every level the feature is gained at, e.g. an Ability Score Improvement at 4, 8, 12. */
  gained_at: { level: number; detail: string | null }[];
}

export interface Open5eV2Class {
  key: string;
  name: string;
  desc: string;
  /** "D10", "D8" etc, or null for subclasses that inherit from the parent. */
  hit_dice: string | null;
  /** API returns objects with name+url, not plain strings */
  saving_throws: { name: string; url: string }[];
  subclass_of: { key: string; name: string } | null;
  document: Open5eDocumentRef;
  features: Open5eV2ClassFeature[];
}

const V2_CLASSES = "https://api.open5e.com/v2/classes/";

/** Every class and subclass of every redistributable 5e document. */
export async function fetchOpen5eClasses(): Promise<Open5eV2Class[]> {
  const documentKeys = await fetchSupported5eDocumentKeys();
  return fetchAllFromDocuments<Open5eV2Class>(V2_CLASSES, documentKeys);
}
