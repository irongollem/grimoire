import { fetchAllFromDocuments, fetchSupported5eDocumentKeys } from "@/lib/library/open5eApi";
import type { Open5eDocumentRef } from "@/lib/library/open5eApi";

// The Open5e v2 `/v2/feats/` shape and its fetch. See officialClassContent.ts
// for what is done with the records.

export interface Open5eV2Feat {
  key: string;
  name: string;
  desc: string;
  prerequisite: string;
  /** "Origin", "General", "Fighting Style", "Epic Boon" in 2024; "GENERAL" in the 2014 SRD. */
  type: string | null;
  benefits: Array<{ desc: string }>;
  document: Open5eDocumentRef;
}

const V2_FEATS = "https://api.open5e.com/v2/feats/";

/** Native V2 identity means equal names from different documents remain distinct. */
export async function fetchOpen5eFeats(): Promise<Open5eV2Feat[]> {
  const documentKeys = await fetchSupported5eDocumentKeys();
  return fetchAllFromDocuments<Open5eV2Feat>(V2_FEATS, documentKeys);
}
